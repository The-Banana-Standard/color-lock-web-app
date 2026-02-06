/**
 * Cloud Function to get Personal Stats for Stats Modal.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, logger, getAppCheckConfig } from "../../config.js";
import { DifficultyLevel } from "../../../../shared/types.js";
import {
    UserPuzzleDocument,
    LevelAgnosticLeaderboardDoc,
    DifficultyLeaderboardDoc,
    PuzzleDifficultyEntry,
} from "../../firestoreTypes.js";
import { normalizeDifficulty } from "../../helpers.js";

interface GetPersonalStatsRequest {
    puzzleId: string;
    difficulty: DifficultyLevel | "easy" | "medium" | "hard";
}

export const getPersonalStats = onCall(
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
        const { puzzleId, difficulty } = (request.data || {}) as GetPersonalStatsRequest;

        if (!puzzleId || !difficulty) {
            throw new HttpsError("invalid-argument", "puzzleId and difficulty are required.");
        }

        // If puzzleId and difficulty are provided, return puzzle-specific stats
        const normalizedDifficulty = normalizeDifficulty(difficulty);
        logger.info(`getPersonalStats invoked by: ${userId} for puzzle: ${puzzleId} on difficulty: ${normalizedDifficulty}`);

        try {
            const userHistoryRef = db.collection("userPuzzleHistory").doc(userId);
            const puzzleRef = userHistoryRef.collection("puzzles").doc(puzzleId);
            const levelAgnosticRef = userHistoryRef.collection("leaderboard").doc("levelAgnostic");
            const difficultyRef = userHistoryRef.collection("leaderboard").doc(normalizedDifficulty);

            const [puzzleSnap, laSnap, diffSnap] = await Promise.all([
                puzzleRef.get(),
                levelAgnosticRef.get(),
                difficultyRef.get(),
            ]);

            const puzzleData: UserPuzzleDocument = puzzleSnap.exists ? (puzzleSnap.data() as UserPuzzleDocument) : {};
            const laData: LevelAgnosticLeaderboardDoc = laSnap.exists ? (laSnap.data() as LevelAgnosticLeaderboardDoc) : {};
            const dData: DifficultyLeaderboardDoc = diffSnap.exists ? (diffSnap.data() as DifficultyLeaderboardDoc) : {};

            // Get difficulty-specific data
            const diffData = (puzzleData[normalizedDifficulty] || {}) as PuzzleDifficultyEntry;

            // Today's Game stats
            const todayStats = {
                bestEloScore: typeof laData.eloScoreByDay?.[puzzleId] === 'number'
                    ? laData.eloScoreByDay[puzzleId]
                    : null,
                difficultyAttempts: typeof diffData.attempts === 'number'
                    ? diffData.attempts
                    : null,
                fewestMoves: typeof diffData.moves === 'number'
                    ? diffData.moves
                    : null,
                bestDifficultyEloScore: typeof diffData.eloScore === 'number'
                    ? diffData.eloScore
                    : (typeof diffData.elo === 'number' ? diffData.elo : null),
                attemptsToTieGoal: typeof diffData.attemptToTieBot === 'number'
                    ? diffData.attemptToTieBot
                    : null,
                attemptsToBeatGoal: typeof diffData.attemptToBeatBot === 'number'
                    ? diffData.attemptToBeatBot
                    : null,
            };

            // All-time stats
            const allTimeStats = {
                currentPuzzleStreak: typeof laData.currentPuzzleCompletedStreak === 'number'
                    ? laData.currentPuzzleCompletedStreak
                    : null,
                currentGoalStreak: typeof dData.currentTieBotStreak === 'number'
                    ? dData.currentTieBotStreak
                    : null,
                currentFirstTryStreak: typeof dData.currentFirstTryStreak === 'number'
                    ? dData.currentFirstTryStreak
                    : null,
                gamesPlayed: typeof laData.puzzleAttempts === 'number'
                    ? laData.puzzleAttempts
                    : null,
                puzzlesSolved: typeof laData.puzzleSolved === 'number'
                    ? laData.puzzleSolved
                    : null,
                totalMoves: typeof laData.moves === 'number'
                    ? laData.moves
                    : null,
            };

            return {
                success: true,
                stats: {
                    today: todayStats,
                    allTime: allTimeStats,
                    difficulty: normalizedDifficulty,
                }
            };
        } catch (e) {
            logger.error('getPersonalStats: failed to fetch stats', e);
            throw new HttpsError('internal', 'Failed to fetch personal stats');
        }
    }
);
