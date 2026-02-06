/**
 * Cloud Function to record puzzle history for a user.
 * This is the main function for tracking puzzle attempts, wins, streaks, and ELO scores.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, admin, logger, getAppCheckConfig } from "../../config.js";
import { calculateEloScore } from "../../eloUtils.js";
import { GameStatistics, defaultStats, DifficultyLevel } from "../../../../shared/types.js";
import {
    PuzzleDifficultyEntry,
    UserPuzzleDocument,
    LevelAgnosticLeaderboardDoc,
    DifficultyLeaderboardDoc,
    FirestorePuzzleGrid,
} from "../../firestoreTypes.js";
import {
    normalizeDifficulty,
    isDayAfter,
    getLowestDailyScore,
    writeDailyScoreV2,
} from "../../helpers.js";

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
    states?: FirestorePuzzleGrid[];  // PuzzleGrid[] (Firebase admin doesn't have frontend types)
    actions?: number[];
    targetColor?: string;
    colorMap?: number[];
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
            const puzzleData: UserPuzzleDocument = puzzleSnap.exists ? (puzzleSnap.data() as UserPuzzleDocument || {}) : {};
            const la: LevelAgnosticLeaderboardDoc = laSnap.exists ? (laSnap.data() as LevelAgnosticLeaderboardDoc) : {};
            const d: DifficultyLeaderboardDoc = dSnap.exists ? (dSnap.data() as DifficultyLeaderboardDoc) : {};

            // Compute difficulty-specific attempt count
            const diffKey = difficulty; // 'easy' | 'medium' | 'hard'
            // Read existing difficulty data once (used throughout for both win/loss cases)
            const existingDiffData = puzzleData[diffKey] as PuzzleDifficultyEntry | undefined;
            const prevDifficultyAttempts = typeof existingDiffData?.attempts === 'number' ? existingDiffData.attempts : 0;
            const solutionUsedThisAttempt = hintUsed;
            const solutionUsedPreviously = existingDiffData?.hintUsed === true;
            const solutionEverUsedOnThisDifficulty = solutionUsedThisAttempt || solutionUsedPreviously;

            // Always count attempts (global + per difficulty)
            const prevTotalAttempts = typeof puzzleData.totalAttempts === 'number' ? puzzleData.totalAttempts : 0;
            const globalAttemptNumber = prevTotalAttempts + 1;
            puzzleData.totalAttempts = globalAttemptNumber;

            const difficultyAttemptNumber = prevDifficultyAttempts + 1;

            // firstTry is true only if this is the first attempt on THIS difficulty,
            // the user ties/beats the bot, and no hint/solution was ever used on this difficulty
            firstTry = difficultyAttemptNumber === 1 && moves <= botMoves && !solutionEverUsedOnThisDifficulty;

            // Potential puzzle-level update (only on win); ensure difficulty doc exists on loss
            if (isWin) {
                // Reuse existingDiffData read earlier (no redundant read)
                const existing = existingDiffData;
                let newDiffObj: PuzzleDifficultyEntry;

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

                    const existingMovesVal = existing?.moves;
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
                        const attemptToTieBot = existing.attemptToTieBot ?? (achievedTieNow ? difficultyAttemptNumber : null);
                        const attemptToBeatBot = existing.attemptToBeatBot ?? (achievedBeatNow ? difficultyAttemptNumber : null);

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
                                eloScore: existing.eloScore ?? existing.elo ?? elo,
                                attemptToTieBot,
                                attemptToBeatBot,
                                hintUsed: false
                            };
                            newDiffObj.firstToBeatBot = existing.firstToBeatBot || false;
                        }
                    }

                    // Also update totalAttempts
                }
                puzzleData[diffKey] = newDiffObj;

                // --- New: Write per-difficulty daily score to separate collection (v2) ---
                // Path: dailyScoresV2/{puzzleId}/{difficulty}/{userId} with field { moves }
                // Mirror to V2 immediately in transaction and queue for stats recompute
                // ONLY write if solution was NOT used on this difficulty
                if (!solutionEverUsedOnThisDifficulty) {
                    try {
                        const existingMoves = existing?.moves;
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
                    puzzleData[diffKey] = existingDiffData ? {
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
                        puzzleData[diffKey] = {
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
                        puzzleData[diffKey] = {
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
            let diffUpdate: Partial<DifficultyLeaderboardDoc> = {};
            // Prepare level-agnostic Elo updates when new best Elo for the day is achieved
            let eloAggregateUpdate: Partial<LevelAgnosticLeaderboardDoc> | undefined = undefined;
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
                    const easyElo = typeof puzzleData.easy?.eloScore === 'number'
                        ? puzzleData.easy.eloScore
                        : 0;
                    const mediumElo = typeof puzzleData.medium?.eloScore === 'number'
                        ? puzzleData.medium.eloScore
                        : 0;
                    const hardElo = typeof puzzleData.hard?.eloScore === 'number'
                        ? puzzleData.hard.eloScore
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

            const laBaseUpdate: Partial<LevelAgnosticLeaderboardDoc> = {
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

// Re-export helper functions for testing
export { normalizeDifficulty, isDayAfter };
