import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger as v2Logger } from "firebase-functions/v2";
import { calculateEloScore } from "./eloUtils";
import { assertAdmin } from "./adminAuth";
import { GameStatistics, defaultStats } from "../../src/types/stats";
import { DifficultyLevel } from "../../src/types/settings";
import { DateTime } from "luxon";

/**
 * App Check Strategy:
 * 
 * In this codebase, we use a dynamic approach to App Check enforcement:
 * 
 * 1. Production Environment: 
 *    - App Check is strictly enforced (`enforceAppCheck: true`)
 *    - All requests must have valid App Check tokens
 *    - Full security is maintained
 * 
 * 2. Emulator/Development Environment:
 *    - App Check is automatically disabled (`enforceAppCheck: false`)
 *    - Allows for easier local testing without dealing with App Check complexities
 *    - The environment is detected using multiple methods (FUNCTIONS_EMULATOR env var, etc.)
 * 
 * This approach maintains security in production while enabling seamless local development.
 * The `getAppCheckConfig()` helper function handles this logic.
 */

// Initialize Firebase app
admin.initializeApp();

// Initialize Firestore client
const db = admin.firestore();

// Configure logging (choose v1 or v2 logger)
const logger = v2Logger; // Using v2 logger

// Utility function to determine App Check enforcement based on environment
function getAppCheckConfig() {
    // Multiple ways to detect emulator environment
    const isEmulatorEnv = 
        process.env.FUNCTIONS_EMULATOR === 'true' || 
        process.env.FIRESTORE_EMULATOR_HOST !== undefined ||
        process.env.FIREBASE_CONFIG?.includes('"emulators"') ||
        process.env.NODE_ENV === 'development';
    
    // Log the detection for debugging purposes
    logger.info(`Running in ${isEmulatorEnv ? 'emulator/development' : 'production'} environment. App Check will be ${isEmulatorEnv ? 'disabled' : 'enforced'}.`);
    
    return {
        enforceAppCheck: !isEmulatorEnv, // false in emulator, true in production
    };
}

/**
 * v2 Firebase Cloud Function to fetch a puzzle by date
 */
export const fetchPuzzle = onCall(
    {
        // Runtime options
        memory: "256MiB",
        timeoutSeconds: 60,
        // App Check options
        ...getAppCheckConfig(), // Use helper to determine App Check enforcement
    },
    async (request) => {
        // request.app will be defined if enforceAppCheck is true and validation passed
        // request.auth contains user authentication info (or null if unauthenticated)
        const userId = request.auth?.uid || "guest/unauthenticated";
        logger.info(`fetchPuzzle invoked by user: ${userId}, App Check verified: ${!!request.app}`);

        // Validate Input Data
        const date = request.data.date;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            logger.error("Missing or invalid 'date' parameter in fetchPuzzle call.");
            throw new HttpsError("invalid-argument", "The function must be called with a valid \"date\" argument in YYYY-MM-DD format.");
        }

        // Function Logic
        try {
            logger.info(`Attempting to fetch puzzle for date: ${date}`);
            const puzzleRef = db.collection("puzzles").doc(date);
            const puzzleSnap = await puzzleRef.get();

            if (puzzleSnap.exists) {
                logger.info("Puzzle found in Firestore");
                const puzzleData = puzzleSnap.data();

                // Add stricter validation
                if (!puzzleData || typeof puzzleData.algoScore !== "number" || !puzzleData.targetColor || !Array.isArray(puzzleData.states) || puzzleData.states.length === 0 || !Array.isArray(puzzleData.actions)) {
                    logger.error(`Invalid puzzle data format found for date: ${date}`, puzzleData);
                    throw new HttpsError("internal", "Invalid puzzle data format found.");
                }

                return { success: true, data: puzzleData }; // Return data on success
            } else {
                logger.warn(`No puzzle found for date: ${date}`);
                throw new HttpsError("not-found", `Puzzle not found for date: ${date}`);
            }
        } catch (error) {
            logger.error(`Error in fetchPuzzle for date ${date}:`, error);
            if (error instanceof HttpsError) {
                throw error; // Re-throw HttpsError
            }
            throw new HttpsError("internal", "Internal server error fetching puzzle");
        }
    }
);

/**
 * v2 Firebase Cloud Function to fetch all puzzles (easy/medium/hard) for a date from puzzlesV2
 */
export const fetchPuzzleV2 = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        const userId = request.auth?.uid || "guest/unauthenticated";
        const date = request.data?.date as string | undefined;

        logger.info(`fetchPuzzleV2 invoked by user: ${userId}, date: ${date}`);

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            logger.error("Missing or invalid 'date' parameter in fetchPuzzleV2 call.");
            throw new HttpsError("invalid-argument", "The function must be called with a valid \"date\" argument in YYYY-MM-DD format.");
        }

        const difficulties = ["easy", "medium", "hard"] as const;

        try {
            logger.info(`fetchPuzzleV2: Attempting to fetch puzzles for date: ${date}`);
            const docRefs = difficulties.map((difficulty) => db.collection("puzzlesV2").doc(`${date}-${difficulty}`));
            const docSnaps = await Promise.all(docRefs.map((ref) => ref.get()));

            const missingDifficulties = docSnaps
                .map((snap, idx) => (!snap.exists ? difficulties[idx] : null))
                .filter((v): v is typeof difficulties[number] => v !== null);

            if (missingDifficulties.length > 0) {
                logger.warn(`fetchPuzzleV2: Missing puzzle documents for difficulties: ${missingDifficulties.join(", ")}`);
                throw new HttpsError("not-found", `Puzzle(s) not found for difficulties: ${missingDifficulties.join(", ")}`);
            }

            const puzzleData = {} as Record<(typeof difficulties)[number], any>;

            docSnaps.forEach((snap, idx) => {
                const difficulty = difficulties[idx];
                const data = snap.data();

                if (
                    !data ||
                    typeof data.algoScore !== "number" ||
                    typeof data.targetColor !== "string" ||
                    !Array.isArray(data.states) ||
                    data.states.length === 0 ||
                    !Array.isArray(data.actions) ||
                    !Array.isArray(data.colorMap) ||
                    data.colorMap.length === 0
                ) {
                    logger.error(`fetchPuzzleV2: Invalid puzzle data format for ${date}-${difficulty}`, data);
                    throw new HttpsError("internal", `Invalid puzzle data format for difficulty: ${difficulty}`);
                }

                puzzleData[difficulty] = data;
            });

            return { success: true, data: puzzleData };
        } catch (error) {
            logger.error(`fetchPuzzleV2: Error fetching puzzles for date ${date}:`, error);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError("internal", "Internal server error fetching puzzle");
        }
    }
);

// --- New: Record Puzzle History (per data_sctructure_1.json) ---

interface RecordPuzzlePayload {
    puzzle_id: string;
    user_id?: string;
    difficulty: DifficultyLevel | "easy" | "medium" | "hard";
    moves: number;
    hintUsed: boolean;
    botMoves: number;
    win_loss: "win" | "loss";
    attemptNumber?: number;
    // NEW OPTIONAL FIELDS for best scores tracking:
    states?: any[];      // PuzzleGrid[] (Firebase admin doesn't have frontend types)
    actions?: number[];
    targetColor?: string;
    colorMap?: number[];
}

// Streak counts for usage stats
interface StreakCounts {
    puzzleStreak3PlusCount: number;
    easyGoalStreak3PlusCount: number;
    mediumGoalStreak3PlusCount: number;
    hardGoalStreak3PlusCount: number;
}

