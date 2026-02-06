/**
 * Scheduled Cloud Function to pre-compute leaderboard snapshots.
 * Runs every 4 hours. Performs a single collection group scan and stores
 * the top entries for all 16 leaderboard combinations in leaderboards/.
 * This avoids the expensive full scan on every getGlobalLeaderboardV2 request.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, admin, logger } from "../../config.js";
import { DifficultyLevel } from "../../../../shared/types.js";
import { computeEloAggregates } from "../../helpers.js";

// Leaderboard configuration for all combinations
interface LeaderboardConfig {
    key: string; // Snapshot document ID
    fieldPath: string;
    targetDocId: string; // "levelAgnostic" | "easy" | "medium" | "hard"
    checkCurrent: boolean;
    currentFieldPath: string | null;
}

// Snapshot entry stored in pre-computed leaderboard documents (without display name for compact storage)
interface LeaderboardSnapshotEntry {
    userId: string;
    value: number;
    currentValue?: number; // For streaks: current streak value
}

/**
 * Build the full list of all leaderboard configurations (16 combinations).
 */
function getAllLeaderboardConfigs(): LeaderboardConfig[] {
    const configs: LeaderboardConfig[] = [];

    // Score leaderboards (levelAgnostic)
    for (const sub of ['last7', 'last30', 'allTime'] as const) {
        configs.push({
            key: `score_${sub}`,
            fieldPath: sub === 'last7' ? 'eloScoreLast7' : sub === 'last30' ? 'eloScoreLast30' : 'eloScoreAllTime',
            targetDocId: 'levelAgnostic',
            checkCurrent: false,
            currentFieldPath: null,
        });
    }

    // Goals leaderboards (per difficulty)
    for (const diff of [DifficultyLevel.Easy, DifficultyLevel.Medium, DifficultyLevel.Hard]) {
        for (const sub of ['beaten', 'matched'] as const) {
            configs.push({
                key: `goals_${sub}_${diff}`,
                fieldPath: sub === 'beaten' ? 'goalsBeaten' : 'goalsAchieved',
                targetDocId: diff,
                checkCurrent: false,
                currentFieldPath: null,
            });
        }
    }

    // Streaks leaderboards
    for (const diff of [DifficultyLevel.Easy, DifficultyLevel.Medium, DifficultyLevel.Hard]) {
        // firstTry (per difficulty)
        configs.push({
            key: `streaks_firstTry_${diff}`,
            fieldPath: 'longestFirstTryStreak',
            targetDocId: diff,
            checkCurrent: true,
            currentFieldPath: 'currentFirstTryStreak',
        });
        // goalAchieved (per difficulty)
        configs.push({
            key: `streaks_goalAchieved_${diff}`,
            fieldPath: 'longestTieBotStreak',
            targetDocId: diff,
            checkCurrent: true,
            currentFieldPath: 'currentTieBotStreak',
        });
    }

    // puzzleCompleted (levelAgnostic)
    configs.push({
        key: 'streaks_puzzleCompleted',
        fieldPath: 'longestPuzzleCompletedStreak',
        targetDocId: 'levelAgnostic',
        checkCurrent: true,
        currentFieldPath: 'currentPuzzleCompletedStreak',
    });

    return configs;
}

