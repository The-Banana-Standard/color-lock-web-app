/**
 * One-time migration function to backfill usage stats from old data structure.
 * WARNING: This is an admin-only function and should be called with caution.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, admin, logger, getAppCheckConfig } from "../../config.js";
import { assertAdmin } from "../../adminAuth.js";

interface BackfillUsageStatsRequest {
    startDate?: string; // Optional: YYYY-MM-DD format
    endDate?: string;   // Optional: YYYY-MM-DD format
    dryRun?: boolean;   // If true, only logs what would be done
}

/**
 * Helper function to calculate and update aggregate stats (7d, 30d, 90d, allTime).
 * Stores pre-computed unique user counts in special documents for efficient retrieval.
 */
async function updateAggregateStats(latestPuzzleId: string): Promise<void> {
    const { DateTime } = await import("luxon");
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
        });

        logger.info(`updateAggregateStats: ${docId} - ${uniqueUserIds.size} unique users, ${totalAttempts} attempts, ${daysWithData} days`);
    }

    // Calculate all-time stats
    const allUniqueUserIds = new Set<string>();
    let allTotalAttempts = 0;
    let allDaysWithData = 0;
    let earliestDate: string | null = null;

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

        allDaysWithData++;
    });

    // Write all-time aggregate document
    await db.collection("usageStats").doc("aggregate_allTime").set({
        uniqueUsers: allUniqueUserIds.size,
        totalAttempts: allTotalAttempts,
        daysWithData: allDaysWithData,
        startDate: earliestDate || latestPuzzleId,
        endDate: latestPuzzleId,
        userIds: Array.from(allUniqueUserIds).sort(),
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`updateAggregateStats: aggregate_allTime - ${allUniqueUserIds.size} unique users, ${allTotalAttempts} attempts, ${allDaysWithData} days`);
}

export const backfillUsageStats = onCall(
    {
        memory: "1GiB",
        timeoutSeconds: 540,
        ...getAppCheckConfig(),
    },
    async (request) => {
        // Only allow admin users
        const userId = assertAdmin(request);

        const { startDate, endDate, dryRun = true } = (request.data || {}) as BackfillUsageStatsRequest;

        logger.info(`backfillUsageStats: Called by ${userId}, dryRun: ${dryRun}`);

        try {
            let processedDays = 0;
            let skippedDays = 0;
            let errorDays = 0;

            // Get all dailyScoresV2 documents
            let query = db.collection("dailyScoresV2").orderBy(admin.firestore.FieldPath.documentId(), "asc");

            if (startDate) {
                query = query.where(admin.firestore.FieldPath.documentId(), ">=", startDate);
            }
            if (endDate) {
                query = query.where(admin.firestore.FieldPath.documentId(), "<=", endDate);
            }

            const dailyScoresSnapshot = await query.get();

            logger.info(`backfillUsageStats: Found ${dailyScoresSnapshot.size} days to process`);

            for (const dailyScoresDoc of dailyScoresSnapshot.docs) {
                const puzzleId = dailyScoresDoc.id;

                try {
                    // Check if stats already exist
                    const existingStatsSnap = await db.collection("usageStats").doc(puzzleId).get();

                    if (existingStatsSnap.exists) {
                        logger.info(`backfillUsageStats: Stats already exist for ${puzzleId}, skipping`);
                        skippedDays++;
                        continue;
                    }

                    // Count unique users from dailyScoresV2
                    const data = dailyScoresDoc.data();
                    const uniqueUserIds = new Set<string>();

                    for (const difficulty of ["easy", "medium", "hard"]) {
                        const diffData = data?.[difficulty];
                        if (diffData && typeof diffData === "object") {
                            Object.keys(diffData).forEach(uid => uniqueUserIds.add(uid));
                        }
                    }

                    // Sum total attempts from userPuzzleHistory
                    let totalAttempts = 0;

                    for (const uid of uniqueUserIds) {
                        try {
                            const puzzleRef = db.collection("userPuzzleHistory")
                                .doc(uid)
                                .collection("puzzles")
                                .doc(puzzleId);

                            const puzzleSnap = await puzzleRef.get();

                            if (puzzleSnap.exists) {
                                const puzzleData = puzzleSnap.data();
                                const attempts = typeof puzzleData?.totalAttempts === "number"
                                    ? puzzleData.totalAttempts
                                    : 0;
                                totalAttempts += attempts;
                            }
                        } catch (userError) {
                            logger.warn(`backfillUsageStats: Error processing user ${uid} for ${puzzleId}:`, userError);
                        }
                    }

                    logger.info(`backfillUsageStats: ${puzzleId} - Users: ${uniqueUserIds.size}, Attempts: ${totalAttempts}`);

                    if (!dryRun) {
                        // Write to usageStats collection with userIds
                        const userIdsArray = Array.from(uniqueUserIds).sort();
                        await db.collection("usageStats").doc(puzzleId).set({
                            uniqueUsers: uniqueUserIds.size,
                            totalAttempts,
                            userIds: userIdsArray,
                            processedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    }

                    processedDays++;

                } catch (dayError) {
                    errorDays++;
                    logger.error(`backfillUsageStats: Error processing ${puzzleId}:`, dayError);
                }
            }

            // Update aggregate stats after backfill (if not dry run)
            if (!dryRun && processedDays > 0) {
                try {
                    // Find the latest date that was processed
                    const latestDate = dailyScoresSnapshot.docs
                        .map(doc => doc.id)
                        .filter(id => id >= (startDate || "2024-01-01") && id <= (endDate || "9999-12-31"))
                        .sort()
                        .pop();

                    if (latestDate) {
                        logger.info(`backfillUsageStats: Updating aggregate stats based on latest date: ${latestDate}`);
                        await updateAggregateStats(latestDate);
                    }
                } catch (aggregateError) {
                    logger.warn("backfillUsageStats: Failed to update aggregates:", aggregateError);
                }
            }

            const summary = {
                success: true,
                dryRun,
                processedDays,
                skippedDays,
                errorDays,
                totalDays: dailyScoresSnapshot.size,
            };

            logger.info("backfillUsageStats: Completed", summary);

            return summary;

        } catch (error) {
            logger.error("backfillUsageStats: Fatal error:", error);
            throw new HttpsError("internal", "Failed to backfill usage stats.");
        }
    }
);
