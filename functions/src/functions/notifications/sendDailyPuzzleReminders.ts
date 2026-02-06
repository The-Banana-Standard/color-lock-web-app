/**
 * Scheduled Cloud Function to send daily puzzle reminder notifications.
 * Runs every hour at :30 past the hour (e.g., 12:30, 1:30, 2:30, etc.).
 * Sends notifications to users at 8:30 PM in their timezone if they haven't played today's puzzle.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, admin, logger } from "../../config.js";
import { DateTime } from "luxon";

export const sendDailyPuzzleReminders = onSchedule(
    {
        schedule: "30 * * * *", // Every hour at :30
        timeZone: "UTC",
        memory: "512MiB",
        timeoutSeconds: 540, // 9 minutes (max for scheduled functions)
    },
    async () => {
        logger.info("sendDailyPuzzleReminders: Starting execution");

        let sentCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        try {
            // Step 1: Get current UTC time
            // Note: We calculate puzzle IDs per-user based on their timezone
            // since the client app generates puzzle IDs using local time
            const nowUtc = DateTime.utc();

            // Step 2 & 3: Get all users with FCM tokens and timezones, filter for 8:30 PM local time
            // Note: Firestore only allows one inequality filter per query, so we filter for fcmToken
            // and then filter for timezone in code
            const usersSnapshot = await db.collection("users")
                .where("fcmToken", "!=", null)
                .get();

            logger.info(`sendDailyPuzzleReminders: Found ${usersSnapshot.size} users with FCM tokens`);

            // Step 2.5: Deduplicate users by FCM token - prioritize non-anonymous accounts
            // This prevents sending duplicate notifications when a device has both an anonymous and authenticated account
            interface UserInfo {
                userId: string;
                fcmToken: string;
                timezone: string;
                isAnonymous: boolean;
            }

            interface UserToNotify extends UserInfo {
                allUserIdsForToken: string[]; // All user IDs that share this FCM token (for checking if ANY played)
            }

            const tokenToUsersMap = new Map<string, UserInfo[]>();

            // First pass: Collect valid users and their FCM tokens
            const validUsers: { userId: string; fcmToken: string; timezone: string }[] = [];
            for (const userDoc of usersSnapshot.docs) {
                const userId = userDoc.id;
                const userData = userDoc.data();
                const fcmToken = userData.fcmToken;
                const timezone = userData.timezone;

                if (!fcmToken || !timezone) {
                    skippedCount++;
                    continue;
                }

                validUsers.push({ userId, fcmToken, timezone });
            }

            // Batch fetch auth info (up to 100 per call) instead of N+1 individual calls
            const authInfoMap = new Map<string, boolean>(); // uid -> isAnonymous
            const BATCH_SIZE = 100;
            for (let i = 0; i < validUsers.length; i += BATCH_SIZE) {
                const batch = validUsers.slice(i, i + BATCH_SIZE);
                const identifiers = batch.map(u => ({ uid: u.userId }));
                try {
                    const result = await admin.auth().getUsers(identifiers);
                    for (const user of result.users) {
                        authInfoMap.set(user.uid, user.providerData.length === 0);
                    }
                    for (const notFound of result.notFound) {
                        logger.warn(`sendDailyPuzzleReminders: User not found in Auth: ${JSON.stringify(notFound)}`);
                    }
                } catch (authError) {
                    logger.warn(`sendDailyPuzzleReminders: Failed to batch fetch auth info:`, authError);
                }
            }

            // Group users by FCM token
            for (const { userId, fcmToken, timezone } of validUsers) {
                const isAnonymous = authInfoMap.get(userId) ?? true; // Default to anonymous if lookup failed

                const userInfo: UserInfo = { userId, fcmToken, timezone, isAnonymous };

                if (!tokenToUsersMap.has(fcmToken)) {
                    tokenToUsersMap.set(fcmToken, []);
                }
                tokenToUsersMap.get(fcmToken)!.push(userInfo);
            }

            // Second pass: Select one user per FCM token (prefer non-anonymous)
            // Also track ALL userIds for that token so we can check if ANY of them played today
            const usersToNotify: UserToNotify[] = [];

            for (const [fcmToken, users] of tokenToUsersMap.entries()) {
                // Collect all userIds associated with this FCM token
                const allUserIdsForToken = users.map(u => u.userId);

                // Find non-anonymous user if exists
                const nonAnonymousUser = users.find(u => !u.isAnonymous);

                if (nonAnonymousUser) {
                    usersToNotify.push({ ...nonAnonymousUser, allUserIdsForToken });
                    if (users.length > 1) {
                        logger.info(`sendDailyPuzzleReminders: Token ${fcmToken.substring(0, 10)}... has ${users.length} accounts (${allUserIdsForToken.join(', ')}), prioritizing non-anonymous user ${nonAnonymousUser.userId}`);
                    }
                } else {
                    // All users are anonymous, pick the first one
                    usersToNotify.push({ ...users[0], allUserIdsForToken });
                }
            }

            logger.info(`sendDailyPuzzleReminders: After deduplication, ${usersToNotify.length} users to potentially notify`);

            const targetHour = 20; // 8 PM
            const targetMinute = 30; // 30 minutes

            // Process each deduplicated user
            for (const userInfo of usersToNotify) {
                const { userId, fcmToken, timezone } = userInfo;

                try {
                    // Validate timezone before using it
                    let userLocalTime: DateTime;
                    try {
                        userLocalTime = nowUtc.setZone(timezone);
                        if (!userLocalTime.isValid) {
                            logger.warn(`sendDailyPuzzleReminders: Invalid timezone for user ${userId}: ${timezone}, skipping`);
                            skippedCount++;
                            continue;
                        }
                    } catch (tzError) {
                        logger.warn(`sendDailyPuzzleReminders: Error validating timezone for user ${userId}: ${timezone}`, tzError);
                        skippedCount++;
                        continue;
                    }

                    // Check if it's 8:30 PM in user's timezone
                    if (userLocalTime.hour !== targetHour || userLocalTime.minute !== targetMinute) {
                        continue; // Not the right time for this user
                    }

                    logger.info(`sendDailyPuzzleReminders: User ${userId} is at 8:30 PM in ${timezone}`);

                    // Step 3: Calculate today's puzzle ID based on user's local time
                    // Client apps generate puzzle IDs using local time, so we must do the same
                    const todayPuzzleId = userLocalTime.toFormat("yyyy-MM-dd");
                    const yesterdayPuzzleId = userLocalTime.minus({ days: 1 }).toFormat("yyyy-MM-dd");

                    logger.info(`sendDailyPuzzleReminders: User ${userId} - timezone: ${timezone}, UTC: ${nowUtc.toISO()}, local: ${userLocalTime.toISO()}, todayPuzzleId: ${todayPuzzleId}`);

                    // Step 4: Fetch today's puzzle scores and check if ANY user on this device has played
                    const dailyScoresRef = db.collection("dailyScoresV2").doc(todayPuzzleId);
                    const dailyScoresSnap = await dailyScoresRef.get();

                    const uniquePlayerIds = new Set<string>();
                    let todaysTotalPlayers = 0;

                    if (dailyScoresSnap.exists) {
                        const data = dailyScoresSnap.data();

                        // Count all entries from all difficulties
                        for (const difficulty of ["easy", "medium", "hard"]) {
                            const diffData = data?.[difficulty];
                            if (diffData && typeof diffData === "object") {
                                // Add to unique set for device check
                                Object.keys(diffData).forEach(uid => uniquePlayerIds.add(uid));
                                // Count all entries for total players
                                todaysTotalPlayers += Object.keys(diffData).length;
                                // If you want to just count unique ids
                                // todaysTotalPlayers = uniquePlayerIds.size;
                            }
                        }
                    }

                    // Check if ANY user on this device has already played today's puzzle
                    // This handles the case where a device has multiple accounts (e.g., guest + authenticated)
                    const playedUserIds = userInfo.allUserIdsForToken.filter(uid => uniquePlayerIds.has(uid));

                    logger.info(`sendDailyPuzzleReminders: User ${userId} check for ${todayPuzzleId} - AllUserIds: [${userInfo.allUserIdsForToken.join(', ')}], PlayedUserIds: [${playedUserIds.join(', ')}], TodayTotalPlayers: ${todaysTotalPlayers}`);

                    if (playedUserIds.length > 0) {
                        logger.info(`sendDailyPuzzleReminders: User has played - NOT sending notification. Device already played ${todayPuzzleId} via user(s): ${playedUserIds.join(', ')}, skipping notification to ${userId}`);
                        skippedCount++;
                        continue;
                    }

                    logger.info(`sendDailyPuzzleReminders: User ${userId} has not played today's puzzle (${todayPuzzleId}) yet, will send notification`);

                    // Step 5: Determine notification message based on streak status
                    const userHistoryRef = db.collection("userPuzzleHistory").doc(userId);
                    const levelAgnosticRef = userHistoryRef.collection("leaderboard").doc("levelAgnostic");
                    const levelAgnosticSnap = await levelAgnosticRef.get();

                    let notificationTitle: string;
                    let notificationBody: string;

                    if (levelAgnosticSnap.exists) {
                        const laData = levelAgnosticSnap.data();
                        const lastCompletedDate = laData?.lastPuzzleCompletedDate;
                        const currentStreak = typeof laData?.currentPuzzleCompletedStreak === "number"
                            ? laData.currentPuzzleCompletedStreak
                            : 0;

                        // Case A: User played yesterday (streak is active)
                        if (lastCompletedDate === yesterdayPuzzleId) {
                            notificationTitle = "Don't lose your streak!";
                            notificationBody = `Don't forget to solve today's Color Lock! You're in danger of losing your ${currentStreak} day streak!`;
                            logger.info(`sendDailyPuzzleReminders: User ${userId} has active ${currentStreak} day streak`);
                        } else {
                            // Case B: User didn't play yesterday (no active streak)
                            notificationTitle = "Color Lock Daily Puzzle";
                            notificationBody = `It looks like you haven't completed today's Color Lock. Join the ${todaysTotalPlayers} players who have solved today's puzzle!`;
                            logger.info(`sendDailyPuzzleReminders: User ${userId} has no active streak`);
                        }
                    } else {
                        // No history, treat as Case B
                        notificationTitle = "Color Lock Daily Puzzle";
                        notificationBody = `It looks like you haven't completed today's Color Lock. Join the ${todaysTotalPlayers} players who have solved today's puzzle!`;
                        logger.info(`sendDailyPuzzleReminders: User ${userId} has no puzzle history`);
                    }

                    // Step 6: Send FCM notification
                    const message = {
                        token: fcmToken,
                        notification: {
                            title: notificationTitle,
                            body: notificationBody,
                        },
                        data: {
                            screen: "daily_puzzle",
                            puzzleId: todayPuzzleId,
                        },
                        android: {
                            priority: "high" as const,
                        },
                        apns: {
                            headers: {
                                "apns-priority": "10",
                            },
                        },
                    };

                    await admin.messaging().send(message);
                    sentCount++;
                    logger.info(`sendDailyPuzzleReminders: Notification sent successfully to user ${userId}`);

                } catch (userError) {
                    errorCount++;
                    logger.error(`sendDailyPuzzleReminders: Error processing user ${userId}:`, userError);
                    // Continue processing other users
                }
            }

            const summary = {
                sent: sentCount,
                skipped: skippedCount,
                errors: errorCount,
            };

            logger.info(`sendDailyPuzzleReminders: Execution complete`, summary);

        } catch (error) {
            logger.error("sendDailyPuzzleReminders: Fatal error during execution:", error);
            logger.error("sendDailyPuzzleReminders: Summary at failure:", {
                sent: sentCount,
                skipped: skippedCount,
                errors: errorCount,
            });
        }
    }
);
