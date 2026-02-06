/**
 * Cloud Function to get Win Modal Stats for the user.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, logger, getAppCheckConfig } from "../../config.js";
import {
    UserPuzzleDocument,
    LevelAgnosticLeaderboardDoc,
    DifficultyLeaderboardDoc,
    PuzzleDifficultyEntry,
} from "../../firestoreTypes.js";

interface GetWinModalStatsRequest {
    puzzleId: string;
}

export const getWinModalStats = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;
        const { puzzleId } = (request.data || {}) as GetWinModalStatsRequest;
        if (!puzzleId) {
            throw new HttpsError("invalid-argument", "puzzleId is required.");
        }

        try {
            const userHistoryRef = db.collection("userPuzzleHistory").doc(userId);
            const puzzleRef = userHistoryRef.collection("puzzles").doc(puzzleId);
            const levelAgnosticRef = userHistoryRef.collection("leaderboard").doc("levelAgnostic");
            const easyRef = userHistoryRef.collection("leaderboard").doc("easy");
            const mediumRef = userHistoryRef.collection("leaderboard").doc("medium");
            const hardRef = userHistoryRef.collection("leaderboard").doc("hard");

            const [puzzleSnap, laSnap, easySnap, mediumSnap, hardSnap] = await Promise.all([
                puzzleRef.get(),
                levelAgnosticRef.get(),
                easyRef.get(),
                mediumRef.get(),
                hardRef.get(),
            ]);

            const puzzleData = puzzleSnap.exists ? puzzleSnap.data() as UserPuzzleDocument : null;
            const laData: LevelAgnosticLeaderboardDoc = laSnap.exists ? (laSnap.data() as LevelAgnosticLeaderboardDoc) : {};

            const currentPuzzleCompletedStreak = typeof laData.currentPuzzleCompletedStreak === 'number'
                ? laData.currentPuzzleCompletedStreak
                : null;

            const lastPuzzleCompletedDate = typeof laData.lastPuzzleCompletedDate === 'string'
                ? laData.lastPuzzleCompletedDate
                : null;

            const buildDifficultyStats = (difficultySnap: FirebaseFirestore.DocumentSnapshot, difficulty: string) => {
                const dData: DifficultyLeaderboardDoc = difficultySnap.exists ? (difficultySnap.data() as DifficultyLeaderboardDoc) : {};
                const difficultyData = puzzleData?.[difficulty] as PuzzleDifficultyEntry | undefined;

                return {
                    lastTieBotDate: typeof dData.lastTieBotDate === 'string' ? dData.lastTieBotDate : null,
                    currentTieBotStreak: typeof dData.currentTieBotStreak === 'number' ? dData.currentTieBotStreak : null,
                    lastFirstTryDate: typeof dData.lastFirstTryDate === 'string' ? dData.lastFirstTryDate : null,
                    currentFirstTryStreak: typeof dData.currentFirstTryStreak === 'number' ? dData.currentFirstTryStreak : null,
                    attempts: difficultyData && typeof difficultyData.attempts === 'number' ? difficultyData.attempts : null,
                };
            };

            return {
                success: true,
                stats: {
                    lastPuzzleCompletedDate,
                    currentPuzzleCompletedStreak,
                    easy: buildDifficultyStats(easySnap, 'easy'),
                    medium: buildDifficultyStats(mediumSnap, 'medium'),
                    hard: buildDifficultyStats(hardSnap, 'hard'),
                }
            };
        } catch (e) {
            logger.error('getWinModalStats: failed to build stats', e);
            throw new HttpsError('internal', 'Failed to fetch win modal stats');
        }
    }
);
