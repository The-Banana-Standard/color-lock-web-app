/**
 * Scheduled Cloud Function to collect daily usage statistics.
 * Runs daily at 5:30 AM UTC (12:30 AM EST / 1:30 AM EDT).
 * Processes stats from 2 days prior to ensure all users from all timezones are captured.
 * Example: Runs on Jan 3 at 12:30 AM EST - processes Jan 1 stats.
 * Collects: unique users and total attempts per puzzle.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, admin, logger } from "../../config.js";
import { DateTime } from "luxon";

// Streak counts for usage stats
interface StreakCounts {
    puzzleStreak3PlusCount: number;
    easyGoalStreak3PlusCount: number;
    mediumGoalStreak3PlusCount: number;
    hardGoalStreak3PlusCount: number;
}

/**
 * Calculate consecutive days ending on target date.
 * Returns 0 if target date not in days array.
 */
function calculateStreakLength(days: string[], targetDate: string): number {
    if (!days.includes(targetDate)) return 0;

    const daysSet = new Set(days);
    let streak = 1;
    let checkDate = DateTime.fromISO(targetDate, { zone: "utc" }).minus({ days: 1 });

    while (daysSet.has(checkDate.toFormat("yyyy-MM-dd"))) {
        streak++;
        checkDate = checkDate.minus({ days: 1 });
    }

    return streak;
}

/**
 * Calculate streak counts for a specific date.
 * Looks back 30 days to detect 3+ day streaks ending on target date.
 *
 * Goal achievement = userScore <= algoScore (tied or beat)
 */