// Export helper functions for testing
export function normalizeDifficulty(d: RecordPuzzlePayload["difficulty"]): DifficultyLevel {
    const val = typeof d === "string" ? d.toLowerCase() : d;
    if (val === DifficultyLevel.Easy || val === "easy") return DifficultyLevel.Easy;
    if (val === DifficultyLevel.Medium || val === "medium") return DifficultyLevel.Medium;
    return DifficultyLevel.Hard;
}

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
 * Check if a score qualifies for best score notification based on difficulty thresholds
 * Easy: must beat bot by 3+ moves (userScore < algoScore - 2)
 * Medium: must beat bot by 2+ moves (userScore < algoScore - 1)
 * Hard: must beat bot by 1+ move (userScore < algoScore)
 */
function qualifiesForBestScoreNotification(
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
 * Send notifications to users who played today's puzzle when someone sets a new best score
 * Only notifies users who:
 * 1. Have a score in dailyScoresV2 for this puzzle/difficulty
 * 2. Have notifyOnBestScores: true in their user document
 * 3. Have a valid FCM token
 * 4. Are NOT the user who just set the new score
 */
async function sendBestScoreNotifications(
    puzzleId: string,
    difficulty: DifficultyLevel,
    newBestScore: number,
    scoringUserId: string
): Promise<void> {
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

        } catch (userError: any) {
            errorCount++;

            // Handle invalid/expired tokens
            if (userError?.code === 'messaging/registration-token-not-registered' ||
                userError?.code === 'messaging/invalid-registration-token') {
                logger.warn(`sendBestScoreNotifications: Invalid FCM token for user ${userId}`);
            } else {
                logger.error(`sendBestScoreNotifications: Error sending to user ${userId}:`, userError);
            }
        }
    }

    logger.info(`sendBestScoreNotifications: Complete`, { sent: sentCount, skipped: skippedCount, errors: errorCount });
}

/**
 * Firestore trigger that sends best score notifications when a new best score is written.
 * Triggers on creates and updates to bestScores/{docId} documents.
 */
export const onBestScoreWritten = onDocumentWritten(
    {
        document: "bestScores/{docId}",
        memory: "256MiB",
        timeoutSeconds: 60,
    },
    async (event) => {
        const before = event.data?.before?.data();
        const after = event.data?.after?.data();

        // Skip if document was deleted
        if (!after) {
            logger.info("onBestScoreWritten: Document deleted, skipping");
            return;
        }

        // Skip if score didn't change (same user updating other fields)
        if (before?.userScore === after.userScore && before?.userId === after.userId) {
            logger.info("onBestScoreWritten: Score unchanged, skipping");
            return;
        }

        // Parse difficulty from docId (format: YYYY-MM-DD-difficulty)
        const docId = event.params.docId;
        const parts = docId.split("-");
        if (parts.length !== 4) {
            logger.warn("onBestScoreWritten: Invalid docId format", { docId });
            return;
        }
        const validDifficulties = [DifficultyLevel.Easy, DifficultyLevel.Medium, DifficultyLevel.Hard];
        const difficultyStr = parts[3];
        if (!validDifficulties.includes(difficultyStr as DifficultyLevel)) {
            logger.warn("onBestScoreWritten: Invalid difficulty", { docId, difficulty: difficultyStr });
            return;
        }
        const difficulty = difficultyStr as DifficultyLevel;
        const puzzleId = parts.slice(0, 3).join("-"); // 'YYYY-MM-DD'

        // Fetch bot score from puzzle document
        const puzzleDoc = await db.collection("puzzlesV2").doc(docId).get();
        const botMoves = puzzleDoc.data()?.algoScore;

        if (typeof botMoves !== "number") {
            logger.warn("onBestScoreWritten: Could not fetch bot score", { docId });
            return;
        }

        // Check if score qualifies for notification
        if (!qualifiesForBestScoreNotification(after.userScore, botMoves, difficulty)) {
            logger.info("onBestScoreWritten: Score doesn't meet threshold", {
                userScore: after.userScore,
                botMoves,
                difficulty
            });
            return;
        }

        logger.info("onBestScoreWritten: Sending notifications", {
            puzzleId,
            difficulty,
            userScore: after.userScore,
            userId: after.userId
        });

        // Send notifications
        await sendBestScoreNotifications(puzzleId, difficulty, after.userScore, after.userId);
    }
);

