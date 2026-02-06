/**
 * Shared helper functions used across multiple Cloud Functions.
 */

import { DifficultyLevel } from "../../shared/types";
import { db, logger } from "./config.js";

/**
 * Normalize difficulty input to a valid DifficultyLevel enum value.
 */
export function normalizeDifficulty(d: DifficultyLevel | "easy" | "medium" | "hard"): DifficultyLevel {
    const val = typeof d === "string" ? d.toLowerCase() : d;
    if (val === DifficultyLevel.Easy || val === "easy") return DifficultyLevel.Easy;
    if (val === DifficultyLevel.Medium || val === "medium") return DifficultyLevel.Medium;
    return DifficultyLevel.Hard;
}

/**
 * Check if a date is exactly one day after another date.
 * Used for streak calculations.
 */
export function isDayAfter(prevDateStr: string | null | undefined, currentDateStr: string): boolean {
    if (!prevDateStr) return false;
    try {
        const prev = new Date(prevDateStr);
        const curr = new Date(currentDateStr);
        const prevUTC = Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), prev.getUTCDate());
        const nextPrev = new Date(prevUTC);
        nextPrev.setUTCDate(new Date(prevUTC).getUTCDate() + 1);
        const expected = `${nextPrev.getUTCFullYear()}-${String(nextPrev.getUTCMonth() + 1).padStart(2, '0')}-${String(nextPrev.getUTCDate()).padStart(2, '0')}`;
        return expected === currentDateStr;
    } catch {
        return false;
    }
}

/**
 * Get the lowest daily score for a puzzle/difficulty, optionally excluding a user.
 */
export async function getLowestDailyScore(
    puzzleId: string,
    difficulty: DifficultyLevel,
    excludeUserId?: string
): Promise<number | null> {
    const docSnap = await db.collection("dailyScoresV2").doc(puzzleId).get();
    if (!docSnap.exists) return null;

    const data = docSnap.data();
    const difficultyScores = data?.[difficulty]; // 'easy', 'medium', or 'hard'

    if (!difficultyScores || typeof difficultyScores !== "object") return null;

    let minScore: number | null = null;
    for (const userId in difficultyScores) {
        // Skip the current user when checking if they're first to beat bot
        if (excludeUserId && userId === excludeUserId) continue;

        const moves = difficultyScores[userId];
        if (typeof moves === "number" && !isNaN(moves)) {
            if (minScore === null || moves < minScore) {
                minScore = moves;
            }
        }
    }

    return minScore;
}

/**
 * Write a user's best per-difficulty score to dailyScoresV2.
 */
export async function writeDailyScoreV2(
    puzzleId: string,
    difficulty: DifficultyLevel,
    userId: string,
    moves: number
): Promise<void> {
    const ref = db.collection("dailyScoresV2").doc(puzzleId);
    await ref.set({ [difficulty]: { [userId]: moves } }, { merge: true });
}

/**
 * Check if a score qualifies for best score notification based on difficulty thresholds.
 * Easy: must beat bot by 3+ moves (userScore < algoScore - 2)
 * Medium: must beat bot by 2+ moves (userScore < algoScore - 1)
 * Hard: must beat bot by 1+ move (userScore < algoScore)
 */
export function qualifiesForBestScoreNotification(
    userScore: number,
    algoScore: number,
    difficulty: DifficultyLevel
): boolean {
    switch (difficulty) {
        case DifficultyLevel.Easy:
            return userScore < algoScore - 2;
        case DifficultyLevel.Medium:
            return userScore < algoScore - 1;
        case DifficultyLevel.Hard:
            return userScore < algoScore;
        default:
            return false;
    }
}

/**
 * Recompute ELO aggregates from eloScoreByDay map.
 * This ensures scores are accurate even if the user hasn't played recently,
 * so old scores properly "fall off" the 7-day and 30-day windows.
 */
export function computeEloAggregates(eloScoreByDay: Record<string, unknown>, today: Date): {
    eloScoreAllTime: number;
    eloScoreLast30: number;
    eloScoreLast7: number;
} {
    let eloAllTime = 0;
    let eloLast30 = 0;
    let eloLast7 = 0;

    const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const start30 = new Date(todayUTC);
    start30.setUTCDate(start30.getUTCDate() - 29);
    const start7 = new Date(todayUTC);
    start7.setUTCDate(start7.getUTCDate() - 6);

    for (const [dayStr, val] of Object.entries(eloScoreByDay)) {
        if (typeof val !== 'number' || isNaN(val)) continue;
        eloAllTime += val;
        try {
            const parts = dayStr.split('-');
            if (parts.length === 3) {
                const dUTC = Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                const d = new Date(dUTC);
                if (!isNaN(d.getTime())) {
                    if (d >= start30) eloLast30 += val;
                    if (d >= start7) eloLast7 += val;
                }
            }
        } catch {
            // Skip malformed date entries
        }
    }

    return { eloScoreAllTime: eloAllTime, eloScoreLast30: eloLast30, eloScoreLast7: eloLast7 };
}

