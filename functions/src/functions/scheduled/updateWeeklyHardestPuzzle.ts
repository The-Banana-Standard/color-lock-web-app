/**
 * Scheduled Cloud Function to find and store the weekly hardest puzzle.
 * Runs every Monday at 9 AM UTC to analyze the previous week (Mon-Sun).
 *
 * Writes to: weeklyHardest/current
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, admin, logger } from "../../config.js";
import { DifficultyLevel } from "../../../../shared/types.js";
import { DateTime } from "luxon";

interface PuzzleHardnessResult {
    puzzleId: string;
    difficulty: DifficultyLevel;
    uniquePlayers: number;
    totalAttempts: number;
    countOfLowest: number;
    lowestScore: number;
    optimalHitPercentage: number;
    botMoves: number;
    averageScore: number;
    hardnessScore: number;
}

/**
 * Calculate hardness score for a puzzle/difficulty combination.
 * Higher score = harder puzzle.
 *
 * Formula: hardnessRatio = totalAttempts / countOfLowest
 * The puzzle with the highest ratio is the hardest (many attempts, few achieved optimal).
 */
function calculateHardnessScore(
    totalAttempts: number,
    countOfLowest: number
): number {
    if (countOfLowest === 0) return 0;

    // Core hardness ratio: total attempts / count of users who achieved lowest score
    const hardnessRatio = totalAttempts / countOfLowest;

    return Math.round(hardnessRatio * 100) / 100;
}

/**
 * Get week bounds (Monday to Sunday) for a given date.
 * Returns the Monday and Sunday of the week containing the target date.
 */
function getWeekBounds(targetDate: DateTime): { monday: DateTime; sunday: DateTime } {
    // Get Monday of the target week (weekday 1 = Monday in Luxon)
    const dayOfWeek = targetDate.weekday; // 1 = Monday, 7 = Sunday
    const monday = targetDate.minus({ days: dayOfWeek - 1 }).startOf("day");
    const sunday = monday.plus({ days: 6 }).startOf("day");

    return { monday, sunday };
}