async function getLowestDailyScore(
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

export const recordPuzzleHistory = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        if (!request.auth) {
            logger.error("recordPuzzleHistory: unauthenticated call");
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;
        const payload = request.data as RecordPuzzlePayload;

        if (!payload || !payload.puzzle_id || !payload.difficulty || typeof payload.moves !== 'number' || typeof payload.hintUsed !== 'boolean' || typeof payload.botMoves !== 'number' || (payload.win_loss !== 'win' && payload.win_loss !== 'loss')) {
            throw new HttpsError("invalid-argument", "Invalid or missing fields in payload.");
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.puzzle_id)) {
            throw new HttpsError("invalid-argument", "Invalid puzzle_id format. Expected YYYY-MM-DD.");
        }
        if (payload.user_id && payload.user_id !== userId) {
            throw new HttpsError("permission-denied", "User ID mismatch.");
        }

        // Validate optional state/action history if provided
        if (payload.states || payload.actions) {
            if (payload.states && !Array.isArray(payload.states)) {
                throw new HttpsError("invalid-argument", "states must be an array");
            }
            if (payload.actions && !Array.isArray(payload.actions)) {
                throw new HttpsError("invalid-argument", "actions must be an array");
            }
            if (payload.states && payload.actions && payload.states.length !== payload.actions.length) {
                logger.warn("State/action array length mismatch", {
                    statesLength: payload.states?.length,
                    actionsLength: payload.actions?.length
                });
            }
        }

        const puzzleId = payload.puzzle_id;
        const difficulty = normalizeDifficulty(payload.difficulty);
        const moves = payload.moves;
        const hintUsed = payload.hintUsed;
        const botMoves = payload.botMoves;
        const isWin = payload.win_loss === 'win';

        // Determine firstToBeatBot with difficulty-specific thresholds
        // Hard: beat bot (moves < botMoves)
        // Medium: beat bot by 2+ moves (moves < botMoves - 1)
        // Easy: beat bot by 3+ moves (moves < botMoves - 2)
        // Exclude the current user's previous scores when checking if they're first to beat bot
        let qualifiesVsBot = false;
        if (difficulty === DifficultyLevel.Hard) {
            qualifiesVsBot = moves < botMoves;
        } else if (difficulty === DifficultyLevel.Medium) {
            qualifiesVsBot = moves < (botMoves - 1);
        } else if (difficulty === DifficultyLevel.Easy) {
            qualifiesVsBot = moves < (botMoves - 2);
        }

        const lowestExisting = await getLowestDailyScore(puzzleId, difficulty, userId);
        const firstToBeatBot = qualifiesVsBot && (lowestExisting === null || lowestExisting > moves);

        logger.info(`firstToBeatBot calculation: difficulty=${difficulty}, moves=${moves}, botMoves=${botMoves}, qualifiesVsBot=${qualifiesVsBot}, lowestExisting=${lowestExisting}, firstToBeatBot=${firstToBeatBot}`);
        // These will be computed using global attempt number inside the transaction
        let firstTry = false;
        let elo = 0;

        const userHistoryRef = db.collection("userPuzzleHistory").doc(userId);
        const puzzleRef = userHistoryRef.collection("puzzles").doc(puzzleId);
        const levelAgnosticRef = userHistoryRef.collection("leaderboard").doc("levelAgnostic");
        const difficultyRef = userHistoryRef.collection("leaderboard").doc(difficulty);

        logger.info("recordPuzzleHistory: Starting transaction", {
            userId,
            puzzleId,
            difficulty,
            moves,
            isWin,
            hintUsed,
            puzzlePath: puzzleRef.path,
            levelAgnosticPath: levelAgnosticRef.path,
            difficultyPath: difficultyRef.path
        });

        let v2Writes: Array<{ diffKey: DifficultyLevel; moves: number }> = [];

        // Fetch user display name for bestScores
        let userName = `User_${userId.substring(0, 6)}`;
        try {
            const userRecord = await admin.auth().getUser(userId);
            userName = userRecord.displayName || userName;
        } catch (e) {
            logger.warn(`recordPuzzleHistory: Failed to fetch displayName for user ${userId}`, e);
        }

        await db.runTransaction(async (tx) => {
            // Read all docs first (all reads must happen before any writes in Firestore transactions)
            const dailyScoresV2Ref = db.collection("dailyScoresV2").doc(puzzleId);
            const bestScoresRef = db.collection("bestScores").doc(`${puzzleId}-${difficulty}`);

            const [puzzleSnap, laSnap, dSnap, bestScoresSnap] = await Promise.all([
                tx.get(puzzleRef),
                tx.get(levelAgnosticRef),
                tx.get(difficultyRef),
                tx.get(bestScoresRef)
            ]);

            // Prepare in-memory data
            const puzzleData = puzzleSnap.exists ? (puzzleSnap.data() || {}) : {} as Record<string, unknown>;
            const la = laSnap.exists ? (laSnap.data() as any) : {};
            const d = dSnap.exists ? (dSnap.data() as any) : {};

            // Compute difficulty-specific attempt count
            const diffKey = difficulty; // 'easy' | 'medium' | 'hard'
            // Read existing difficulty data once (used throughout for both win/loss cases)
            const existingDiffData = (puzzleData as any)[diffKey] as {
                attempts?: number;
                attemptNumber?: number;
                lowestMovesAttemptNumber?: number;
                moves?: number;
                hintUsed?: boolean;
                firstTry?: boolean;
                firstToBeatBot?: boolean;
                eloScore?: number;
                elo?: number;
                attemptToTieBot?: number;
                attemptToBeatBot?: number;
            } | undefined;
            const prevDifficultyAttempts = typeof existingDiffData?.attempts === 'number' ? existingDiffData.attempts : 0;
            const solutionUsedThisAttempt = hintUsed;
            const solutionUsedPreviously = existingDiffData?.hintUsed === true;
            const solutionEverUsedOnThisDifficulty = solutionUsedThisAttempt || solutionUsedPreviously;

            // Always count attempts (global + per difficulty)
            const prevTotalAttempts = typeof (puzzleData as any).totalAttempts === 'number' ? (puzzleData as any).totalAttempts : 0;
            const globalAttemptNumber = prevTotalAttempts + 1;
            (puzzleData as any).totalAttempts = globalAttemptNumber;

            const difficultyAttemptNumber = prevDifficultyAttempts + 1;

            // firstTry is true only if this is the first attempt on THIS difficulty,
            // the user ties/beats the bot, and no hint/solution was ever used on this difficulty
            firstTry = difficultyAttemptNumber === 1 && moves <= botMoves && !solutionEverUsedOnThisDifficulty;

            // Potential puzzle-level update (only on win); ensure difficulty doc exists on loss
            if (isWin) {
                // Reuse existingDiffData read earlier (no redundant read)
                const existing = existingDiffData;
                let newDiffObj: any;

                if (solutionEverUsedOnThisDifficulty) {
                    // Solution has been used on this difficulty (now or before)
                    // Count attempt but do NOT write score/Elo/streak updates
                    if (!existing) {
                        newDiffObj = {
                            attempts: difficultyAttemptNumber,
                            lowestMovesAttemptNumber: null,
                            moves,
                            firstTry: false,
                            eloScore: null,
                            attemptToTieBot: null,
                            attemptToBeatBot: null,
                            firstToBeatBot: false,
                            hintUsed: true
                        };
                    } else {
                        newDiffObj = {
                            ...existing,
                            attempts: difficultyAttemptNumber,
                            totalAttempts: difficultyAttemptNumber,
                            moves: typeof existing.moves === 'number' ? existing.moves : moves,
                            hintUsed: true
                            // ALL other fields (moves, eloScore, attemptToTieBot, etc.) preserved from previous attempts
                        };
                    }
                    // Do NOT write to dailyScoresV2 (no score to record)

                } else {
                    // Normal win path - no solution ever used on this difficulty
                    // Calculate Elo and update scores
                    const gameStatsForElo: GameStatistics = {
                        ...defaultStats,
                        attemptsToWinByDay: { [puzzleId]: difficultyAttemptNumber },
                        attemptWhenHintUsed: { [puzzleId]: null }, // No hint used
                        attemptsToAchieveBotScore: (moves < botMoves || moves === botMoves) ? { [puzzleId]: difficultyAttemptNumber } : {},
                        attemptsToBeatBotScore: (moves < botMoves) ? { [puzzleId]: difficultyAttemptNumber } : {},
                        bestScoresByDayDifficulty: { [puzzleId]: difficulty },
                    } as GameStatistics;
                    elo = calculateEloScore(gameStatsForElo, { algoScore: botMoves }, puzzleId, moves, firstToBeatBot, difficulty);

                    const achievedTieNow = moves <= botMoves;
                    const achievedBeatNow = moves < botMoves;

                    const existingMovesVal = (existing as any)?.moves;
                    const shouldReplaceMoves = !existing || typeof existingMovesVal !== 'number' || (typeof existingMovesVal === 'number' && moves < existingMovesVal);

                    if (!existing) {
                        newDiffObj = {
                            attempts: difficultyAttemptNumber,
                            totalAttempts: difficultyAttemptNumber,
                            lowestMovesAttemptNumber: difficultyAttemptNumber,
                            moves,
                            firstTry,
                            eloScore: elo,
                            hintUsed: false
                        };
                        if (achievedTieNow) newDiffObj.attemptToTieBot = difficultyAttemptNumber;
                        if (achievedBeatNow) newDiffObj.attemptToBeatBot = difficultyAttemptNumber;
                        newDiffObj.firstToBeatBot = firstToBeatBot;
                    } else {
                        // Preserve first recorded attempts; only set if not previously set
                        const attemptToTieBot = (existing as any).attemptToTieBot ?? (achievedTieNow ? difficultyAttemptNumber : null);
                        const attemptToBeatBot = (existing as any).attemptToBeatBot ?? (achievedBeatNow ? difficultyAttemptNumber : null);

                        if (shouldReplaceMoves) {
                            newDiffObj = {
                                attempts: difficultyAttemptNumber,
                                totalAttempts: difficultyAttemptNumber,
                                lowestMovesAttemptNumber: difficultyAttemptNumber,
                                moves,
                                firstTry: existing.firstTry ?? firstTry,
                                eloScore: elo,
                                attemptToTieBot,
                                attemptToBeatBot,
                                hintUsed: false
                            };
                            newDiffObj.firstToBeatBot = existing.firstToBeatBot || firstToBeatBot;
                        } else {
                            newDiffObj = {
                                attempts: difficultyAttemptNumber,
                                totalAttempts: difficultyAttemptNumber,
                                lowestMovesAttemptNumber: existing.lowestMovesAttemptNumber ?? null,
                                moves: existing.moves,
                                firstTry: existing.firstTry ?? firstTry,
                                eloScore: (existing as any).eloScore ?? (existing as any).elo ?? elo,
                                attemptToTieBot,
                                attemptToBeatBot,
                                hintUsed: false
                            };
                            newDiffObj.firstToBeatBot = existing.firstToBeatBot || false;
                        }
                    }

                    // Also update totalAttempts
                }
                (puzzleData as any)[diffKey] = newDiffObj;

                // --- New: Write per-difficulty daily score to separate collection (v2) ---
                // Path: dailyScoresV2/{puzzleId}/{difficulty}/{userId} with field { moves }
                // Mirror to V2 immediately in transaction and queue for stats recompute
                // ONLY write if solution was NOT used on this difficulty
                if (!solutionEverUsedOnThisDifficulty) {
                    try {
                        const existingMoves = (existing as any)?.moves;
                        const shouldMirror = !existing || typeof existingMoves !== 'number' || (typeof existingMoves === 'number' && moves < existingMoves);
                        if (shouldMirror) {
                            // Write nested map using proper merge semantics (no dot-path in set)
                            tx.set(dailyScoresV2Ref, { [diffKey]: { [userId]: moves } }, { merge: true });
                            v2Writes.push({ diffKey, moves });

                            // --- Check if this is the best score and write to bestScores ---
                            // Use the pre-read bestScoresSnap from the beginning of the transaction
                            const hasBestScoresPayload = !!(payload.states && payload.actions &&
                                payload.states.length > 0 && payload.actions.length > 0);

                            if (hasBestScoresPayload) {
                                logger.info(`[BEST_SCORES] Checking conditions - has states: ${!!payload.states}, has actions: ${!!payload.actions}, states length: ${payload.states?.length || 0}, actions length: ${payload.actions?.length || 0}`);
                                try {
                                    const existingBestScoreValRaw = bestScoresSnap.data()?.userScore;
                                    const existingBestScoreVal = typeof existingBestScoreValRaw === "number" ? existingBestScoreValRaw : null;

                                    // Write if document doesn't exist OR if no existing score OR if current score is better than existing
                                    const shouldWrite = !bestScoresSnap.exists || existingBestScoreVal === null || moves < existingBestScoreVal;

                                    if (shouldWrite) {
                                        tx.set(bestScoresRef, {
                                            puzzleId: puzzleId,
                                            userId: userId,
                                            userName: userName,
                                            userScore: moves,
                                            targetColor: payload.targetColor || null,
                                            states: payload.states,
                                            actions: payload.actions,
                                            colorMap: payload.colorMap || null,
                                        });

                                        logger.info(`Wrote best score to bestScores/${puzzleId}-${diffKey}`, {
                                            userId,
                                            moves,
                                            previousScore: existingBestScoreVal,
                                            statesCount: payload.states?.length || 0,
                                            actionsCount: payload.actions?.length || 0
                                        });
                                    } else {
                                        logger.info(`[BEST_SCORES] Not writing - current score (${moves}) is not better than existing (${existingBestScoreVal})`, {
                                            userId,
                                            moves,
                                            existingScore: existingBestScoreVal
                                        });
                                    }
                                } catch (e) {
                                    logger.warn("Failed writing to bestScores collection", {
                                        puzzleId,
                                        difficulty: diffKey,
                                        userId
                                    }, e);
                                    // Don't throw - bestScores is supplementary data
                                }
                            }
                        }
                    } catch (e) {
                        logger.warn("Failed mirroring per-difficulty daily score (v2)", { puzzleId, difficulty: diffKey, userId }, e);
                    }
                }
            } else {
                // Loss: ensure difficulty entry exists with defaults on first recorded loss
                // Reuse existingDiffData read earlier (no redundant read)
                if (solutionEverUsedOnThisDifficulty) {
                    (puzzleData as any)[diffKey] = existingDiffData ? {
                        ...existingDiffData,
                        attempts: difficultyAttemptNumber,
                        totalAttempts: difficultyAttemptNumber,
                        moves: typeof existingDiffData.moves === 'number' ? existingDiffData.moves : null,
                        hintUsed: true
                    } : {
                        attempts: difficultyAttemptNumber,
                        totalAttempts: difficultyAttemptNumber,
                        lowestMovesAttemptNumber: null,
                        moves: null,
                        attemptToBeatBot: null,
                        attemptToTieBot: null,
                        eloScore: null,
                        firstToBeatBot: false,
                        firstTry: false,
                        hintUsed: true,
                    };
                } else {
                    if (!existingDiffData) {
                        (puzzleData as any)[diffKey] = {
                            attempts: difficultyAttemptNumber,
                            totalAttempts: difficultyAttemptNumber,
                            lowestMovesAttemptNumber: null,
                            moves: null,
                            attemptToBeatBot: null,
                            attemptToTieBot: null,
                            eloScore: null,
                            firstToBeatBot: false,
                            firstTry: false,
                        };
                        // Loss: Do NOT write to dailyScoresV2
                        logger.info("Loss recorded for puzzle history only, not writing to dailyScoresV2", { puzzleId, difficulty: diffKey, userId });
                    } else {
                        // Update attempts counter for existing losses
                        (puzzleData as any)[diffKey] = {
                            ...existingDiffData,
                            attempts: difficultyAttemptNumber,
                            totalAttempts: difficultyAttemptNumber,
                        };
                    }
                }
            }

            // Prepare level-agnostic leaderboard update
            const prevMoves = typeof la?.moves === 'number' ? la.moves : 0;
            const prevAttempts = typeof la?.puzzleAttempts === 'number' ? la.puzzleAttempts : 0;
            const prevSolved = typeof la?.puzzleSolved === 'number' ? la.puzzleSolved : 0;
            const prevCurrentStreak = typeof la?.currentPuzzleCompletedStreak === 'number' ? la.currentPuzzleCompletedStreak : 0;
            const prevLongestStreak = typeof la?.longestPuzzleCompletedStreak === 'number' ? la.longestPuzzleCompletedStreak : 0;
            const prevLastCompletedDate = typeof la?.lastPuzzleCompletedDate === 'string' ? la.lastPuzzleCompletedDate : null;

            let currentStreak = prevCurrentStreak;
            let longestStreak = prevLongestStreak;
            
            if (isWin) {
                // Only update streak if this is a different day than last completed
                if (prevLastCompletedDate === puzzleId) {
                    // Same day, keep current streak unchanged
                    logger.info(`[LEADERBOARD] Puzzle ${puzzleId} already completed, keeping streak at ${currentStreak}`);
                } else if (isDayAfter(prevLastCompletedDate, puzzleId)) {
                    // Consecutive day, increment streak
                    currentStreak = prevCurrentStreak + 1;
                    logger.info(`[LEADERBOARD] Consecutive day win, streak incremented to ${currentStreak}`);
                } else {
                    // Gap or first win, reset to 1
                    currentStreak = 1;
                    logger.info(`[LEADERBOARD] Non-consecutive day or first win, streak reset to 1`);
                }
            }
            longestStreak = Math.max(prevLongestStreak, currentStreak);

            // Prepare difficulty leaderboard update (no moves/puzzleAttempts in difficulty docs)
            let diffUpdate: any = {};
            // Prepare level-agnostic Elo updates when new best Elo for the day is achieved
            let eloAggregateUpdate: any = undefined;
            if (isWin) {
                const prevFirstTryCurrent = typeof d?.currentFirstTryStreak === 'number' ? d.currentFirstTryStreak : 0;
                const prevFirstTryLongest = typeof d?.longestFirstTryStreak === 'number' ? d.longestFirstTryStreak : 0;
                const prevLastFirstTryDate = typeof d?.lastFirstTryDate === 'string' ? d.lastFirstTryDate : null;
                const prevGoalsAchieved = typeof d?.goalsAchieved === 'number' ? d.goalsAchieved : 0;
                const prevGoalAchievedDate = typeof d?.goalAchievedDate === 'string' ? d.goalAchievedDate : null;
                const prevGoalsBeaten = typeof d?.goalsBeaten === 'number' ? d.goalsBeaten : 0;
                const prevGoalBeatenDate = typeof d?.goalBeatenDate === 'string' ? d.goalBeatenDate : null;
                const prevTieCurrent = typeof d?.currentTieBotStreak === 'number' ? d.currentTieBotStreak : 0;
                const prevTieLongest = typeof d?.longestTieBotStreak === 'number' ? d.longestTieBotStreak : 0;
                const prevLastTieDate = typeof d?.lastTieBotDate === 'string' ? d.lastTieBotDate : null;

                // First try streak (per-difficulty)
                let newFirstTryCurrent = prevFirstTryCurrent;
                let newFirstTryLongest = prevFirstTryLongest;
                let newLastFirstTryDate = prevLastFirstTryDate;
                if (difficultyAttemptNumber === 1 && moves <= botMoves && !solutionEverUsedOnThisDifficulty) {
                    if (!prevLastFirstTryDate) {
                        newFirstTryCurrent = 1;
                    } else if (prevLastFirstTryDate === puzzleId) {
                        // Same day - keep streak unchanged
                        newFirstTryCurrent = prevFirstTryCurrent;
                    } else if (isDayAfter(prevLastFirstTryDate, puzzleId)) {
                        newFirstTryCurrent = prevFirstTryCurrent + 1;
                    } else {
                        newFirstTryCurrent = 1;
                    }
                    newFirstTryLongest = Math.max(newFirstTryCurrent, prevFirstTryLongest);
                    newLastFirstTryDate = puzzleId;
                } else if (prevLastFirstTryDate !== puzzleId) {
                    // User won but didn't meet first-try criteria (not first attempt on this difficulty, didn't tie bot, or used hint)
                    // Reset streak to 0 unless we already processed this puzzle today
                    newFirstTryCurrent = 0;
                    newLastFirstTryDate = puzzleId;
                }

                // Goals achieved/beaten
                // ONLY count if solution was NOT used on this difficulty
                const solutionUsedOnThisDifficulty = solutionEverUsedOnThisDifficulty;
                let newGoalsAchieved = prevGoalsAchieved;
                let newGoalAchievedDate = prevGoalAchievedDate;
                if (moves <= botMoves && !solutionUsedOnThisDifficulty && prevGoalAchievedDate !== puzzleId) {
                    newGoalsAchieved = prevGoalsAchieved + 1;
                    newGoalAchievedDate = puzzleId;
                }
                let newGoalsBeaten = prevGoalsBeaten;
                let newGoalBeatenDate = prevGoalBeatenDate;
                if (moves < botMoves && !solutionEverUsedOnThisDifficulty && prevGoalBeatenDate !== puzzleId) {
                    newGoalsBeaten = prevGoalsBeaten + 1;
                    newGoalBeatenDate = puzzleId;
                }

                // Tie/beat streak (based on moves <= botMoves)
                // ONLY count if solution was NOT used on this difficulty
                let newTieCurrent = prevTieCurrent;
                let newTieLongest = prevTieLongest;
                let newLastTieDate = prevLastTieDate;
                if (moves <= botMoves && !solutionEverUsedOnThisDifficulty) {
                    if (!prevLastTieDate) {
                        newTieCurrent = 1;
                    } else if (prevLastTieDate === puzzleId) {
                        // Same day - keep streak unchanged
                        newTieCurrent = prevTieCurrent;
                    } else if (isDayAfter(prevLastTieDate, puzzleId)) {
                        newTieCurrent = prevTieCurrent + 1;
                    } else {
                        newTieCurrent = 1;
                    }
                    newTieLongest = Math.max(newTieCurrent, prevTieLongest);
                    newLastTieDate = puzzleId;
                }

                diffUpdate = {
                    currentFirstTryStreak: newFirstTryCurrent,
                    longestFirstTryStreak: newFirstTryLongest,
                    lastFirstTryDate: newLastFirstTryDate ?? null,
                    goalsAchieved: newGoalsAchieved,
                    goalAchievedDate: newGoalAchievedDate ?? null,
                    goalsBeaten: newGoalsBeaten,
                    goalBeatenDate: newGoalBeatenDate ?? null,
                    currentTieBotStreak: newTieCurrent,
                    longestTieBotStreak: newTieLongest,
                    lastTieBotDate: newLastTieDate ?? null,
                };

                // --- Level-agnostic Elo maintenance ---
                try {
                    // Elo Scoring Strategy: Sum across all three difficulties
                    // This design encourages players to complete all difficulty levels for each puzzle.
                    // Each difficulty awards Elo independently based on performance, and the total
                    // represents comprehensive engagement with each day's puzzle.
                    // Note: This differs from traditional single-value Elo systems but aligns with
                    // the multi-difficulty puzzle structure where each difficulty is a distinct challenge.
                    const easyElo = typeof (puzzleData as any).easy?.eloScore === 'number'
                        ? (puzzleData as any).easy.eloScore
                        : 0;
                    const mediumElo = typeof (puzzleData as any).medium?.eloScore === 'number'
                        ? (puzzleData as any).medium.eloScore
                        : 0;
                    const hardElo = typeof (puzzleData as any).hard?.eloScore === 'number'
                        ? (puzzleData as any).hard.eloScore
                        : 0;

                    const totalElo = easyElo + mediumElo + hardElo;

                    // Log the sum calculation for verification
                    logger.info('[ELO SUM] Calculated Elo sum for puzzle', {
                        puzzleId,
                        userId,
                        easyElo,
                        mediumElo,
                        hardElo,
                        totalElo,
                        currentDifficulty: difficulty
                    });

                    // Update eloScoreByDay
                    const existingEloMap = (la && typeof la.eloScoreByDay === 'object') ? { ...(la.eloScoreByDay as Record<string, number>) } : {} as Record<string, number>;
                    const prevDayElo = typeof existingEloMap[puzzleId] === 'number' ? existingEloMap[puzzleId] : 0;

                    // Only update if new sum is higher (preserve maximum sum)
                    if (totalElo > prevDayElo) {
                        existingEloMap[puzzleId] = totalElo;

                        logger.info('[ELO SUM] Updated eloScoreByDay', {
                            puzzleId,
                            userId,
                            prevSum: prevDayElo,
                            newSum: totalElo,
                            increase: totalElo - prevDayElo
                        });

                        // Recompute aggregates
                        let eloAllTime = 0;
                        let eloLast30 = 0;
                        let eloLast7 = 0;
                        const now = new Date();
                        const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
                        const start30 = new Date(todayUTC); start30.setUTCDate(start30.getUTCDate() - 29);
                        const start7 = new Date(todayUTC); start7.setUTCDate(start7.getUTCDate() - 6);

                        for (const [dayStr, val] of Object.entries(existingEloMap)) {
                            if (typeof val !== 'number' || isNaN(val)) continue;
                            eloAllTime += val;
                            // Parse YYYY-MM-DD
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
                            } catch {}
                        }

                        eloAggregateUpdate = {
                            eloScoreByDay: existingEloMap,
                            eloScoreAllTime: eloAllTime,
                            eloScoreLast30: eloLast30,
                            eloScoreLast7: eloLast7,
                        };
                    } else {
                        logger.info('[ELO SUM] Sum not higher, keeping existing eloScoreByDay', {
                            puzzleId,
                            userId,
                            currentSum: prevDayElo,
                            calculatedSum: totalElo
                        });
                    }
                } catch (e) {
                    logger.warn('Failed to recompute elo aggregates for user leaderboard', e);
                }
            }

            // Perform writes after all reads (always write to persist totalAttempts)
            tx.set(puzzleRef, puzzleData, { merge: true });

            const laBaseUpdate: any = {
                moves: prevMoves + moves,
                puzzleAttempts: prevAttempts + 1,
            };
            if (isWin) {
                // Read difficulty-specific last completed date for per-difficulty puzzleSolved counting
                const difficultyDateField = `last${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}CompletedDate`;
                const prevLastCompletedForDifficulty = la?.[difficultyDateField] ?? null;

                // Increment puzzleSolved if this puzzle hasn't been completed on THIS difficulty yet
                const shouldIncrementSolved = prevLastCompletedForDifficulty !== puzzleId;
                const newSolved = shouldIncrementSolved ? prevSolved + 1 : prevSolved;

                tx.set(levelAgnosticRef, {
                    ...laBaseUpdate,
                    puzzleSolved: newSolved,
                    [difficultyDateField]: puzzleId,  // Update difficulty-specific field
                    currentPuzzleCompletedStreak: currentStreak,
                    longestPuzzleCompletedStreak: longestStreak,
                    lastPuzzleCompletedDate: puzzleId, // Keep global for streak tracking
                    ...(eloAggregateUpdate || {}),
                }, { merge: true });
            } else {
                // Loss: only update moves and attempts
                tx.set(levelAgnosticRef, laBaseUpdate, { merge: true });
            }

            // Only write difficulty doc on wins
            if (isWin) {
                tx.set(difficultyRef, diffUpdate, { merge: true });
            }
        });

        logger.info("recordPuzzleHistory: Transaction completed successfully", {
            userId,
            puzzleId,
            difficulty,
            isWin,
            v2WritesQueued: v2Writes.length
        });

        // Write to V2 daily scores (stats are computed on-demand via getDailyScoresV2Stats)
        try {
            if (v2Writes.length > 0) {
                const uniq = Array.from(new Map(v2Writes.map(w => [w.diffKey, w])).values());
                for (const w of uniq) {
                    await writeDailyScoreV2(puzzleId, w.diffKey, userId, w.moves);
                }
            }
        } catch (e) {
            logger.warn("Failed to update dailyScoresV2", { puzzleId, difficulty, userId }, e);
        }

        // Best score notifications are now handled by the onBestScoreWritten Firestore trigger

        return { success: true, firstTry, firstToBeatBot, elo };
    }
);