export const precomputeLeaderboards = onSchedule(
    {
        schedule: "0 */4 * * *", // Every 4 hours
        timeZone: "UTC",
        memory: "512MiB",
        timeoutSeconds: 300,
    },
    async () => {
        logger.info("precomputeLeaderboards: Starting execution");

        try {
            const configs = getAllLeaderboardConfigs();

            // Single collection group scan — the expensive operation, done once
            const allLeaderboardDocs = await db.collectionGroup("leaderboard").get();
            logger.info(`precomputeLeaderboards: Fetched ${allLeaderboardDocs.size} leaderboard documents`);

            // Extract userId from doc path: userPuzzleHistory/{uid}/leaderboard/{docId}
            const getUserIdFromDoc = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
                const userDoc = doc.ref.parent.parent;
                return userDoc ? userDoc.id : undefined;
            };

            // Group docs by their document ID for fast lookup
            const docsByTargetId = new Map<string, Array<{ userId: string; data: Record<string, unknown> }>>();
            allLeaderboardDocs.forEach(doc => {
                const userId = getUserIdFromDoc(doc);
                if (!userId) return;
                const existing = docsByTargetId.get(doc.id) || [];
                existing.push({ userId, data: doc.data() as Record<string, unknown> });
                docsByTargetId.set(doc.id, existing);
            });

            // Collect all userIds that will appear in any top-100 for batch display name fetch
            const allTopUserIds = new Set<string>();

            // Process each leaderboard config
            // Store full data per config: top 100 entries, userRanks map, and total count
            const snapshots = new Map<string, {
                top100: LeaderboardSnapshotEntry[];
                userRanks: Record<string, number>;
                totalEntries: number;
            }>();

            const today = new Date();

            for (const config of configs) {
                const docs = docsByTargetId.get(config.targetDocId) || [];
                const entries: LeaderboardSnapshotEntry[] = [];

                const isScoreConfig = config.key.startsWith('score_');

                for (const { userId, data } of docs) {
                    let value: number | null;

                    if (isScoreConfig && data['eloScoreByDay'] && typeof data['eloScoreByDay'] === 'object') {
                        // Recompute from eloScoreByDay so old scores fall off the 7/30-day windows
                        const aggregates = computeEloAggregates(
                            data['eloScoreByDay'] as Record<string, unknown>,
                            today
                        );
                        value = aggregates[config.fieldPath as keyof typeof aggregates];
                    } else {
                        value = typeof data[config.fieldPath] === 'number' ? (data[config.fieldPath] as number) : null;
                    }

                    if (value === null || isNaN(value) || value === 0) continue;

                    const entry: LeaderboardSnapshotEntry = { userId, value };
                    if (config.checkCurrent && config.currentFieldPath) {
                        const currentValue = typeof data[config.currentFieldPath] === 'number'
                            ? (data[config.currentFieldPath] as number) : undefined;
                        if (currentValue !== undefined) {
                            entry.currentValue = currentValue;
                        }
                    }
                    entries.push(entry);
                }

                // Sort descending by value
                entries.sort((a, b) => b.value - a.value);

                // Count total and build rank map BEFORE slicing to top 100
                const totalEntries = entries.length;
                const userRanks: Record<string, number> = {};
                for (let i = 0; i < entries.length; i++) {
                    userRanks[entries[i].userId] = i + 1;
                }

                if (totalEntries > 10000) {
                    logger.warn(`precomputeLeaderboards: Large userRanks map for '${config.key}': ${totalEntries} entries. Consider pagination if this exceeds 1MiB doc limit.`);
                }

                // Keep top 100 for the entries array stored in the snapshot
                const top100 = entries.slice(0, 100);
                snapshots.set(config.key, { top100, userRanks, totalEntries });

                // Track userIds for display name resolution
                for (const e of top100) {
                    allTopUserIds.add(e.userId);
                }
            }

            // Batch fetch display names for all users across all snapshots
            const userDisplayNames = new Map<string, string>();
            const userIdArray = Array.from(allTopUserIds);

            for (let i = 0; i < userIdArray.length; i += 100) {
                const chunk = userIdArray.slice(i, i + 100);
                try {
                    const userRecords = await admin.auth().getUsers(
                        chunk.map(uid => ({ uid }))
                    );
                    userRecords.users.forEach(user => {
                        userDisplayNames.set(
                            user.uid,
                            user.displayName || `User_${user.uid.substring(0, 6)}`
                        );
                    });
                    userRecords.notFound.forEach(userIdentifier => {
                        if ('uid' in userIdentifier) {
                            const uid = userIdentifier.uid;
                            userDisplayNames.set(uid, `User_${uid.substring(0, 6)}`);
                        }
                    });
                } catch (authError) {
                    logger.error("precomputeLeaderboards: Error fetching display names batch", authError);
                }
            }

            // Write all snapshots to Firestore
            const batch = db.batch();
            for (const [key, { top100, userRanks, totalEntries }] of snapshots) {
                const snapshotRef = db.collection("leaderboards").doc(key);
                batch.set(snapshotRef, {
                    entries: top100.map(e => ({
                        userId: e.userId,
                        username: userDisplayNames.get(e.userId) || `User_${e.userId.substring(0, 6)}`,
                        value: e.value,
                        ...(e.currentValue !== undefined ? { currentValue: e.currentValue } : {}),
                    })),
                    userRanks,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    totalEntries,
                });
            }
            await batch.commit();

            logger.info(`precomputeLeaderboards: Successfully wrote ${snapshots.size} leaderboard snapshots`);

        } catch (error) {
            logger.error("precomputeLeaderboards: Fatal error during execution:", error);
            throw error;
        }
    }
);
