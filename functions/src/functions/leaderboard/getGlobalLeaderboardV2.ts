/**
 * Cloud Function to get Global Leaderboard V2 (userPuzzleHistory-based).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, admin, logger, getAppCheckConfig } from "../../config.js";
import { DifficultyLevel } from "../../../../shared/types.js";
import { normalizeDifficulty, computeEloAggregates } from "../../helpers.js";

interface GetGlobalLeaderboardV2Request {
    category: 'score' | 'goals' | 'streaks';
    subcategory: string; // e.g., 'last7', 'last30', 'allTime', 'beaten', 'matched', 'firstTry', 'goalAchieved', 'puzzleCompleted'
    difficulty?: DifficultyLevel | "easy" | "medium" | "hard";
}

interface LeaderboardEntryV2 {
    userId: string;
    username: string;
    value: number;
    rank: number;
    isCurrent?: boolean; // For streaks, indicates if current equals longest
}

/**
 * Resolve the Firestore field paths for a given leaderboard category/subcategory.
 */
function getLeaderboardFieldPaths(category: string, subcategory: string): { fieldPath: string; currentFieldPath: string | null } {
    if (category === 'score') {
        const fieldPath = subcategory === 'last7' ? 'eloScoreLast7' : subcategory === 'last30' ? 'eloScoreLast30' : 'eloScoreAllTime';
        return { fieldPath, currentFieldPath: null };
    } else if (category === 'goals') {
        return { fieldPath: subcategory === 'beaten' ? 'goalsBeaten' : 'goalsAchieved', currentFieldPath: null };
    } else {
        if (subcategory === 'firstTry') return { fieldPath: 'longestFirstTryStreak', currentFieldPath: 'currentFirstTryStreak' };
        if (subcategory === 'goalAchieved') return { fieldPath: 'longestTieBotStreak', currentFieldPath: 'currentTieBotStreak' };
        return { fieldPath: 'longestPuzzleCompletedStreak', currentFieldPath: 'currentPuzzleCompletedStreak' };
    }
}

/**
 * Look up the requesting user's rank from a pre-computed snapshot.
 * Returns undefined if the user is a guest, already in the top 10, or not found.
 */
async function resolveRequesterFromSnapshot(
    requesterId: string,
    snapshotEntries: Array<{ userId: string; username: string; value: number; currentValue?: number }>,
    userRanks: Record<string, number>,
    checkCurrent: boolean,
    category: string,
    subcategory: string,
    normalizedDifficulty: string | null,
): Promise<LeaderboardEntryV2 | undefined> {
    if (requesterId === "guest/unauthenticated") return undefined;

    // Already in the top 10 -- shown in the main leaderboard, no separate entry needed
    if (snapshotEntries.slice(0, 10).some(e => e.userId === requesterId)) return undefined;

    // In the stored entries (top 100) -- use snapshot data directly
    const inEntries = snapshotEntries.findIndex(e => e.userId === requesterId);
    if (inEntries >= 0) {
        const entry = snapshotEntries[inEntries];
        return {
            userId: entry.userId,
            username: entry.username,
            value: entry.value,
            rank: inEntries + 1,
            isCurrent: checkCurrent && entry.currentValue !== undefined ? entry.currentValue === entry.value : undefined,
        };
    }

    // Ranked 101+ -- do a point read for their value and display name
    if (userRanks[requesterId] === undefined) return undefined;

    const requesterRank = userRanks[requesterId];
    const isLevelAgnostic = category === 'score'
        || (category === 'streaks' && subcategory === 'puzzleCompleted')
        || !normalizedDifficulty;
    const targetDocId = isLevelAgnostic ? 'levelAgnostic' : normalizedDifficulty;

    try {
        const [requesterDoc, requesterAuth] = await Promise.all([
            db.doc(`userPuzzleHistory/${requesterId}/leaderboard/${targetDocId}`).get(),
            admin.auth().getUser(requesterId),
        ]);

        if (!requesterDoc.exists) return undefined;

        const requesterData = requesterDoc.data() as Record<string, unknown>;
        const { fieldPath, currentFieldPath } = getLeaderboardFieldPaths(category, subcategory);

        const value = typeof requesterData[fieldPath] === 'number' ? (requesterData[fieldPath] as number) : 0;
        const displayName = requesterAuth.displayName || `User_${requesterId.substring(0, 6)}`;

        let isCurrent: boolean | undefined;
        if (checkCurrent && currentFieldPath) {
            const cv = typeof requesterData[currentFieldPath] === 'number' ? (requesterData[currentFieldPath] as number) : undefined;
            isCurrent = cv !== undefined ? cv === value : undefined;
        }

        return {
            userId: requesterId,
            username: displayName,
            value,
            rank: requesterRank,
            isCurrent,
        };
    } catch (pointReadError) {
        logger.warn(`getGlobalLeaderboardV2: Failed point read for requester ${requesterId}`, pointReadError);
        return undefined;
    }
}