// --- New: Mark hint/solution usage for a puzzle+difficulty ---
interface SetHintUsedRequest {
    puzzleId: string;
    difficulty: DifficultyLevel | "easy" | "medium" | "hard";
}

export const setHintUsedForPuzzle = onCall(
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
        const { puzzleId, difficulty } = (request.data || {}) as SetHintUsedRequest;

        if (!puzzleId || !difficulty) {
            throw new HttpsError("invalid-argument", "puzzleId and difficulty are required.");
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(puzzleId)) {
            throw new HttpsError("invalid-argument", "Invalid puzzleId format. Expected YYYY-MM-DD.");
        }

        const normalizedDifficulty = normalizeDifficulty(difficulty);
        const userHistoryRef = db.collection("userPuzzleHistory").doc(userId);
        const puzzleRef = userHistoryRef.collection("puzzles").doc(puzzleId);

        await db.runTransaction(async (tx) => {
            const snap = await tx.get(puzzleRef);
            const data = snap.exists ? (snap.data() as any) : {};
            const existingDiffData = (data && typeof data[normalizedDifficulty] === "object") ? (data[normalizedDifficulty] as any) : {};

            tx.set(puzzleRef, {
                [normalizedDifficulty]: {
                    ...existingDiffData,
                    hintUsed: true
                }
            }, { merge: true });
        });

        logger.info("setHintUsedForPuzzle: hint marked as used", { userId, puzzleId, difficulty: normalizedDifficulty });
        return { success: true };
    }
);

