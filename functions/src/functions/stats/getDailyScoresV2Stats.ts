/**
 * Cloud Function to get per-difficulty stats for dailyScoresV2.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, logger, getAppCheckConfig } from "../../config.js";
import { DifficultyLevel } from "../../../../shared/types.js";
import { DailyScoresV2Document } from "../../firestoreTypes.js";

export const getDailyScoresV2Stats = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        const userId = request.auth?.uid || "guest/unauthenticated";
        const puzzleId = request.data?.puzzleId as string | undefined;
        logger.info(`getDailyScoresV2Stats invoked by: ${userId} for puzzleId: ${puzzleId}`);

        if (!puzzleId) {
            throw new HttpsError("invalid-argument", "puzzleId is required.");
        }

        const diffKeys: DifficultyLevel[] = [
            DifficultyLevel.Easy,
            DifficultyLevel.Medium,
            DifficultyLevel.Hard,
        ];

        try {
            const baseRef = db.collection("dailyScoresV2").doc(puzzleId);
            const baseSnap = await baseRef.get();
            const baseData: DailyScoresV2Document = baseSnap.exists ? (baseSnap.data() as DailyScoresV2Document) : {};

            const result: Record<string, { lowestScore: number | null; totalPlayers: number; playersWithLowestScore: number; averageScore: number | null }> = {};

            // Compute directly from the main document map (ensures averageScore is included)
            for (const diff of diffKeys) {
                const diffMap = (baseData && typeof baseData[diff] === 'object') ? (baseData[diff] as Record<string, number>) : {};
                let lowestScore: number | null = null;
                let totalPlayers = 0;
                let playersWithLowestScore = 0;
                let sumScores = 0;

                for (const [, val] of Object.entries(diffMap)) {
                    const moves = typeof val === 'number' ? val : null;
                    if (moves === null || isNaN(moves)) continue;
                    totalPlayers += 1;
                    sumScores += moves;
                    if (lowestScore === null || moves < lowestScore) {
                        lowestScore = moves;
                        playersWithLowestScore = 1;
                    } else if (lowestScore !== null && moves === lowestScore) {
                        playersWithLowestScore += 1;
                    }
                }

                const averageScore = totalPlayers > 0 ? (sumScores / totalPlayers) : null;
                result[diff] = { lowestScore, totalPlayers, playersWithLowestScore, averageScore };
            }

            return { success: true, stats: result };
        } catch (e) {
            logger.error('getDailyScoresV2Stats: error computing stats', e);
            throw new HttpsError('internal', 'Failed to fetch dailyScoresV2 stats');
        }
    }
);