export const updateWeeklyHardestPuzzle = onSchedule(
    {
        schedule: "0 9 * * MON",  // Every Monday at 9 AM UTC
        timeZone: "UTC",
        memory: "256MiB",
        timeoutSeconds: 300,
    },
    async () => {
        logger.info("updateWeeklyHardestPuzzle: Starting execution");

        try {
            // Calculate previous week's bounds (the week that just ended)
            const now = DateTime.utc();
            const yesterday = now.minus({ days: 1 }); // Sunday
            const { monday, sunday } = getWeekBounds(yesterday);

            const weekStartDate = monday.toFormat("yyyy-MM-dd");
            const weekEndDate = sunday.toFormat("yyyy-MM-dd");

            logger.info(`updateWeeklyHardestPuzzle: Analyzing week ${weekStartDate} to ${weekEndDate}`);

            // Idempotency check: skip if this week has already been processed
            const weeklyHardestRef = db.collection("weeklyHardest").doc("current");
            const existingDoc = await weeklyHardestRef.get();

            if (existingDoc.exists) {
                const existing = existingDoc.data();
                if (existing?.weekStartDate === weekStartDate && existing?.weekEndDate === weekEndDate) {
                    logger.info(`updateWeeklyHardestPuzzle: Week ${weekStartDate} already processed, skipping`);
                    return;
                }
            }

            // Step 1: Fetch all dailyScoresV2 documents for the week
            const dailyScoresSnapshot = await db.collection("dailyScoresV2")
                .where(admin.firestore.FieldPath.documentId(), ">=", weekStartDate)
                .where(admin.firestore.FieldPath.documentId(), "<=", weekEndDate)
                .get();

            if (dailyScoresSnapshot.empty) {
                logger.warn("updateWeeklyHardestPuzzle: No puzzle data found for the week");
                return;
            }

            logger.info(`updateWeeklyHardestPuzzle: Found ${dailyScoresSnapshot.size} days with data`);

            // Step 2: Fetch bot scores (algoScore) for all puzzles in the week
            const difficulties: DifficultyLevel[] = [
                DifficultyLevel.Easy,
                DifficultyLevel.Medium,
                DifficultyLevel.Hard
            ];

            const algoScores: Map<string, Map<DifficultyLevel, number>> = new Map();

            const puzzlePromises = difficulties.map(difficulty =>
                db.collection("puzzlesV2")
                    .where(admin.firestore.FieldPath.documentId(), ">=", `${weekStartDate}-${difficulty}`)
                    .where(admin.firestore.FieldPath.documentId(), "<=", `${weekEndDate}-${difficulty}`)
                    .get()
                    .then(snapshot => ({ difficulty, snapshot }))
            );
            const puzzleResults = await Promise.all(puzzlePromises);

            for (const { difficulty, snapshot } of puzzleResults) {
                snapshot.forEach(doc => {
                    const dateStr = doc.id.substring(0, 10); // Extract YYYY-MM-DD
                    const data = doc.data();

                    if (!algoScores.has(dateStr)) {
                        algoScores.set(dateStr, new Map());
                    }
                    if (typeof data.algoScore === "number") {
                        algoScores.get(dateStr)!.set(difficulty, data.algoScore);
                    }
                });
            }

            // Step 3: Collect user IDs per puzzle/difficulty for userPuzzleHistory lookup
            const puzzleUserMap: Map<string, Map<DifficultyLevel, { userId: string; bestScore: number }[]>> = new Map();

            dailyScoresSnapshot.forEach(doc => {
                const puzzleId = doc.id;
                const data = doc.data();

                if (!puzzleUserMap.has(puzzleId)) {
                    puzzleUserMap.set(puzzleId, new Map());
                }

                for (const difficulty of difficulties) {
                    const diffScores = data[difficulty];
                    if (!diffScores || typeof diffScores !== "object") continue;

                    const users: { userId: string; bestScore: number }[] = [];
                    for (const [userId, userScore] of Object.entries(diffScores)) {
                        if (typeof userScore === "number" && !isNaN(userScore)) {
                            users.push({ userId, bestScore: userScore });
                        }
                    }
                    puzzleUserMap.get(puzzleId)!.set(difficulty, users);
                }
            });

            // Step 4: Fetch userPuzzleHistory for all user-puzzle combinations
            // Build list of all unique user-puzzle pairs
            const userPuzzlePairs: { userId: string; puzzleId: string }[] = [];
            puzzleUserMap.forEach((diffMap, puzzleId) => {
                const seenUsers = new Set<string>();
                diffMap.forEach((users) => {
                    users.forEach(({ userId }) => {
                        if (!seenUsers.has(userId)) {
                            seenUsers.add(userId);
                            userPuzzlePairs.push({ userId, puzzleId });
                        }
                    });
                });
            });

            logger.info(`updateWeeklyHardestPuzzle: Fetching userPuzzleHistory for ${userPuzzlePairs.length} user-puzzle pairs`);

            // Batch fetch userPuzzleHistory documents (in chunks of 50 for performance)
            const attemptsByUserPuzzle: Map<string, Map<DifficultyLevel, number>> = new Map();
            const BATCH_SIZE = 50;

            for (let i = 0; i < userPuzzlePairs.length; i += BATCH_SIZE) {
                const batch = userPuzzlePairs.slice(i, i + BATCH_SIZE);
                const batchPromises = batch.map(({ userId, puzzleId }) =>
                    db.collection("userPuzzleHistory")
                        .doc(userId)
                        .collection("puzzles")
                        .doc(puzzleId)
                        .get()
                        .then(doc => ({ userId, puzzleId, doc }))
                        .catch(() => ({ userId, puzzleId, doc: null }))
                );

                const batchResults = await Promise.all(batchPromises);

                for (const { userId, puzzleId, doc } of batchResults) {
                    const key = `${userId}:${puzzleId}`;
                    if (!attemptsByUserPuzzle.has(key)) {
                        attemptsByUserPuzzle.set(key, new Map());
                    }

                    if (doc && doc.exists) {
                        const data = doc.data();
                        // Get per-difficulty attempts
                        for (const difficulty of difficulties) {
                            const diffData = data?.[difficulty];
                            if (diffData && typeof diffData.attempts === "number") {
                                attemptsByUserPuzzle.get(key)!.set(difficulty, diffData.attempts);
                            }
                        }
                    }
                }
            }

            logger.info(`updateWeeklyHardestPuzzle: Fetched attempt data for ${attemptsByUserPuzzle.size} user-puzzle combinations`);

            // Step 5: Calculate hardness for each puzzle/difficulty combination
            const allResults: PuzzleHardnessResult[] = [];

            puzzleUserMap.forEach((diffMap, puzzleId) => {
                for (const difficulty of difficulties) {
                    const users = diffMap.get(difficulty);
                    if (!users || users.length === 0) continue;

                    const botMoves = algoScores.get(puzzleId)?.get(difficulty);
                    if (botMoves === undefined) {
                        logger.warn(`updateWeeklyHardestPuzzle: No algoScore for ${puzzleId}-${difficulty}`);
                        continue;
                    }

                    // Calculate stats
                    const uniquePlayers = users.length;
                    let sumScores = 0;
                    let totalAttempts = 0;

                    // Find the lowest (best) score
                    const lowestScore = Math.min(...users.map(u => u.bestScore));

                    // Count users who achieved the lowest score
                    const countOfLowest = users.filter(u => u.bestScore === lowestScore).length;

                    // Sum attempts from userPuzzleHistory (per-difficulty)
                    for (const { userId, bestScore } of users) {
                        sumScores += bestScore;

                        const key = `${userId}:${puzzleId}`;
                        const userAttempts = attemptsByUserPuzzle.get(key)?.get(difficulty);
                        // Default to 1 attempt if not found (user has at least 1 attempt if they have a score)
                        totalAttempts += userAttempts ?? 1;
                    }

                    const averageScore = sumScores / uniquePlayers;
                    const optimalHitPercentage = (countOfLowest / uniquePlayers) * 100;
                    const hardnessScore = calculateHardnessScore(
                        totalAttempts,
                        countOfLowest
                    );

                    allResults.push({
                        puzzleId,
                        difficulty,
                        uniquePlayers,
                        totalAttempts,
                        countOfLowest,
                        lowestScore,
                        optimalHitPercentage: Math.round(optimalHitPercentage * 100) / 100,
                        botMoves,
                        averageScore: Math.round(averageScore * 100) / 100,
                        hardnessScore,
                    });
                }
            });

            if (allResults.length === 0) {
                logger.warn("updateWeeklyHardestPuzzle: No valid puzzle results to analyze");
                return;
            }

            // Step 6: Find the hardest puzzle (highest hardness score)
            // Secondary sort: by difficulty (hard > medium > easy) then by date (most recent)
            allResults.sort((a, b) => {
                if (b.hardnessScore !== a.hardnessScore) {
                    return b.hardnessScore - a.hardnessScore;
                }
                // Tie-breaker: harder difficulty wins
                const diffOrder = { [DifficultyLevel.Hard]: 3, [DifficultyLevel.Medium]: 2, [DifficultyLevel.Easy]: 1 };
                if (diffOrder[b.difficulty] !== diffOrder[a.difficulty]) {
                    return diffOrder[b.difficulty] - diffOrder[a.difficulty];
                }
                // Tie-breaker: more recent puzzle wins
                return b.puzzleId.localeCompare(a.puzzleId);
            });
            const hardest = allResults[0];

            logger.info(`updateWeeklyHardestPuzzle: Hardest puzzle is ${hardest.puzzleId}-${hardest.difficulty} with score ${hardest.hardnessScore}`);

            // Step 7: Fetch the exact algoScore for the hardest puzzle directly from puzzlesV2
            // This ensures we get the correct value rather than relying on the cached map
            const hardestPuzzleDoc = await db.collection("puzzlesV2")
                .doc(`${hardest.puzzleId}-${hardest.difficulty}`)
                .get();
            const verifiedBotMoves = hardestPuzzleDoc.exists
                ? (hardestPuzzleDoc.data()?.algoScore as number) ?? hardest.botMoves
                : hardest.botMoves;

            logger.info(`updateWeeklyHardestPuzzle: Verified botMoves for ${hardest.puzzleId}-${hardest.difficulty}: ${verifiedBotMoves}`);

            // Step 8: Write to weeklyHardest/current (reuse ref from idempotency check)
            await weeklyHardestRef.set({
                puzzleId: hardest.puzzleId,
                difficulty: hardest.difficulty,
                totalAttempts: hardest.totalAttempts,
                countOfLowest: hardest.countOfLowest,
                lowestScore: hardest.lowestScore,
                optimalHitPercentage: hardest.optimalHitPercentage,
                botMoves: verifiedBotMoves,
                uniquePlayers: hardest.uniquePlayers,
                averageScore: hardest.averageScore,
                weekStartDate,
                weekEndDate,
                hardnessScore: hardest.hardnessScore,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            logger.info(`updateWeeklyHardestPuzzle: Successfully wrote weekly hardest puzzle`, {
                puzzleId: hardest.puzzleId,
                difficulty: hardest.difficulty,
                hardnessScore: hardest.hardnessScore,
                totalAttempts: hardest.totalAttempts,
                countOfLowest: hardest.countOfLowest,
                lowestScore: hardest.lowestScore,
                optimalHitPercentage: hardest.optimalHitPercentage,
            });

        } catch (error) {
            logger.error("updateWeeklyHardestPuzzle: Fatal error during execution:", error);
            throw error;
        }
    }
);