// --- New: Update Notification Preferences ---

interface UpdateNotificationPreferencesRequest {
    notifyOnBestScores: boolean;
}

/**
 * Cloud function for clients to update their notification preferences.
 * Updates the user's document in the users collection.
 */
export const updateNotificationPreferences = onCall(
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
        const { notifyOnBestScores } = (request.data || {}) as UpdateNotificationPreferencesRequest;

        if (typeof notifyOnBestScores !== "boolean") {
            throw new HttpsError("invalid-argument", "notifyOnBestScores must be a boolean.");
        }

        logger.info(`updateNotificationPreferences: userId=${userId}, notifyOnBestScores=${notifyOnBestScores}`);

        const userRef = db.collection("users").doc(userId);
        await userRef.set(
            { notifyOnBestScores },
            { merge: true }
        );

        return { success: true, notifyOnBestScores };
    }
);

// Helper: Write a user's best per-difficulty score to dailyScoresV2
async function writeDailyScoreV2(puzzleId: string, difficulty: DifficultyLevel, userId: string, moves: number): Promise<void> {
    const ref = db.collection("dailyScoresV2").doc(puzzleId);
    await ref.set({ [difficulty]: { [userId]: moves } }, { merge: true });
}

// --- New: Get per-difficulty stats for dailyScoresV2 ---
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
            const baseData = baseSnap.exists ? (baseSnap.data() as any) : {};

            const result: Record<string, { lowestScore: number | null; totalPlayers: number; playersWithLowestScore: number; averageScore: number | null }> = {};

            // Compute directly from the main document map (ensures averageScore is included)
            for (const diff of diffKeys) {
                const diffMap = (baseData && typeof baseData[diff] === 'object') ? (baseData[diff] as Record<string, any>) : {};
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

// --- New: Get Win Modal Stats ---
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

            const puzzleData = puzzleSnap.exists ? puzzleSnap.data() as any : null;
            const laData = laSnap.exists ? (laSnap.data() as any) : {};

            const currentPuzzleCompletedStreak = typeof laData.currentPuzzleCompletedStreak === 'number'
                ? laData.currentPuzzleCompletedStreak
                : null;

            const lastPuzzleCompletedDate = typeof laData.lastPuzzleCompletedDate === 'string'
                ? laData.lastPuzzleCompletedDate
                : null;

            const buildDifficultyStats = (difficultySnap: any, difficulty: string) => {
                const dData = difficultySnap.exists ? (difficultySnap.data() as any) : {};
                const difficultyData = puzzleData?.[difficulty];

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

// --- New: Get Personal Stats for Stats Modal ---
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

            const puzzleData = puzzleSnap.exists ? (puzzleSnap.data() as any) : {};
            const laData = laSnap.exists ? (laSnap.data() as any) : {};
            const dData = diffSnap.exists ? (diffSnap.data() as any) : {};
            
            // Get difficulty-specific data
            const diffData = puzzleData[normalizedDifficulty] || {};

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

// --- New: Get Global Leaderboard V2 (userPuzzleHistory-based) ---
interface GetGlobalLeaderboardV2Request {
    category: 'score' | 'goals' | 'streaks';
    subcategory: string; // e.g., 'last7', 'last30', 'allTime', 'beaten', 'matched', 'firstTry', 'goalAchieved', 'puzzleCompleted'
    difficulty?: DifficultyLevel | "easy" | "medium" | "hard";
}

interface LeaderboardEntryV2 {
    userId: string;
    username: string;
    value: number;
    rank: number;
    isCurrent?: boolean; // For streaks, indicates if current equals longest
}

export const getGlobalLeaderboardV2 = onCall(
    {
        memory: "512MiB",
        timeoutSeconds: 120,
        ...getAppCheckConfig(),
    },
    async (request) => {
        const requesterId = request.auth?.uid || "guest/unauthenticated";
        const { category, subcategory, difficulty } = (request.data || {}) as GetGlobalLeaderboardV2Request;
        
        logger.info(`getGlobalLeaderboardV2 invoked by: ${requesterId}, category: ${category}, subcategory: ${subcategory}, difficulty: ${difficulty}`);

        if (!category || !subcategory) {
            throw new HttpsError("invalid-argument", "category and subcategory are required.");
        }

        // Validate category-specific requirements
        if ((category === 'goals' || category === 'streaks') && !difficulty) {
            throw new HttpsError("invalid-argument", "difficulty is required for goals and streaks categories.");
        }

        const normalizedDifficulty = difficulty ? normalizeDifficulty(difficulty) : null;

        try {
            // Determine which field to query based on category and subcategory
            let fieldPath: string;
            let checkCurrent = false;
            let currentFieldPath: string | null = null;

            if (category === 'score') {
                switch (subcategory) {
                    case 'last7':
                        fieldPath = 'eloScoreLast7';
                        break;
                    case 'last30':
                        fieldPath = 'eloScoreLast30';
                        break;
                    case 'allTime':
                        fieldPath = 'eloScoreAllTime';
                        break;
                    default:
                        throw new HttpsError("invalid-argument", `Invalid score subcategory: ${subcategory}`);
                }
            } else if (category === 'goals' && normalizedDifficulty) {
                switch (subcategory) {
                    case 'beaten':
                        fieldPath = 'goalsBeaten';
                        break;
                    case 'matched':
                        fieldPath = 'goalsAchieved';
                        break;
                    default:
                        throw new HttpsError("invalid-argument", `Invalid goals subcategory: ${subcategory}`);
                }
            } else if (category === 'streaks' && normalizedDifficulty) {
                checkCurrent = true;
                switch (subcategory) {
                    case 'firstTry':
                        fieldPath = 'longestFirstTryStreak';
                        currentFieldPath = 'currentFirstTryStreak';
                        break;
                    case 'goalAchieved':
                        fieldPath = 'longestTieBotStreak';
                        currentFieldPath = 'currentTieBotStreak';
                        break;
                    case 'puzzleCompleted':
                        fieldPath = 'longestPuzzleCompletedStreak';
                        currentFieldPath = 'currentPuzzleCompletedStreak';
                        checkCurrent = true;
                        break;
                    default:
                        throw new HttpsError("invalid-argument", `Invalid streaks subcategory: ${subcategory}`);
                }
            } else {
                throw new HttpsError("invalid-argument", "Invalid category or missing difficulty.");
            }

            // Query all documents from the leaderboard collection group
            const allLeaderboardDocs = await db.collectionGroup("leaderboard").get();
            
            // Determine which document ID to filter for
            let targetDocId: string;
            if (category === 'score' || (category === 'streaks' && subcategory === 'puzzleCompleted')) {
                targetDocId = "levelAgnostic";
            } else if (normalizedDifficulty) {
                targetDocId = normalizedDifficulty;
            } else {
                throw new HttpsError("internal", "Failed to determine target document.");
            }

            // Extract userId from collection group doc path
            const getUserIdFromDoc = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
                const parent = doc.ref.parent; // leaderboard collection
                const userDoc = parent.parent; // userPuzzleHistory/{uid} document
                return userDoc ? userDoc.id : undefined;
            };

            // Build entries array, filtering by document ID in memory
            const entries: Array<{ userId: string; value: number; currentValue?: number }> = [];
            
            allLeaderboardDocs.forEach(doc => {
                // Filter by document ID
                if (doc.id !== targetDocId) return;
                
                const userId = getUserIdFromDoc(doc);
                if (!userId) return;
                
                const data = doc.data() as any;
                const value = typeof data[fieldPath] === 'number' ? data[fieldPath] : null;
                
                if (value === null || isNaN(value) || value === 0) return;
                
                const entry: { userId: string; value: number; currentValue?: number } = { userId, value };
                
                // If checking current streak, include current value
                if (checkCurrent && currentFieldPath) {
                    const currentValue = typeof data[currentFieldPath] === 'number' ? data[currentFieldPath] : null;
                    if (currentValue !== null) {
                        entry.currentValue = currentValue;
                    }
                }
                
                entries.push(entry);
            });

            // Sort by value descending
            entries.sort((a, b) => b.value - a.value);

            // Get top 10
            const top10 = entries.slice(0, 10);

            // Find requester's entry if not in top 10
            let requesterEntry: LeaderboardEntryV2 | null = null;
            const requesterIndex = entries.findIndex(e => e.userId === requesterId);
            if (requesterIndex >= 10 && requesterId !== "guest/unauthenticated") {
                const entry = entries[requesterIndex];
                requesterEntry = {
                    userId: entry.userId,
                    username: '', // Will be filled below
                    value: entry.value,
                    rank: requesterIndex + 1,
                    isCurrent: checkCurrent && entry.currentValue !== undefined ? entry.currentValue === entry.value : undefined
                };
            }

            // Fetch usernames for top 10 + requester
            const userIdsToFetch = [...top10.map(e => e.userId)];
            if (requesterEntry) {
                userIdsToFetch.push(requesterEntry.userId);
            }

            const userDisplayNames = new Map<string, string>();
            
            try {
                for (let i = 0; i < userIdsToFetch.length; i += 100) {
                    const chunk = userIdsToFetch.slice(i, i + 100);
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
                }
            } catch (authError) {
                logger.error("getGlobalLeaderboardV2: Error fetching user display names:", authError);
            }

            // Build final leaderboard entries
            const leaderboard: LeaderboardEntryV2[] = top10.map((entry, index) => ({
                userId: entry.userId,
                username: userDisplayNames.get(entry.userId) || `User_${entry.userId.substring(0, 6)}`,
                value: entry.value,
                rank: index + 1,
                isCurrent: checkCurrent && entry.currentValue !== undefined ? entry.currentValue === entry.value : undefined
            }));

            // Update requester entry username if exists
            if (requesterEntry) {
                requesterEntry.username = userDisplayNames.get(requesterEntry.userId) || `User_${requesterEntry.userId.substring(0, 6)}`;
            }

            logger.info(`getGlobalLeaderboardV2: Returning ${leaderboard.length} entries with requester: ${!!requesterEntry}`);

            return {
                success: true,
                leaderboard,
                requesterEntry: requesterEntry || undefined
            };
        } catch (e) {
            logger.error('getGlobalLeaderboardV2: error building leaderboard', e);
            throw new HttpsError('internal', 'Failed to fetch leaderboard');
        }
    }
);

// --- New: Send Daily Puzzle Reminder Notifications ---

/**
 * Scheduled Cloud Function to send daily puzzle reminder notifications
 * Runs every hour at :30 past the hour (e.g., 12:30, 1:30, 2:30, etc.)
 * Sends notifications to users at 8:30 PM in their timezone if they haven't played today's puzzle
 */
export const sendDailyPuzzleReminders = onSchedule(
    {
        schedule: "30 * * * *", // Every hour at :30
        timeZone: "UTC",
        memory: "512MiB",
        timeoutSeconds: 540, // 9 minutes (max for scheduled functions)
    },
    async (event) => {
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
                        logger.info(`sendDailyPuzzleReminders: ✓ User has played - NOT sending notification. Device already played ${todayPuzzleId} via user(s): ${playedUserIds.join(', ')}, skipping notification to ${userId}`);
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

// --- Usage Stats Collection and Retrieval ---

/**
 * Calculate consecutive days ending on target date
 * Returns 0 if target date not in days array
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
 * Calculate streak counts for a specific date
 * Looks back 30 days to detect 3+ day streaks ending on target date
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
 * Helper function to calculate and update aggregate stats (7d, 30d, 90d, allTime)
 * Stores pre-computed unique user counts in special documents for efficient retrieval
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

/**
 * Scheduled Cloud Function to collect daily usage statistics
 * Runs daily at 5:30 AM UTC (12:30 AM EST / 1:30 AM EDT)
 * Processes stats from 2 days prior to ensure all users from all timezones are captured
 * Example: Runs on Jan 3 at 12:30 AM EST → processes Jan 1 stats
 * Collects: unique users and total attempts per puzzle
 */
export const collectDailyUsageStats = onSchedule(
    {
        schedule: "30 5 * * *", // Every day at 5:30 AM UTC (12:30 AM EST / 1:30 AM EDT)
        timeZone: "UTC",
        memory: "1GiB", // Increased from 512MiB for streak calculation memory requirements
        timeoutSeconds: 540,
    },
    async (event) => {
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

/**
 * Callable Cloud Function to retrieve usage statistics
 * Supports filtering by date range and aggregation
 */
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

            // Strip userIds from response — needed server-side for dedup but not by the client
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

/**
 * One-time migration function to backfill usage stats from old data structure
 * WARNING: This is an admin-only function and should be called with caution
 */
interface BackfillUsageStatsRequest {
    startDate?: string; // Optional: YYYY-MM-DD format
    endDate?: string;   // Optional: YYYY-MM-DD format
    dryRun?: boolean;   // If true, only logs what would be done
}

// --- Account Deletion Endpoint ---

/**
 * Deletes a user's account and all associated data
 * Requires re-authentication with email/password for security
 * 
 * Flow:
 * 1. Verify user is authenticated
 * 2. Re-authenticate with provided credentials (email/password)
 * 3. Delete Firestore data (users/{userId}, userPuzzleHistory/{userId})
 * 4. Delete Firebase Auth account
 */
interface DeleteAccountRequest {
    email: string;
    password: string;
}

export const deleteAccount = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        // Step 1: Verify user is authenticated
        if (!request.auth) {
            logger.error("deleteAccount: unauthenticated call");
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        
        const userId = request.auth.uid;
        const { email, password } = (request.data || {}) as DeleteAccountRequest;
        
        logger.info(`deleteAccount: Request received for user ${userId}`);
        
        // Validate input
        if (!email || !password) {
            throw new HttpsError("invalid-argument", "Email and password are required for account deletion.");
        }
        
        try {
            // Step 2: Verify the user's credentials match
            // Get the user's auth record to verify email matches
            const userRecord = await admin.auth().getUser(userId);
            
            if (!userRecord.email) {
                logger.error(`deleteAccount: User ${userId} has no email (anonymous user)`);
                throw new HttpsError(
                    "failed-precondition", 
                    "Account deletion requires an email-based account. Anonymous accounts cannot be deleted this way."
                );
            }
            
            if (userRecord.email.toLowerCase() !== email.toLowerCase()) {
                logger.error(`deleteAccount: Email mismatch for user ${userId}`);
                throw new HttpsError("invalid-argument", "The provided email does not match your account.");
            }
            
            // For security, we verify the password by attempting to sign in via REST API
            // This is the recommended approach for server-side password verification
            const { apiKey, isEmulator } = getFirebaseApiKey();
            
            if (isEmulator) {
                // In emulator mode, skip password verification for easier testing
                logger.warn(`deleteAccount: Skipping password verification (emulator mode)`);
            } else if (apiKey) {
                // Production with API key configured - verify password
                const isValidPassword = await verifyPassword(email, password, apiKey);
                if (!isValidPassword) {
                    logger.error(`deleteAccount: Invalid password for user ${userId}`);
                    throw new HttpsError("invalid-argument", "The provided password is incorrect.");
                }
                logger.info(`deleteAccount: Password verified for user ${userId}`);
            } else {
                // Production without API key - FAIL the request for security
                logger.error(`deleteAccount: FIREBASE_API_KEY not configured in production. Cannot verify password.`);
                throw new HttpsError(
                    "failed-precondition", 
                    "Account deletion is temporarily unavailable. Please try again later."
                );
            }
            
            // Step 3: Delete Firestore data using a batch operation
            logger.info(`deleteAccount: Deleting Firestore data for user ${userId}`);
            
            const batch = db.batch();
            
            // Delete user document
            const userDocRef = db.collection("users").doc(userId);
            batch.delete(userDocRef);
            
            // Delete userPuzzleHistory document (and subcollections will be orphaned but that's ok)
            const userHistoryRef = db.collection("userPuzzleHistory").doc(userId);
            batch.delete(userHistoryRef);
            
            // Note: Firestore doesn't delete subcollections automatically
            // For a complete cleanup, we'd need to delete subcollections too
            // Let's delete the leaderboard and puzzles subcollections
            try {
                // Delete puzzles subcollection
                const puzzlesSnapshot = await userHistoryRef.collection("puzzles").get();
                puzzlesSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                // Delete leaderboard subcollection
                const leaderboardSnapshot = await userHistoryRef.collection("leaderboard").get();
                leaderboardSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                logger.info(`deleteAccount: Queued ${puzzlesSnapshot.size} puzzle docs and ${leaderboardSnapshot.size} leaderboard docs for deletion`);
            } catch (subcollectionError) {
                logger.warn(`deleteAccount: Error querying subcollections for user ${userId}:`, subcollectionError);
                // Continue with deletion even if subcollection query fails
            }
            
            // Commit the batch
            await batch.commit();
            logger.info(`deleteAccount: Firestore data deleted for user ${userId}`);
            
            // Step 4: Delete Firebase Auth account
            // This is done AFTER Firestore deletion to ensure data is cleaned up
            // even if auth deletion fails (the user would just need to re-authenticate)
            logger.info(`deleteAccount: Deleting Auth account for user ${userId}`);
            await admin.auth().deleteUser(userId);
            logger.info(`deleteAccount: Auth account deleted for user ${userId}`);
            
            return { 
                success: true, 
                message: "Account and all associated data have been permanently deleted." 
            };
            
        } catch (error: any) {
            logger.error(`deleteAccount: Error deleting account for user ${userId}:`, error);
            
            // Re-throw HttpsError as-is
            if (error instanceof HttpsError) {
                throw error;
            }
            
            // Handle specific Firebase errors
            if (error.code === 'auth/user-not-found') {
                throw new HttpsError("not-found", "User account not found.");
            }
            
            throw new HttpsError("internal", "Failed to delete account. Please try again later.");
        }
    }
);

/**
 * Helper function to verify password via Firebase Auth REST API
 * This is used for server-side password verification
 */
async function verifyPassword(email: string, password: string, apiKey: string): Promise<boolean> {
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

/**
 * Helper function to get Firebase API key and detect environment
 * Returns both the API key (if available) and whether we're in emulator mode
 * 
 * In production, FIREBASE_API_KEY must be set for password verification to work.
 * In emulator mode, password verification can be safely skipped.
 */
function getFirebaseApiKey(): { apiKey: string | null; isEmulator: boolean } {
    // Detect emulator mode (must match getAppCheckConfig() logic)
    const isEmulator = 
        process.env.FUNCTIONS_EMULATOR === 'true' || 
        process.env.FIRESTORE_EMULATOR_HOST !== undefined ||
        process.env.FIREBASE_CONFIG?.includes('"emulators"') ||
        process.env.NODE_ENV === 'development';
    
    // Check environment variable for API key
    const apiKey = process.env.FIREBASE_API_KEY || null;
    
    if (isEmulator) {
        logger.info("getFirebaseApiKey: Running in emulator mode");
    } else if (!apiKey) {
        logger.error("getFirebaseApiKey: FIREBASE_API_KEY not set in production environment!");
    }
    
    return { apiKey, isEmulator };
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

// --- Weekly Hardest Puzzle ---

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

/**
 * Scheduled Cloud Function to find and store the weekly hardest puzzle.
 * Runs every Monday at 9 AM UTC to analyze the previous week (Mon-Sun).
 *
 * Writes to: weeklyHardest/current
 */
export const updateWeeklyHardestPuzzle = onSchedule(
    {
        schedule: "0 9 * * MON",  // Every Monday at 9 AM UTC
        timeZone: "UTC",
        memory: "256MiB",
        timeoutSeconds: 300,
    },
    async (event) => {
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