async function collectStreakCounts(targetPuzzleId: string): Promise<StreakCounts> {
    try {
        const targetDate = DateTime.fromISO(targetPuzzleId, { zone: "utc" });
        const lookbackStart = targetDate.minus({ days: 30 });
        const startDateStr = lookbackStart.toFormat("yyyy-MM-dd");
        const endDateStr = targetPuzzleId;

        // Step 1: Fetch all dailyScoresV2 documents in range
        const dailyScoresSnapshot = await db.collection("dailyScoresV2")
            .where(admin.firestore.FieldPath.documentId(), ">=", startDateStr)
            .where(admin.firestore.FieldPath.documentId(), "<=", endDateStr)
            .get();

        // Step 2: Fetch puzzlesV2 documents per difficulty in parallel
        const algoScores: Map<string, Map<string, number>> = new Map();
        const difficulties = ["easy", "medium", "hard"] as const;

        const puzzlePromises = difficulties.map(difficulty =>
            db.collection("puzzlesV2")
                .where(admin.firestore.FieldPath.documentId(), ">=", `${startDateStr}-${difficulty}`)
                .where(admin.firestore.FieldPath.documentId(), "<=", `${endDateStr}-${difficulty}`)
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

        // Step 3: Build per-user history maps
        const playedDates: Map<string, Set<string>> = new Map();
        const goalDates: Map<string, Map<string, Set<string>>> = new Map();

        dailyScoresSnapshot.forEach(doc => {
            const dateStr = doc.id;
            const data = doc.data();

            for (const difficulty of difficulties) {
                const diffScores = data[difficulty];
                if (!diffScores || typeof diffScores !== "object") continue;

                const algoScore = algoScores.get(dateStr)?.get(difficulty);

                for (const [userId, userScore] of Object.entries(diffScores)) {
                    // Track that user played on this date
                    if (!playedDates.has(userId)) {
                        playedDates.set(userId, new Set());
                    }
                    playedDates.get(userId)!.add(dateStr);

                    // Check if user achieved goal (tied or beat)
                    if (algoScore !== undefined && typeof userScore === "number" && userScore <= algoScore) {
                        if (!goalDates.has(userId)) {
                            goalDates.set(userId, new Map([
                                ["easy", new Set()],
                                ["medium", new Set()],
                                ["hard", new Set()],
                            ]));
                        }
                        goalDates.get(userId)!.get(difficulty)!.add(dateStr);
                    }
                }
            }
        });

        // Step 4: Calculate streak counts
        let puzzleStreak3PlusCount = 0;
        let easyGoalStreak3PlusCount = 0;
        let mediumGoalStreak3PlusCount = 0;
        let hardGoalStreak3PlusCount = 0;

        const allUserIds = new Set([...playedDates.keys(), ...goalDates.keys()]);

        for (const userId of allUserIds) {
            const userPlayedDates = playedDates.get(userId);
            if (userPlayedDates && calculateStreakLength(Array.from(userPlayedDates), targetPuzzleId) >= 3) {
                puzzleStreak3PlusCount++;
            }

            const userGoalDates = goalDates.get(userId);
            if (userGoalDates) {
                const easyDates = userGoalDates.get("easy");
                if (easyDates && calculateStreakLength(Array.from(easyDates), targetPuzzleId) >= 3) {
                    easyGoalStreak3PlusCount++;
                }

                const mediumDates = userGoalDates.get("medium");
                if (mediumDates && calculateStreakLength(Array.from(mediumDates), targetPuzzleId) >= 3) {
                    mediumGoalStreak3PlusCount++;
                }

                const hardDates = userGoalDates.get("hard");
                if (hardDates && calculateStreakLength(Array.from(hardDates), targetPuzzleId) >= 3) {
                    hardGoalStreak3PlusCount++;
                }
            }
        }

        logger.info(`collectStreakCounts: ${targetPuzzleId} - puzzle: ${puzzleStreak3PlusCount}, easy: ${easyGoalStreak3PlusCount}, medium: ${mediumGoalStreak3PlusCount}, hard: ${hardGoalStreak3PlusCount}`);

        return {
            puzzleStreak3PlusCount,
            easyGoalStreak3PlusCount,
            mediumGoalStreak3PlusCount,
            hardGoalStreak3PlusCount,
        };
    } catch (error) {
        logger.error(`collectStreakCounts: Error for ${targetPuzzleId}:`, error);
        throw error; // Re-throw to let caller handle appropriately
    }
}

/**
 * Helper function to calculate and update aggregate stats (7d, 30d, 90d, allTime).
 * Stores pre-computed unique user counts in special documents for efficient retrieval.
 */
async function updateAggregateStats(latestPuzzleId: string): Promise<void> {
    const now = DateTime.fromISO(latestPuzzleId, { zone: "utc" });

    // Define date ranges
    const ranges = {
        "aggregate_7d": 7,
        "aggregate_30d": 30,
        "aggregate_90d": 90,
    };

    for (const [docId, days] of Object.entries(ranges)) {
        const startDate = now.minus({ days: days - 1 }).toFormat("yyyy-MM-dd");
        const endDate = latestPuzzleId;

        const uniqueUserIds = new Set<string>();
        let totalAttempts = 0;
        let daysWithData = 0;

        // Streak count sums
        let puzzleStreak3PlusSum = 0;
        let easyGoalStreak3PlusSum = 0;
        let mediumGoalStreak3PlusSum = 0;
        let hardGoalStreak3PlusSum = 0;

        // Query all daily stats in range
        const statsSnapshot = await db.collection("usageStats")
            .where(admin.firestore.FieldPath.documentId(), ">=", startDate)
            .where(admin.firestore.FieldPath.documentId(), "<=", endDate)
            .get();

        statsSnapshot.forEach(doc => {
            // Skip aggregate documents
            if (doc.id.startsWith("aggregate_")) return;

            const data = doc.data();

            // Collect unique user IDs
            if (data.userIds && Array.isArray(data.userIds)) {
                data.userIds.forEach((uid: string) => uniqueUserIds.add(uid));
            }

            // Sum total attempts
            if (typeof data.totalAttempts === "number") {
                totalAttempts += data.totalAttempts;
            }

            // Sum streak counts
            puzzleStreak3PlusSum += data.puzzleStreak3PlusCount || 0;
            easyGoalStreak3PlusSum += data.easyGoalStreak3PlusCount || 0;
            mediumGoalStreak3PlusSum += data.mediumGoalStreak3PlusCount || 0;
            hardGoalStreak3PlusSum += data.hardGoalStreak3PlusCount || 0;

            daysWithData++;
        });

        // Write aggregate document
        await db.collection("usageStats").doc(docId).set({
            uniqueUsers: uniqueUserIds.size,
            totalAttempts,
            daysWithData,
            startDate,
            endDate,
            userIds: Array.from(uniqueUserIds).sort(),
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            // Streak sums
            puzzleStreak3PlusSum,
            easyGoalStreak3PlusSum,
            mediumGoalStreak3PlusSum,
            hardGoalStreak3PlusSum,
        });

        logger.info(`updateAggregateStats: ${docId} - ${uniqueUserIds.size} unique users, ${totalAttempts} attempts, ${daysWithData} days`);
    }

    // Calculate all-time stats with monthly aggregation
    const allUniqueUserIds = new Set<string>();
    const monthlyStatsMap = new Map<string, {
        userIds: Set<string>;
        totalAttempts: number;
        puzzleStreak3PlusSum: number;
        easyGoalStreak3PlusSum: number;
        mediumGoalStreak3PlusSum: number;
        hardGoalStreak3PlusSum: number;
    }>();
    let allTotalAttempts = 0;
    let allDaysWithData = 0;
    let earliestDate: string | null = null;

    // All-time streak sums
    let allPuzzleStreak3PlusSum = 0;
    let allEasyGoalStreak3PlusSum = 0;
    let allMediumGoalStreak3PlusSum = 0;
    let allHardGoalStreak3PlusSum = 0;

    const allStatsSnapshot = await db.collection("usageStats").get();

    allStatsSnapshot.forEach(doc => {
        // Skip aggregate documents
        if (doc.id.startsWith("aggregate_")) return;

        const data = doc.data();

        // Track earliest date
        if (!earliestDate || doc.id < earliestDate) {
            earliestDate = doc.id;
        }

        // Collect unique user IDs for all-time
        if (data.userIds && Array.isArray(data.userIds)) {
            data.userIds.forEach((uid: string) => allUniqueUserIds.add(uid));
        }

        // Sum total attempts for all-time
        if (typeof data.totalAttempts === "number") {
            allTotalAttempts += data.totalAttempts;
        }

        // Sum streak counts for all-time
        allPuzzleStreak3PlusSum += data.puzzleStreak3PlusCount || 0;
        allEasyGoalStreak3PlusSum += data.easyGoalStreak3PlusCount || 0;
        allMediumGoalStreak3PlusSum += data.mediumGoalStreak3PlusCount || 0;
        allHardGoalStreak3PlusSum += data.hardGoalStreak3PlusCount || 0;

        // Aggregate by month
        const monthKey = doc.id.substring(0, 7); // YYYY-MM
        const monthlyData = monthlyStatsMap.get(monthKey) || {
            userIds: new Set<string>(),
            totalAttempts: 0,
            puzzleStreak3PlusSum: 0,
            easyGoalStreak3PlusSum: 0,
            mediumGoalStreak3PlusSum: 0,
            hardGoalStreak3PlusSum: 0,
        };

        if (data.userIds && Array.isArray(data.userIds)) {
            data.userIds.forEach((uid: string) => monthlyData.userIds.add(uid));
        }
        if (typeof data.totalAttempts === "number") {
            monthlyData.totalAttempts += data.totalAttempts;
        }

        // Sum streak counts per month
        monthlyData.puzzleStreak3PlusSum += data.puzzleStreak3PlusCount || 0;
        monthlyData.easyGoalStreak3PlusSum += data.easyGoalStreak3PlusCount || 0;
        monthlyData.mediumGoalStreak3PlusSum += data.mediumGoalStreak3PlusCount || 0;
        monthlyData.hardGoalStreak3PlusSum += data.hardGoalStreak3PlusCount || 0;

        monthlyStatsMap.set(monthKey, monthlyData);
        allDaysWithData++;
    });

    // Convert monthly stats map to a serializable object
    const monthlyStats: Record<string, {
        uniqueUsers: number;
        totalAttempts: number;
        puzzleStreak3PlusSum: number;
        easyGoalStreak3PlusSum: number;
        mediumGoalStreak3PlusSum: number;
        hardGoalStreak3PlusSum: number;
    }> = {};
    monthlyStatsMap.forEach((data, monthKey) => {
        monthlyStats[monthKey] = {
            uniqueUsers: data.userIds.size,
            totalAttempts: data.totalAttempts,
            puzzleStreak3PlusSum: data.puzzleStreak3PlusSum,
            easyGoalStreak3PlusSum: data.easyGoalStreak3PlusSum,
            mediumGoalStreak3PlusSum: data.mediumGoalStreak3PlusSum,
            hardGoalStreak3PlusSum: data.hardGoalStreak3PlusSum,
        };
    });

    // Write all-time aggregate document with monthly stats
    await db.collection("usageStats").doc("aggregate_allTime").set({
        uniqueUsers: allUniqueUserIds.size,
        totalAttempts: allTotalAttempts,
        daysWithData: allDaysWithData,
        startDate: earliestDate || latestPuzzleId,
        endDate: latestPuzzleId,
        userIds: Array.from(allUniqueUserIds).sort(),
        monthlyStats, // Map of YYYY-MM -> {uniqueUsers, totalAttempts, streak sums}
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        // All-time streak sums
        puzzleStreak3PlusSum: allPuzzleStreak3PlusSum,
        easyGoalStreak3PlusSum: allEasyGoalStreak3PlusSum,
        mediumGoalStreak3PlusSum: allMediumGoalStreak3PlusSum,
        hardGoalStreak3PlusSum: allHardGoalStreak3PlusSum,
    });

    logger.info(`updateAggregateStats: aggregate_allTime - ${allUniqueUserIds.size} unique users, ${allTotalAttempts} attempts, ${allDaysWithData} days, ${monthlyStatsMap.size} months`);
}

export const collectDailyUsageStats = onSchedule(
    {
        schedule: "30 5 * * *", // Every day at 5:30 AM UTC (12:30 AM EST / 1:30 AM EDT)
        timeZone: "UTC",
        memory: "1GiB", // Increased from 512MiB for streak calculation memory requirements
        timeoutSeconds: 540,
    },
    async () => {
        logger.info("collectDailyUsageStats: Starting execution");

        try {
            // Process stats from 2 days prior to ensure all users from all timezones are captured
            // This gives users in all timezones (including Hawaii/Alaska) time to complete the puzzle
            const nowEastern = DateTime.utc().setZone("America/New_York");
            const targetDate = nowEastern.minus({ days: 2 });
            const targetPuzzleId = targetDate.toFormat("yyyy-MM-dd");

            logger.info(`collectDailyUsageStats: Processing puzzle ID: ${targetPuzzleId} (Current Eastern Time: ${nowEastern.toISO()})`);

            // Step 1: Count unique users from dailyScoresV2
            const dailyScoresRef = db.collection("dailyScoresV2").doc(targetPuzzleId);
            const dailyScoresSnap = await dailyScoresRef.get();

            const uniqueUserIds = new Set<string>();

            if (dailyScoresSnap.exists) {
                const data = dailyScoresSnap.data();

                // Collect user IDs from all difficulties
                for (const difficulty of ["easy", "medium", "hard"]) {
                    const diffData = data?.[difficulty];
                    if (diffData && typeof diffData === "object") {
                        Object.keys(diffData).forEach(userId => uniqueUserIds.add(userId));
                    }
                }
            }

            const uniqueUsers = uniqueUserIds.size;
            logger.info(`collectDailyUsageStats: Found ${uniqueUsers} unique users`);

            // Step 2: Sum total attempts from userPuzzleHistory
            let totalAttempts = 0;
            let processedUsers = 0;
            let errorUsers = 0;

            for (const userId of uniqueUserIds) {
                try {
                    const puzzleRef = db.collection("userPuzzleHistory")
                        .doc(userId)
                        .collection("puzzles")
                        .doc(targetPuzzleId);

                    const puzzleSnap = await puzzleRef.get();

                    if (puzzleSnap.exists) {
                        const puzzleData = puzzleSnap.data();
                        const attempts = typeof puzzleData?.totalAttempts === "number"
                            ? puzzleData.totalAttempts
                            : 0;
                        totalAttempts += attempts;
                        processedUsers++;
                    }
                } catch (error) {
                    errorUsers++;
                    logger.warn(`collectDailyUsageStats: Error processing user ${userId}:`, error);
                }
            }

            logger.info(`collectDailyUsageStats: Processed ${processedUsers} users, ${errorUsers} errors, Total attempts: ${totalAttempts}`);

            // Step 3: Collect streak counts
            logger.info(`collectDailyUsageStats: Calculating streak counts for ${targetPuzzleId}...`);
            const streakCounts = await collectStreakCounts(targetPuzzleId);

            // Step 4: Write to usageStats collection with userIds and streak counts
            const userIdsArray = Array.from(uniqueUserIds).sort();
            const usageStatsRef = db.collection("usageStats").doc(targetPuzzleId);
            await usageStatsRef.set({
                uniqueUsers,
                totalAttempts,
                userIds: userIdsArray,
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                // Streak counts
                puzzleStreak3PlusCount: streakCounts.puzzleStreak3PlusCount,
                easyGoalStreak3PlusCount: streakCounts.easyGoalStreak3PlusCount,
                mediumGoalStreak3PlusCount: streakCounts.mediumGoalStreak3PlusCount,
                hardGoalStreak3PlusCount: streakCounts.hardGoalStreak3PlusCount,
            });

            logger.info(`collectDailyUsageStats: Successfully wrote stats for ${targetPuzzleId} with ${userIdsArray.length} user IDs and streak counts`);

            // Step 5: Calculate and update aggregate stats (7d, 30d, 90d, allTime)
            await updateAggregateStats(targetPuzzleId);

            logger.info(`collectDailyUsageStats: Successfully updated aggregate stats`);

        } catch (error) {
            logger.error("collectDailyUsageStats: Fatal error during execution:", error);
            throw error;
        }
    }
);
