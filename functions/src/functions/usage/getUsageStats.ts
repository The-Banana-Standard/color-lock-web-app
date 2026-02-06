/**
 * Callable Cloud Function to retrieve usage statistics.
 * Supports filtering by date range and aggregation.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, logger, getAppCheckConfig } from "../../config.js";
import { assertAdmin } from "../../adminAuth.js";
import { DateTime } from "luxon";

interface GetUsageStatsRequest {
    startDate: string; // YYYY-MM-DD format
    endDate: string;   // YYYY-MM-DD format
    aggregateByMonth?: boolean; // If true, return monthly aggregated data instead of daily
}

interface UsageStatsEntry {
    puzzleId: string;
    uniqueUsers: number;
    totalAttempts: number;
    userIds?: string[];
    // Streak counts
    puzzleStreak3PlusCount?: number;
    easyGoalStreak3PlusCount?: number;
    mediumGoalStreak3PlusCount?: number;
    hardGoalStreak3PlusCount?: number;
}

export const getUsageStats = onCall(
    {
        memory: "512MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        // Only allow admin users
        const userId = assertAdmin(request);
        const { startDate, endDate, aggregateByMonth = false } = (request.data || {}) as GetUsageStatsRequest;

        logger.info(`getUsageStats: Called by ${userId}, range: ${startDate} to ${endDate}, aggregateByMonth: ${aggregateByMonth}`);

        if (!startDate || !endDate) {
            throw new HttpsError("invalid-argument", "startDate and endDate are required (YYYY-MM-DD format).");
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
            throw new HttpsError("invalid-argument", "Dates must be in YYYY-MM-DD format.");
        }

        try {
            // Get all usageStats documents and filter by date range
            // This avoids FieldPath.documentId() issues in some environments
            const statsSnapshot = await db.collection("usageStats").get();

            const stats: UsageStatsEntry[] = [];

            statsSnapshot.forEach(doc => {
                const docId = doc.id;
                // Skip aggregate documents
                if (docId.startsWith("aggregate_")) return;

                // Filter by date range (document IDs are YYYY-MM-DD format)
                if (docId >= startDate && docId <= endDate) {
                    const data = doc.data();
                    stats.push({
                        puzzleId: docId,
                        uniqueUsers: typeof data.uniqueUsers === "number" ? data.uniqueUsers : 0,
                        totalAttempts: typeof data.totalAttempts === "number" ? data.totalAttempts : 0,
                        userIds: Array.isArray(data.userIds) ? data.userIds : undefined,
                        // Streak counts
                        puzzleStreak3PlusCount: data.puzzleStreak3PlusCount,
                        easyGoalStreak3PlusCount: data.easyGoalStreak3PlusCount,
                        mediumGoalStreak3PlusCount: data.mediumGoalStreak3PlusCount,
                        hardGoalStreak3PlusCount: data.hardGoalStreak3PlusCount,
                    });
                }
            });

            // Sort by date ascending
            stats.sort((a, b) => a.puzzleId.localeCompare(b.puzzleId));

            // Calculate total unique users and total attempts across the date range
            // First, try to find a matching pre-computed aggregate
            let totalUniqueUsers = 0;
            let totalAttempts = 0;
            let usedAggregate = false;

            // Streak sums from aggregate or manual calculation
            let puzzleStreak3PlusSum: number | undefined;
            let easyGoalStreak3PlusSum: number | undefined;
            let mediumGoalStreak3PlusSum: number | undefined;
            let hardGoalStreak3PlusSum: number | undefined;

            // Determine which aggregate documents to check based on date range span
            const startDateObj = DateTime.fromISO(startDate, { zone: "utc" });
            const endDateObj = DateTime.fromISO(endDate, { zone: "utc" });
            const daysDiff = Math.ceil(endDateObj.diff(startDateObj, "days").days) + 1;

            // Map day spans to potential aggregate document IDs
            const candidateAggregates: string[] = [];
            if (daysDiff === 7) {
                candidateAggregates.push("aggregate_7d");
            } else if (daysDiff === 30) {
                candidateAggregates.push("aggregate_30d");
            } else if (daysDiff === 90) {
                candidateAggregates.push("aggregate_90d");
            } else if (startDate <= "2024-01-01" && daysDiff > 90) {
                candidateAggregates.push("aggregate_allTime");
            }

            // Try each candidate aggregate and validate its stored date range
            for (const aggregateDocId of candidateAggregates) {
                try {
                    const aggregateDoc = await db.collection("usageStats").doc(aggregateDocId).get();
                    if (aggregateDoc.exists) {
                        const aggregateData = aggregateDoc.data();
                        const aggStartDate = aggregateData?.startDate as string | undefined;
                        const aggEndDate = aggregateData?.endDate as string | undefined;

                        // Validate that the aggregate's stored date range matches the requested range
                        if (aggStartDate === startDate && aggEndDate === endDate) {
                            totalUniqueUsers = typeof aggregateData?.uniqueUsers === "number" ? aggregateData.uniqueUsers : 0;
                            totalAttempts = typeof aggregateData?.totalAttempts === "number" ? aggregateData.totalAttempts : 0;
                            // Capture streak sums from aggregate
                            puzzleStreak3PlusSum = aggregateData?.puzzleStreak3PlusSum;
                            easyGoalStreak3PlusSum = aggregateData?.easyGoalStreak3PlusSum;
                            mediumGoalStreak3PlusSum = aggregateData?.mediumGoalStreak3PlusSum;
                            hardGoalStreak3PlusSum = aggregateData?.hardGoalStreak3PlusSum;
                            usedAggregate = true;
                            logger.info(`getUsageStats: Using pre-computed aggregate ${aggregateDocId} (${aggStartDate} to ${aggEndDate}): ${totalUniqueUsers} unique users, ${totalAttempts} attempts`);
                            break; // Found matching aggregate
                        } else {
                            logger.info(`getUsageStats: Aggregate ${aggregateDocId} found but dates don't match. Aggregate: ${aggStartDate} to ${aggEndDate}, Requested: ${startDate} to ${endDate}`);
                        }
                    }
                } catch (aggregateError) {
                    logger.warn(`getUsageStats: Error reading aggregate ${aggregateDocId}:`, aggregateError);
                }
            }

            // If no aggregate found, calculate manually from daily stats
            if (!usedAggregate) {
                logger.info(`getUsageStats: No matching aggregate, calculating manually for range ${startDate} to ${endDate}`);
                const uniqueUserIds = new Set<string>();
                let fallbackUniqueUsersSum = 0; // Track sum when userIds unavailable
                let hasUserIds = false;

                // Initialize streak sums for manual calculation
                puzzleStreak3PlusSum = 0;
                easyGoalStreak3PlusSum = 0;
                mediumGoalStreak3PlusSum = 0;
                hardGoalStreak3PlusSum = 0;

                for (const stat of stats) {
                    // Sum total attempts from daily stats
                    totalAttempts += stat.totalAttempts;

                    // Add user IDs from already-fetched stats (no need to re-query database)
                    if (stat.userIds && Array.isArray(stat.userIds) && stat.userIds.length > 0) {
                        stat.userIds.forEach((uid: string) => uniqueUserIds.add(uid));
                        hasUserIds = true;
                    } else {
                        // Fallback: use uniqueUsers count if userIds not available
                        fallbackUniqueUsersSum += stat.uniqueUsers || 0;
                    }

                    // Sum streak counts
                    puzzleStreak3PlusSum += stat.puzzleStreak3PlusCount || 0;
                    easyGoalStreak3PlusSum += stat.easyGoalStreak3PlusCount || 0;
                    mediumGoalStreak3PlusSum += stat.mediumGoalStreak3PlusCount || 0;
                    hardGoalStreak3PlusSum += stat.hardGoalStreak3PlusCount || 0;
                }

                // Use actual unique user count if we have userIds, otherwise use fallback sum
                // (fallback is less accurate as it may double-count users across days)
                totalUniqueUsers = hasUserIds ? uniqueUserIds.size : fallbackUniqueUsersSum;

                if (!hasUserIds && stats.length > 0) {
                    logger.warn(`getUsageStats: No userIds arrays found, using fallbackUniqueUsersSum=${fallbackUniqueUsersSum} (may overcount)`);
                }
                logger.info(`getUsageStats: Calculated ${totalUniqueUsers} unique users, ${totalAttempts} attempts from ${stats.length} daily stats`);
            }

            // If aggregateByMonth is requested, try to use pre-computed monthly stats from aggregate_allTime
            let finalStats = stats;
            if (aggregateByMonth && stats.length > 0) {
                // Check if aggregate_allTime has monthly stats
                try {
                    const aggregateDoc = await db.collection("usageStats").doc("aggregate_allTime").get();
                    if (aggregateDoc.exists) {
                        const aggregateData = aggregateDoc.data();
                        const monthlyStats = aggregateData?.monthlyStats as Record<string, {
                            uniqueUsers: number;
                            totalAttempts: number;
                            puzzleStreak3PlusSum?: number;
                            easyGoalStreak3PlusSum?: number;
                            mediumGoalStreak3PlusSum?: number;
                            hardGoalStreak3PlusSum?: number;
                        }> | undefined;

                        if (monthlyStats && typeof monthlyStats === "object") {
                            // Use pre-computed monthly stats
                            finalStats = Object.entries(monthlyStats)
                                .filter(([monthKey]) => monthKey >= startDate.substring(0, 7) && monthKey <= endDate.substring(0, 7))
                                .sort((a, b) => a[0].localeCompare(b[0]))
                                .map(([monthKey, data]) => ({
                                    puzzleId: monthKey, // YYYY-MM format
                                    uniqueUsers: data.uniqueUsers,
                                    totalAttempts: data.totalAttempts,
                                    // Map streak sums to count fields for UI compatibility
                                    puzzleStreak3PlusCount: data.puzzleStreak3PlusSum || 0,
                                    easyGoalStreak3PlusCount: data.easyGoalStreak3PlusSum || 0,
                                    mediumGoalStreak3PlusCount: data.mediumGoalStreak3PlusSum || 0,
                                    hardGoalStreak3PlusCount: data.hardGoalStreak3PlusSum || 0,
                                }));

                            logger.info(`getUsageStats: Using pre-computed monthly stats from aggregate_allTime: ${finalStats.length} months`);
                        } else {
                            // Fallback: aggregate manually from daily stats
                            logger.warn(`getUsageStats: aggregate_allTime missing monthlyStats, falling back to manual aggregation`);
                            finalStats = aggregateMonthlyFromDaily(stats);
                        }
                    } else {
                        // Fallback: aggregate manually from daily stats
                        logger.warn(`getUsageStats: aggregate_allTime document not found, falling back to manual aggregation`);
                        finalStats = aggregateMonthlyFromDaily(stats);
                    }
                } catch (error) {
                    logger.error(`getUsageStats: Error reading aggregate_allTime, falling back to manual aggregation:`, error);
                    finalStats = aggregateMonthlyFromDaily(stats);
                }
            }

            function aggregateMonthlyFromDaily(dailyStats: UsageStatsEntry[]): UsageStatsEntry[] {
                const monthlyMap = new Map<string, {
                    userIds: Set<string>;
                    totalAttempts: number;
                    puzzleStreak3PlusCount: number;
                    easyGoalStreak3PlusCount: number;
                    mediumGoalStreak3PlusCount: number;
                    hardGoalStreak3PlusCount: number;
                }>();

                for (const stat of dailyStats) {
                    const monthKey = stat.puzzleId.substring(0, 7); // YYYY-MM format
                    const existing = monthlyMap.get(monthKey) || {
                        userIds: new Set<string>(),
                        totalAttempts: 0,
                        puzzleStreak3PlusCount: 0,
                        easyGoalStreak3PlusCount: 0,
                        mediumGoalStreak3PlusCount: 0,
                        hardGoalStreak3PlusCount: 0,
                    };

                    // Add user IDs to the set for this month (automatically deduplicates)
                    if (stat.userIds && Array.isArray(stat.userIds)) {
                        stat.userIds.forEach(uid => existing.userIds.add(uid));
                    }

                    existing.totalAttempts += stat.totalAttempts;
                    // Sum streak counts for the month
                    existing.puzzleStreak3PlusCount += stat.puzzleStreak3PlusCount || 0;
                    existing.easyGoalStreak3PlusCount += stat.easyGoalStreak3PlusCount || 0;
                    existing.mediumGoalStreak3PlusCount += stat.mediumGoalStreak3PlusCount || 0;
                    existing.hardGoalStreak3PlusCount += stat.hardGoalStreak3PlusCount || 0;
                    monthlyMap.set(monthKey, existing);
                }

                const result = Array.from(monthlyMap.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([monthKey, data]) => ({
                        puzzleId: monthKey,
                        uniqueUsers: data.userIds.size,
                        totalAttempts: data.totalAttempts,
                        puzzleStreak3PlusCount: data.puzzleStreak3PlusCount,
                        easyGoalStreak3PlusCount: data.easyGoalStreak3PlusCount,
                        mediumGoalStreak3PlusCount: data.mediumGoalStreak3PlusCount,
                        hardGoalStreak3PlusCount: data.hardGoalStreak3PlusCount,
                    }));

                logger.info(`getUsageStats: Manually aggregated ${dailyStats.length} daily stats into ${result.length} monthly stats`);
                return result;
            }

            logger.info(`getUsageStats: Returning ${finalStats.length} entries, ${totalUniqueUsers} total unique users, ${totalAttempts} total attempts`);

            // Strip userIds from response - needed server-side for dedup but not by the client
            const sanitizedStats = finalStats.map(({ userIds: _userIds, ...rest }) => rest);

            return {
                success: true,
                stats: sanitizedStats,
                count: finalStats.length,
                totalUniqueUsers,
                totalAttempts,
                // Streak sums from aggregate or manual calculation
                puzzleStreak3PlusSum,
                easyGoalStreak3PlusSum,
                mediumGoalStreak3PlusSum,
                hardGoalStreak3PlusSum,
            };

        } catch (error) {
            logger.error("getUsageStats: Error fetching stats:", error);
            throw new HttpsError("internal", "Failed to fetch usage stats.");
        }
    }
);