export const getGlobalLeaderboardV2 = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 30,
        ...getAppCheckConfig(),
    },
    async (request) => {
        const requesterId = request.auth?.uid || "guest/unauthenticated";
        const { category, subcategory, difficulty } = (request.data || {}) as GetGlobalLeaderboardV2Request;

        logger.info(`getGlobalLeaderboardV2 invoked by: ${requesterId}, category: ${category}, subcategory: ${subcategory}, difficulty: ${difficulty}`);

        if (!category || !subcategory) {
            throw new HttpsError("invalid-argument", "category and subcategory are required.");
        }

        // Validate category-specific requirements
        if ((category === 'goals' || category === 'streaks') && !difficulty) {
            throw new HttpsError("invalid-argument", "difficulty is required for goals and streaks categories.");
        }

        const normalizedDifficulty = difficulty ? normalizeDifficulty(difficulty) : null;

        try {
            // Determine snapshot key and whether we need streak current checking
            let snapshotKey: string;
            let checkCurrent = false;

            if (category === 'score') {
                if (!['last7', 'last30', 'allTime'].includes(subcategory)) {
                    throw new HttpsError("invalid-argument", `Invalid score subcategory: ${subcategory}`);
                }
                snapshotKey = `score_${subcategory}`;
            } else if (category === 'goals' && normalizedDifficulty) {
                if (!['beaten', 'matched'].includes(subcategory)) {
                    throw new HttpsError("invalid-argument", `Invalid goals subcategory: ${subcategory}`);
                }
                snapshotKey = `goals_${subcategory}_${normalizedDifficulty}`;
            } else if (category === 'streaks') {
                if (!['firstTry', 'goalAchieved', 'puzzleCompleted'].includes(subcategory)) {
                    throw new HttpsError("invalid-argument", `Invalid streaks subcategory: ${subcategory}`);
                }
                checkCurrent = true;
                if (subcategory === 'puzzleCompleted') {
                    snapshotKey = 'streaks_puzzleCompleted';
                } else if (normalizedDifficulty) {
                    snapshotKey = `streaks_${subcategory}_${normalizedDifficulty}`;
                } else {
                    throw new HttpsError("invalid-argument", "difficulty is required for this streaks subcategory.");
                }
            } else {
                throw new HttpsError("invalid-argument", "Invalid category or missing difficulty.");
            }

            // Try to read from pre-computed snapshot (single document read)
            const snapshotRef = db.collection("leaderboards").doc(snapshotKey);
            const snapshotDoc = await snapshotRef.get();

            if (snapshotDoc.exists) {
                const snapshotData = snapshotDoc.data()!;
                const snapshotEntries = snapshotData.entries as Array<{
                    userId: string;
                    username: string;
                    value: number;
                    currentValue?: number;
                }>;
                const userRanks = (snapshotData.userRanks || {}) as Record<string, number>;

                const leaderboard: LeaderboardEntryV2[] = snapshotEntries.slice(0, 10).map((entry, index) => ({
                    userId: entry.userId,
                    username: entry.username,
                    value: entry.value,
                    rank: index + 1,
                    isCurrent: checkCurrent && entry.currentValue !== undefined ? entry.currentValue === entry.value : undefined,
                }));

                const requesterEntry = await resolveRequesterFromSnapshot(
                    requesterId, snapshotEntries, userRanks, checkCurrent,
                    category, subcategory, normalizedDifficulty,
                );

                logger.info(`getGlobalLeaderboardV2: Served from snapshot '${snapshotKey}', ${leaderboard.length} entries, requester: ${!!requesterEntry}`);
                return { success: true, leaderboard, requesterEntry };
            }

            // --- Fallback: no snapshot exists yet, do full collection group scan ---
            logger.warn(`getGlobalLeaderboardV2: No snapshot for '${snapshotKey}', falling back to full scan`);

            const { fieldPath, currentFieldPath } = getLeaderboardFieldPaths(category, subcategory);

            let targetDocId: string;
            if (category === 'score' || (category === 'streaks' && subcategory === 'puzzleCompleted')) {
                targetDocId = "levelAgnostic";
            } else if (normalizedDifficulty) {
                targetDocId = normalizedDifficulty;
            } else {
                throw new HttpsError("internal", "Failed to determine target document.");
            }

            const allLeaderboardDocs = await db.collectionGroup("leaderboard").get();
            const entries: Array<{ userId: string; value: number; currentValue?: number }> = [];

            allLeaderboardDocs.forEach(doc => {
                if (doc.id !== targetDocId) return;
                const userDoc = doc.ref.parent.parent;
                const userId = userDoc ? userDoc.id : undefined;
                if (!userId) return;

                const data = doc.data() as Record<string, unknown>;
                const value = typeof data[fieldPath] === 'number' ? (data[fieldPath] as number) : null;
                if (value === null || isNaN(value) || value === 0) return;

                const entry: { userId: string; value: number; currentValue?: number } = { userId, value };
                if (checkCurrent && currentFieldPath) {
                    const cv = typeof data[currentFieldPath] === 'number' ? (data[currentFieldPath] as number) : undefined;
                    if (cv !== undefined) entry.currentValue = cv;
                }
                entries.push(entry);
            });

            entries.sort((a, b) => b.value - a.value);
            const top10 = entries.slice(0, 10);

            let requesterEntry: LeaderboardEntryV2 | null = null;
            const requesterIndex = entries.findIndex(e => e.userId === requesterId);
            if (requesterIndex >= 10 && requesterId !== "guest/unauthenticated") {
                const entry = entries[requesterIndex];
                requesterEntry = {
                    userId: entry.userId,
                    username: '',
                    value: entry.value,
                    rank: requesterIndex + 1,
                    isCurrent: checkCurrent && entry.currentValue !== undefined ? entry.currentValue === entry.value : undefined,
                };
            }

            const userIdsToFetch = [...top10.map(e => e.userId)];
            if (requesterEntry) userIdsToFetch.push(requesterEntry.userId);

            const userDisplayNames = new Map<string, string>();
            try {
                for (let i = 0; i < userIdsToFetch.length; i += 100) {
                    const chunk = userIdsToFetch.slice(i, i + 100);
                    const userRecords = await admin.auth().getUsers(chunk.map(uid => ({ uid })));
                    userRecords.users.forEach(user => {
                        userDisplayNames.set(user.uid, user.displayName || `User_${user.uid.substring(0, 6)}`);
                    });
                    userRecords.notFound.forEach(id => {
                        if ('uid' in id) userDisplayNames.set(id.uid, `User_${id.uid.substring(0, 6)}`);
                    });
                }
            } catch (authError) {
                logger.error("getGlobalLeaderboardV2: Error fetching display names:", authError);
            }

            const leaderboard: LeaderboardEntryV2[] = top10.map((entry, index) => ({
                userId: entry.userId,
                username: userDisplayNames.get(entry.userId) || `User_${entry.userId.substring(0, 6)}`,
                value: entry.value,
                rank: index + 1,
                isCurrent: checkCurrent && entry.currentValue !== undefined ? entry.currentValue === entry.value : undefined,
            }));

            if (requesterEntry) {
                requesterEntry.username = userDisplayNames.get(requesterEntry.userId) || `User_${requesterEntry.userId.substring(0, 6)}`;
            }

            logger.info(`getGlobalLeaderboardV2: Fallback scan returning ${leaderboard.length} entries`);
            return { success: true, leaderboard, requesterEntry: requesterEntry || undefined };
        } catch (e) {
            logger.error('getGlobalLeaderboardV2: error building leaderboard', e);
            throw new HttpsError('internal', 'Failed to fetch leaderboard');
        }
    }
);