/**
 * Send notifications to users who played today's puzzle when someone sets a new best score.
 * Only notifies users who:
 * 1. Have a score in dailyScoresV2 for this puzzle/difficulty
 * 2. Have notifyOnBestScores: true in their user document
 * 3. Have a valid FCM token
 * 4. Are NOT the user who just set the new score
 */
export async function sendBestScoreNotifications(
    puzzleId: string,
    difficulty: DifficultyLevel,
    newBestScore: number,
    scoringUserId: string
): Promise<void> {
    // Import admin dynamically to avoid circular dependency
    const { admin } = await import("./config.js");

    logger.info(`sendBestScoreNotifications: Starting for ${puzzleId}-${difficulty}, score: ${newBestScore}`);

    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Step 1: Get all user IDs who played this difficulty today
    const dailyScoresSnap = await db.collection("dailyScoresV2").doc(puzzleId).get();
    if (!dailyScoresSnap.exists) {
        logger.info("sendBestScoreNotifications: No daily scores document found, skipping");
        return;
    }

    const dailyScoresData = dailyScoresSnap.data();
    const difficultyScores = dailyScoresData?.[difficulty] as Record<string, number> | undefined;

    if (!difficultyScores || Object.keys(difficultyScores).length === 0) {
        logger.info(`sendBestScoreNotifications: No players found for ${difficulty}`);
        return;
    }

    // Exclude the user who just set the score - they don't need to be notified
    const playerUserIds = Object.keys(difficultyScores).filter(uid => uid !== scoringUserId);
    if (playerUserIds.length === 0) {
        logger.info(`sendBestScoreNotifications: No other players to notify for ${difficulty}`);
        return;
    }

    logger.info(`sendBestScoreNotifications: Found ${playerUserIds.length} other players for ${difficulty}`);

    // Step 2: Query users who have FCM tokens AND have opted into best score notifications
    const usersSnapshot = await db.collection("users")
        .where("fcmToken", "!=", null)
        .where("notifyOnBestScores", "==", true)
        .get();

    // Build a map of userId -> fcmToken for efficient lookup
    const eligibleUsers = new Map<string, string>();
    usersSnapshot.forEach(doc => {
        eligibleUsers.set(doc.id, doc.data().fcmToken);
    });

    logger.info(`sendBestScoreNotifications: ${eligibleUsers.size} users have FCM tokens and opt-in enabled`);

    // Step 3: Intersect players who played today with users who have notifications enabled
    const usersToNotify = playerUserIds.filter(uid => eligibleUsers.has(uid));
    logger.info(`sendBestScoreNotifications: ${usersToNotify.length} players to notify`);

    if (usersToNotify.length === 0) {
        return;
    }

    // Step 4: Send notifications
    const difficultyDisplay = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    const difficultyEmoji = difficulty === "easy" ? "🟢" : difficulty === "medium" ? "🟡" : "🔴";
    const notificationTitle = "New Low Score!";
    const notificationBody = `A user just set a new low score on today's ${difficultyEmoji} ${difficultyDisplay} Color Lock`;

    for (const userId of usersToNotify) {
        try {
            const fcmToken = eligibleUsers.get(userId);
            if (!fcmToken) {
                skippedCount++;
                continue;
            }

            const message = {
                token: fcmToken,
                notification: {
                    title: notificationTitle,
                    body: notificationBody,
                },
                data: {
                    screen: "daily_puzzle",
                    puzzleId: puzzleId,
                    difficulty: difficulty,
                    type: "best_score",
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
            logger.info(`sendBestScoreNotifications: Sent to user ${userId}`);

        } catch (userError: unknown) {
            errorCount++;

            // Handle invalid/expired tokens
            const errorCode = (userError as { code?: string })?.code;
            if (errorCode === 'messaging/registration-token-not-registered' ||
                errorCode === 'messaging/invalid-registration-token') {
                logger.warn(`sendBestScoreNotifications: Invalid FCM token for user ${userId}`);
            } else {
                logger.error(`sendBestScoreNotifications: Error sending to user ${userId}:`, userError);
            }
        }
    }

    logger.info(`sendBestScoreNotifications: Complete`, { sent: sentCount, skipped: skippedCount, errors: errorCount });
}

/**
 * Helper function to verify password via Firebase Auth REST API.
 * This is used for server-side password verification.
 */
export async function verifyPassword(email: string, password: string, apiKey: string): Promise<boolean> {
    const { logger } = await import("./config.js");

    try {
        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email,
                    password,
                    returnSecureToken: false,
                }),
            }
        );

        if (response.ok) {
            return true;
        }

        const errorData = await response.json();
        logger.warn(`verifyPassword: Auth verification failed:`, errorData.error?.message);
        return false;
    } catch (error) {
        logger.error(`verifyPassword: Network error during password verification:`, error);
        // In case of network error, we fail closed (reject the request)
        return false;
    }
}
