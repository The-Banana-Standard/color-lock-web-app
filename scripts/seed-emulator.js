const admin = require('firebase-admin');

// Use jiti to allow requiring TypeScript files directly if needed for enums
const jiti = require('jiti')(__filename);
const { DifficultyLevel } = jiti('../src/types/settings'); // Import DifficultyLevel enum

// Initialize Firebase Admin without service account - this works with emulators
admin.initializeApp({
  projectId: 'color-lock-prod'
});

// Connect to emulators
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';

const db = admin.firestore();

// Function to get a date string (YYYY-MM-DD) for a given offset from today
function getOffsetDateString(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Generate dates ending today (today and the 89 days before = 90 days total)
const DATES = Array.from({ length: 90 }, (_, i) => getOffsetDateString(i - 89));
console.log("Generated Dates for Seeding:", DATES);

// Check if a specific date was provided as a command line argument
const dateArg = process.argv[2]; // e.g., node seed-emulator.js 2024-07-20
// Use the provided date or today's date (local)
const todayStr = dateArg || getOffsetDateString(0); // Use today's local date as default
console.log(`Seeding data for puzzle date: ${todayStr} ${dateArg ? '(from command line argument)' : '(using local machine date)'}`);

// Helper to create a map from an array of dates and a value function
function createDateMap(dates, valueFn) {
    return dates.reduce((acc, date, index) => {
        acc[date] = valueFn(date, index);
        return acc;
    }, {});
}

// Helper to create sample Elo scores
function createSampleEloScores(dates) {
    return dates.reduce((acc, date, index) => {
        // Only add score sometimes to simulate missing days
        if (Math.random() > 0.3) {
            // Score between 50 and 150
            acc[date] = Math.floor(Math.random() * 101) + 50;
        }
        return acc;
    }, {});
}

// Create sample data
async function seedData() {
  try {
    console.log('Seeding puzzles, puzzlesV2, user histories, leaderboards, and daily scores...');

    // 1) Create puzzles for the last 10 days plus today
    console.log(`Creating/updating sample puzzles for ${DATES.length} dates...`);
    const puzzlesByDate = {};
    const puzzleBatch = db.batch();
    for (const date of DATES) {
      const puzzleDocRef = db.collection('puzzles').doc(date);
      const algoScore = 12 + Math.floor(Math.random() * 5) - 2; // 10..14
      const puzzleDoc = {
        actions: [101, 41, 88, 147, 56, 60, 81, 67, 42, 78, 0],
        algoScore,
        colorMap: [5, 0, 3, 4, 1, 2],
        states: [
          {
            0: ["red", "green", "blue", "orange", "red"],
            1: ["purple", "green", "green", "yellow", "blue"],
            2: ["yellow", "red", "yellow", "blue", "blue"],
            3: ["green", "orange", "orange", "red", "blue"],
            4: ["yellow", "red", "purple", "blue", "orange"]
          }
        ],
        targetColor: "green"
      };
      puzzlesByDate[date] = puzzleDoc;
      puzzleBatch.set(puzzleDocRef, puzzleDoc, { merge: true });
    }
    await puzzleBatch.commit();
    console.log('Created/Updated sample puzzles');

    // 1b) Create puzzlesV2 docs for ALL dates (easy/medium/hard per day)
    // This is needed for per-difficulty algoScore lookups when computing goal achievements
    console.log(`Creating puzzlesV2 for all ${DATES.length} dates (easy/medium/hard)...`);

    // Define per-difficulty algoScores (these are fixed target scores)
    const ALGO_SCORES = {
      easy: 12,    // 4x4 grid, typically solvable in 10-14 moves
      medium: 14,  // 5x5 grid, typically solvable in 12-16 moves
      hard: 18     // 6x6 grid, typically solvable in 15-20 moves
    };

    // Build puzzlesV2ByDate map for use in userAchievedGoal function
    const puzzlesV2ByDate = {};

    // Sample puzzle templates (will be reused with slight variations)
    const puzzleTemplates = {
      easy: {
        targetColor: "blue",
        colorMap: [3, 5, 0, 1, 2, 4],
        actions: [59, 45, 18, 44, 55, 0, 72, 30, 42],
        states: [
          { 0: ["red", "green", "yellow", "purple"], 1: ["green", "red", "purple", "red"], 2: ["blue", "yellow", "red", "green"], 3: ["red", "blue", "purple", "yellow"] },
          { 0: ["blue", "blue", "blue", "blue"], 1: ["blue", "blue", "blue", "blue"], 2: ["blue", "blue", "blue", "blue"], 3: ["blue", "blue", "blue", "blue"] }
        ]
      },
      medium: {
        targetColor: "red",
        colorMap: [0, 5, 4, 1, 3, 2],
        actions: [79, 39, 141, 52, 16, 30, 18, 96, 138, 126],
        states: [
          { 0: ["purple", "orange", "red", "green", "purple"], 1: ["purple", "blue", "red", "yellow", "blue"], 2: ["purple", "red", "red", "green", "yellow"], 3: ["yellow", "red", "green", "green", "red"], 4: ["red", "blue", "purple", "yellow", "blue"] },
          { 0: ["red", "red", "red", "red", "red"], 1: ["red", "red", "red", "red", "red"], 2: ["red", "red", "red", "red", "red"], 3: ["red", "red", "red", "red", "red"], 4: ["red", "red", "red", "red", "red"] }
        ]
      },
      hard: {
        targetColor: "purple",
        colorMap: [2, 1, 5, 3, 0, 4],
        actions: [50, 62, 170, 133, 84, 83, 210, 75, 36, 126],
        states: [
          { 0: ["green", "green", "green", "purple", "red", "red"], 1: ["purple", "red", "yellow", "yellow", "yellow", "red"], 2: ["yellow", "blue", "purple", "orange", "red", "green"], 3: ["red", "green", "yellow", "purple", "blue", "red"], 4: ["red", "green", "green", "red", "purple", "red"], 5: ["red", "blue", "purple", "yellow", "blue", "yellow"] },
          { 0: ["purple", "purple", "purple", "purple", "purple", "purple"], 1: ["purple", "purple", "purple", "purple", "purple", "purple"], 2: ["purple", "purple", "purple", "purple", "purple", "purple"], 3: ["purple", "purple", "purple", "purple", "purple", "purple"], 4: ["purple", "purple", "purple", "purple", "purple", "purple"], 5: ["purple", "purple", "purple", "purple", "purple", "purple"] }
        ]
      }
    };

    // Create puzzlesV2 documents for all dates
    const puzzlesV2Batches = [];
    let currentBatch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 450; // Firestore limit is 500, leave some margin

    for (const date of DATES) {
      puzzlesV2ByDate[date] = {};

      for (const difficulty of ['easy', 'medium', 'hard']) {
        // Add slight variation to algoScore (+/- 1) for realism
        const baseAlgo = ALGO_SCORES[difficulty];
        const variation = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
        const algoScore = baseAlgo + variation;

        const puzzleData = {
          algoScore,
          targetColor: puzzleTemplates[difficulty].targetColor,
          colorMap: puzzleTemplates[difficulty].colorMap,
          actions: puzzleTemplates[difficulty].actions,
          states: puzzleTemplates[difficulty].states
        };

        puzzlesV2ByDate[date][difficulty] = puzzleData;

        const docRef = db.collection('puzzlesV2').doc(`${date}-${difficulty}`);
        currentBatch.set(docRef, puzzleData, { merge: true });
        batchCount++;

        // Commit batch if near limit
        if (batchCount >= BATCH_SIZE) {
          puzzlesV2Batches.push(currentBatch);
          currentBatch = db.batch();
          batchCount = 0;
        }
      }
    }

    // Don't forget the last batch
    if (batchCount > 0) {
      puzzlesV2Batches.push(currentBatch);
    }

    // Commit all batches
    for (const batch of puzzlesV2Batches) {
      await batch.commit();
    }
    console.log(`Created puzzlesV2 documents for all ${DATES.length} dates (${DATES.length * 3} total documents)`);

    // 1c) Seed bestScores for today's puzzles (easy/medium/hard)
    console.log(`Creating bestScores for ${todayStr} (easy/medium/hard)...`);
    const bestScoresBatch = db.batch();

    // Use a placeholder user ID for the "best score holder" (will be replaced after userIds are generated)
    const bestScoreUserId = 'best-score-holder-temp';

    // Use puzzlesV2ByDate for today's puzzle data (includes algoScore with variation)
    const todayPuzzles = puzzlesV2ByDate[todayStr];
    const bestScoresData = {
      easy: {
        puzzleId: todayStr,
        difficulty: 'easy',
        userId: bestScoreUserId,
        userScore: todayPuzzles.easy.algoScore - 1,  // 1 better than bot
        targetColor: puzzleTemplates.easy.targetColor,
        states: puzzleTemplates.easy.states,
        actions: puzzleTemplates.easy.actions,
        colorMap: puzzleTemplates.easy.colorMap,
      },
      medium: {
        puzzleId: todayStr,
        difficulty: 'medium',
        userId: bestScoreUserId,
        userScore: todayPuzzles.medium.algoScore,  // Tied with bot
        targetColor: puzzleTemplates.medium.targetColor,
        states: puzzleTemplates.medium.states,
        actions: puzzleTemplates.medium.actions,
        colorMap: puzzleTemplates.medium.colorMap,
      },
      hard: {
        puzzleId: todayStr,
        difficulty: 'hard',
        userId: bestScoreUserId,
        userScore: todayPuzzles.hard.algoScore + 2,  // 2 worse than bot
        targetColor: puzzleTemplates.hard.targetColor,
        states: puzzleTemplates.hard.states,
        actions: puzzleTemplates.hard.actions,
        colorMap: puzzleTemplates.hard.colorMap,
      }
    };

    for (const [difficulty, data] of Object.entries(bestScoresData)) {
      const docRef = db.collection('bestScores').doc(`${todayStr}-${difficulty}`);
      bestScoresBatch.set(docRef, data, { merge: true });
    }
    await bestScoresBatch.commit();
    console.log(`Created bestScores for ${todayStr}: easy=${bestScoresData.easy.userScore}, medium=${bestScoresData.medium.userScore}, hard=${bestScoresData.hard.userScore}`);

    // 2) Generate 10 UIDs
    const userIds = [];
    for (let i = 0; i < 10; i++) userIds.push(generateMockFirebaseUID());
    console.log('Generated user IDs:', userIds);

    // Helper functions
    function computeCurrentStreak(allDates, predicate) {
      let count = 0;
      for (let i = allDates.length - 1; i >= 0; i--) {
        const d = allDates[i];
        if (predicate(d)) count++; else break;
      }
      return count;
    }
    function computeLongestStreak(allDates, predicate) {
      let maxStreak = 0;
      let current = 0;
      for (const d of allDates) {
        if (predicate(d)) { current++; if (current > maxStreak) maxStreak = current; }
        else { current = 0; }
      }
      return maxStreak;
    }

    const userHistories = {}; // uid -> { [date]: { easy?, medium?, hard? } }

    // 3) Create userPuzzleHistory with 20% skip per day and difficulty distribution
    for (const uid of userIds) {
      userHistories[uid] = {};
      for (const date of DATES) {
        // 20% chance to skip (user didn't play)
        if (Math.random() < 0.2) continue;

        // Difficulty presence distribution - more balanced for goal streak generation
        const r = Math.random();
        let hasEasy = false, hasMedium = false, hasHard = false;
        if (r < 0.25) { // 25% only hard
          hasHard = true;
        } else if (r < 0.40) { // 15% only medium
          hasMedium = true;
        } else if (r < 0.50) { // 10% only easy
          hasEasy = true;
        } else if (r < 0.65) { // 15% hard + medium
          hasHard = true; hasMedium = true;
        } else if (r < 0.80) { // 15% hard + easy
          hasHard = true; hasEasy = true;
        } else if (r < 0.90) { // 10% medium + easy
          hasMedium = true; hasEasy = true;
        } else { // 10% all three
          hasHard = true; hasMedium = true; hasEasy = true;
        }

        const docData = {};
        let anyHintUsed = false;
        let totalAttempts = 0;

        // Get per-difficulty algoScores from puzzlesV2ByDate
        const easyAlgo = puzzlesV2ByDate[date]?.easy?.algoScore || 12;
        const mediumAlgo = puzzlesV2ByDate[date]?.medium?.algoScore || 14;
        const hardAlgo = puzzlesV2ByDate[date]?.hard?.algoScore || 18;

        if (hasEasy) {
          const attempts = 1 + Math.floor(Math.random() * 4); // 1..4
          const firstTry = Math.random() < 0.35;
          const hintUsedEasy = Math.random() < 0.2;
          anyHintUsed = anyHintUsed || hintUsedEasy;
          // Move range: 8-15 for ~60% achievement rate with algoScore ~12
          // Narrower range centered around algoScore for more goal achievements
          const moves = 8 + Math.floor(Math.random() * 8) + (attempts - 1);
          const eloScore = 60 + Math.floor(Math.random() * 60); // 60..119
          const tie = moves <= easyAlgo;
          const beat = moves < easyAlgo;
          const easyObj = {
            attemptNumber: attempts,
            moves,
            firstTry,
            goalAchieved: tie,
            puzzleCompleted: true,
            eloScore,
            ...(tie ? { attemptToTieBot: attempts } : {}),
            ...(beat ? { attemptToBeatBot: attempts } : {}),
          };
          docData.easy = easyObj;
          totalAttempts += attempts;
        }

        if (hasMedium) {
          const attempts = 1 + Math.floor(Math.random() * 4);
          const firstTry = Math.random() < 0.25;
          const hintUsedMedium = Math.random() < 0.2;
          anyHintUsed = anyHintUsed || hintUsedMedium;
          // Move range: 10-17 for ~55% achievement rate with algoScore ~14
          const moves = 10 + Math.floor(Math.random() * 8) + (attempts - 1);
          const eloScore = 70 + Math.floor(Math.random() * 60); // 70..129
          const tie = moves <= mediumAlgo;
          const beat = moves < mediumAlgo;
          const mediumObj = {
            attemptNumber: attempts,
            moves,
            firstTry,
            eloScore,
            ...(tie ? { attemptToTieBot: attempts } : {}),
            ...(beat ? { attemptToBeatBot: attempts } : {}),
          };
          docData.medium = mediumObj;
          totalAttempts += attempts;
        }

        if (hasHard) {
          const attempts = 1 + Math.floor(Math.random() * 5);
          const firstTry = Math.random() < 0.15;
          const hintUsedHard = Math.random() < 0.25;
          anyHintUsed = anyHintUsed || hintUsedHard;
          // Move range: 14-23 for ~50% achievement rate with algoScore ~18
          const moves = 14 + Math.floor(Math.random() * 10) + (attempts - 1);
          const eloScore = 80 + Math.floor(Math.random() * 60); // 80..139
          const tie = moves <= hardAlgo;
          const beat = moves < hardAlgo;
          const firstToBeatBot = Math.random() < 0.1;
          const hardObj = {
            attemptNumber: attempts,
            moves,
            firstTry,
            eloScore,
            firstToBeatBot,
            ...(tie ? { attemptToTieBot: attempts } : {}),
            ...(beat ? { attemptToBeatBot: attempts } : {}),
          };
          docData.hard = hardObj;
          totalAttempts += attempts;
        }

        // Add top-level puzzle fields
        docData.totalAttempts = totalAttempts;
        docData.hintUsed = anyHintUsed;

        // Persist history doc using user/{uid}/puzzles/{date}
        const historyDocRef = db.collection('userPuzzleHistory').doc(uid).collection('puzzles').doc(date);
        await historyDocRef.set(docData);
        userHistories[uid][date] = docData;
      }
    }

    // 4) Attach per-difficulty leaderboard stats under userPuzzleHistory/{uid}
    for (const uid of userIds) {
      const historyByDate = userHistories[uid];
      const datesPlayed = DATES.filter(d => !!historyByDate[d]);

      function goalsAchievedPredicate(difficulty) {
        return (d) => {
          const e = historyByDate[d]?.[difficulty];
          if (!e) return false;
          const algo = puzzlesV2ByDate[d]?.[difficulty]?.algoScore;
          if (!algo) return false;
          return e.moves <= algo;
        };
      }
      function firstTryPredicate(difficulty) {
        return (d) => {
          const e = historyByDate[d]?.[difficulty];
          return !!(e && e.firstTry);
        };
      }

      function buildDifficultyStats(difficulty) {
        const daysWithDiff = DATES.filter(d => !!historyByDate[d]?.[difficulty]);
        const goalsAchievedDays = daysWithDiff.filter(goalsAchievedPredicate(difficulty));
        const goalsBeatenDays = daysWithDiff.filter(d => {
          const e = historyByDate[d]?.[difficulty];
          const algo = puzzlesV2ByDate[d]?.[difficulty]?.algoScore;
          return !!(e && algo && e.moves < algo);
        });
        const currentTieBotStreak = computeCurrentStreak(DATES, (d) => goalsAchievedDays.includes(d));
        const longestTieBotStreak = computeLongestStreak(DATES, (d) => goalsAchievedDays.includes(d));
        const lastTieBotDate = goalsAchievedDays.length ? goalsAchievedDays[goalsAchievedDays.length - 1] : null;

        const goalAchievedDate = goalsAchievedDays.length ? goalsAchievedDays[goalsAchievedDays.length - 1] : null;
        const goalBeatenDate = goalsBeatenDays.length ? goalsBeatenDays[goalsBeatenDays.length - 1] : null;

        const firstTryDays = daysWithDiff.filter(firstTryPredicate(difficulty));
        const currentFirstTryStreak = computeCurrentStreak(DATES, (d) => firstTryDays.includes(d));
        const longestFirstTryStreak = computeLongestStreak(DATES, (d) => firstTryDays.includes(d));
        const lastFirstTryDate = firstTryDays.length ? firstTryDays[firstTryDays.length - 1] : null;

        return {
          goalsBeaten: goalsBeatenDays.length,
          goalsAchieved: goalsAchievedDays.length,
          goalAchievedDate,
          goalBeatenDate,
          currentFirstTryStreak,
          lastFirstTryDate,
          longestFirstTryStreak,
          currentTieBotStreak,
          lastTieBotDate,
          longestTieBotStreak
        };
      }

      // Level-agnostic aggregates
      let puzzleAttempts = 0;
      let moves = 0;
      for (const d of datesPlayed) {
        const entry = historyByDate[d];
        if (entry.easy) { puzzleAttempts += (entry.easy.attempts || 0); moves += entry.easy.moves; }
        if (entry.medium) { puzzleAttempts += (entry.medium.attempts || 0); moves += entry.medium.moves; }
        if (entry.hard) { puzzleAttempts += (entry.hard.attempts || 0); moves += entry.hard.moves; }
      }
      const levelAgnostic = {
        puzzleAttempts,
        moves,
        puzzlesSolved: datesPlayed.length,
        currentPuzzlesCompletedStreak: computeCurrentStreak(DATES, (d) => datesPlayed.includes(d)),
        lastPuzzleCompletedDate: datesPlayed.length ? datesPlayed[datesPlayed.length - 1] : null,
        longestPuzzlesCompletedStreak: computeLongestStreak(DATES, (d) => datesPlayed.includes(d))
      };

      const leaderboardEasy = buildDifficultyStats('easy');
      const leaderboardMedium = buildDifficultyStats('medium');
      const leaderboardHard = buildDifficultyStats('hard');

      // Compute Elo aggregates from daily best elo across difficulties
      const eloScoreByDay = {};
      for (const d of datesPlayed) {
        const e = historyByDate[d];
        const elos = [];
        if (e.easy && typeof e.easy.eloScore === 'number') elos.push(e.easy.eloScore);
        if (e.medium && typeof e.medium.eloScore === 'number') elos.push(e.medium.eloScore);
        if (e.hard && typeof e.hard.eloScore === 'number') elos.push(e.hard.eloScore);
        if (elos.length > 0) eloScoreByDay[d] = Math.max(...elos);
      }
      let eloScoreAllTime = 0;
      let eloScoreLast30 = 0;
      let eloScoreLast7 = 0;
      const now = new Date();
      const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const start30 = new Date(todayUTC); start30.setUTCDate(start30.getUTCDate() - 29);
      const start7 = new Date(todayUTC); start7.setUTCDate(start7.getUTCDate() - 6);
      for (const [dayStr, val] of Object.entries(eloScoreByDay)) {
        if (typeof val !== 'number' || isNaN(val)) continue;
        eloScoreAllTime += val;
        try {
          const parts = dayStr.split('-');
          if (parts.length === 3) {
            const dUTC = Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            const dDate = new Date(dUTC);
            if (!isNaN(dDate.getTime())) {
              if (dDate >= start30) eloScoreLast30 += val;
              if (dDate >= start7) eloScoreLast7 += val;
            }
          }
        } catch {}
      }
      const leaderboardCol = db.collection('userPuzzleHistory').doc(uid).collection('leaderboard');
      await leaderboardCol.doc('levelAgnostic').set({
        ...levelAgnostic,
        eloScoreByDay,
        eloScoreAllTime,
        eloScoreLast30,
        eloScoreLast7,
      }, { merge: true });
      await leaderboardCol.doc('easy').set(leaderboardEasy, { merge: true });
      await leaderboardCol.doc('medium').set(leaderboardMedium, { merge: true });
      await leaderboardCol.doc('hard').set(leaderboardHard, { merge: true });
    }

    // 5) Create dailyScoresV2 (per-difficulty) for all dates
    console.log('Creating/updating dailyScoresV2 for all puzzle dates...');
    for (const date of DATES) {
      const easyMap = {};
      const mediumMap = {};
      const hardMap = {};
      for (const uid of userIds) {
        const entry = userHistories[uid][date];
        if (!entry) continue; // user didn't play this date
        if (entry.easy && typeof entry.easy.moves === 'number') {
          easyMap[uid] = entry.easy.moves;
        }
        if (entry.medium && typeof entry.medium.moves === 'number') {
          mediumMap[uid] = entry.medium.moves;
        }
        if (entry.hard && typeof entry.hard.moves === 'number') {
          hardMap[uid] = entry.hard.moves;
        }
      }
      const update = {};
      if (Object.keys(easyMap).length) update.easy = easyMap;
      if (Object.keys(mediumMap).length) update.medium = mediumMap;
      if (Object.keys(hardMap).length) update.hard = hardMap;
      if (Object.keys(update).length) {
        await db.collection('dailyScoresV2').doc(date).set(update, { merge: true });
      }
    }

    // Verify counts for today's hard entries in dailyScoresV2
    console.log('Verifying dailyScoresV2 (hard) map for today...');
    const v2Doc = await db.collection('dailyScoresV2').doc(todayStr).get();
    const v2Data = v2Doc.exists ? (v2Doc.data() || {}) : {};
    const hardCount = v2Data && v2Data.hard ? Object.keys(v2Data.hard).length : 0;
    console.log(`Found ${hardCount} hard entries in dailyScoresV2 for ${todayStr}`);

    console.log('Created dailyScoresV2 collections with per-difficulty structure');

    // 6) Create usageStats collection for all dates with userIds and streak counts
    console.log('Creating/updating usageStats for all puzzle dates (including streak data)...');

    // Helper function to check if user achieved goal on a date for a difficulty
    // Uses puzzlesV2ByDate which has per-difficulty algoScores
    function userAchievedGoal(uid, date, difficulty) {
      const entry = userHistories[uid]?.[date]?.[difficulty];
      if (!entry) return false;
      const algo = puzzlesV2ByDate[date]?.[difficulty]?.algoScore;
      if (!algo) return false;
      return entry.moves <= algo;
    }

    // Helper function to check if user completed any puzzle on a date
    function userCompletedPuzzle(uid, date) {
      const entry = userHistories[uid]?.[date];
      if (!entry) return false;
      return !!(entry.easy || entry.medium || entry.hard);
    }

    // Helper to get date N days before a given date string
    function getDateNDaysBefore(dateStr, n) {
      const d = new Date(dateStr + 'T00:00:00');
      d.setDate(d.getDate() - n);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Helper to check if user has 3+ day streak ending on given date
    function hasStreakEndingOnDate(uid, date, checkFn) {
      // Check if user has achievement on this date and 2 previous consecutive days
      for (let i = 0; i < 3; i++) {
        const checkDate = getDateNDaysBefore(date, i);
        if (!checkFn(uid, checkDate)) {
          return false;
        }
      }
      return true;
    }

    for (const date of DATES) {
      // Count unique users who played this date (across all difficulties)
      const uniqueUsersSet = new Set();
      let totalAttemptsForDate = 0;

      // Streak counters
      let puzzleStreak3PlusCount = 0;
      let easyGoalStreak3PlusCount = 0;
      let mediumGoalStreak3PlusCount = 0;
      let hardGoalStreak3PlusCount = 0;

      for (const uid of userIds) {
        const entry = userHistories[uid][date];
        if (!entry) continue; // user didn't play this date

        uniqueUsersSet.add(uid);
        totalAttemptsForDate += entry.totalAttempts || 0;

        // Check for 3+ day streaks ending on this date
        if (hasStreakEndingOnDate(uid, date, userCompletedPuzzle)) {
          puzzleStreak3PlusCount++;
        }
        if (hasStreakEndingOnDate(uid, date, (u, d) => userAchievedGoal(u, d, 'easy'))) {
          easyGoalStreak3PlusCount++;
        }
        if (hasStreakEndingOnDate(uid, date, (u, d) => userAchievedGoal(u, d, 'medium'))) {
          mediumGoalStreak3PlusCount++;
        }
        if (hasStreakEndingOnDate(uid, date, (u, d) => userAchievedGoal(u, d, 'hard'))) {
          hardGoalStreak3PlusCount++;
        }
      }

      const uniqueUsers = uniqueUsersSet.size;
      const userIdsArray = Array.from(uniqueUsersSet).sort();

      // Generate realistic streak values in the 10-30 range for each day
      // This simulates a larger user base than our 10 test users
      const generateStreakValue = () => 10 + Math.floor(Math.random() * 21); // 10-30
      const seededPuzzleStreak = generateStreakValue();
      const seededEasyGoalStreak = generateStreakValue();
      const seededMediumGoalStreak = generateStreakValue();
      const seededHardGoalStreak = generateStreakValue();

      // Only write if there's data for this date
      if (uniqueUsers > 0) {
        await db.collection('usageStats').doc(date).set({
          uniqueUsers,
          totalAttempts: totalAttemptsForDate,
          userIds: userIdsArray,
          // Streak counts - using seeded higher values (10-30 range)
          puzzleStreak3PlusCount: seededPuzzleStreak,
          easyGoalStreak3PlusCount: seededEasyGoalStreak,
          mediumGoalStreak3PlusCount: seededMediumGoalStreak,
          hardGoalStreak3PlusCount: seededHardGoalStreak,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
    console.log('Created usageStats collection with daily stats and streak counts');

    // 7) Create aggregate stats documents (7d, 30d, 90d, allTime)
    console.log('Creating aggregate stats documents...');
    
    // Helper to calculate aggregates for a date range
    // NOTE: Frontend applies a 2-day delay (DATA_DELAY_DAYS) when requesting stats.
    // Aggregates must use the same offset so their dates match the frontend request.
    const DATA_DELAY_DAYS = 2;

    async function createAggregate(docId, daysBack) {
      // Calculate endDate with the same 2-day delay as frontend
      const endDateObj = new Date(todayStr + 'T00:00:00');
      endDateObj.setDate(endDateObj.getDate() - DATA_DELAY_DAYS);
      const endDate = endDateObj.toISOString().split('T')[0];

      const startDateObj = new Date(endDate + 'T00:00:00');
      startDateObj.setDate(startDateObj.getDate() - (daysBack - 1));
      const startDate = startDateObj.toISOString().split('T')[0];

      const uniqueUsersSet = new Set();
      let totalAttempts = 0;
      let daysWithData = 0;

      // Streak sum accumulators
      let puzzleStreak3PlusSum = 0;
      let easyGoalStreak3PlusSum = 0;
      let mediumGoalStreak3PlusSum = 0;
      let hardGoalStreak3PlusSum = 0;

      for (const date of DATES) {
        if (date < startDate || date > endDate) continue;

        const entry = userHistories;
        for (const uid of userIds) {
          const userEntry = entry[uid][date];
          if (!userEntry) continue;

          uniqueUsersSet.add(uid);
        }

        // Get total attempts and streak counts for this date
        for (const uid of userIds) {
          const userEntry = entry[uid][date];
          if (userEntry) {
            totalAttempts += userEntry.totalAttempts || 0;

            // Sum streak counts for this user on this date
            if (hasStreakEndingOnDate(uid, date, userCompletedPuzzle)) {
              puzzleStreak3PlusSum++;
            }
            if (hasStreakEndingOnDate(uid, date, (u, d) => userAchievedGoal(u, d, 'easy'))) {
              easyGoalStreak3PlusSum++;
            }
            if (hasStreakEndingOnDate(uid, date, (u, d) => userAchievedGoal(u, d, 'medium'))) {
              mediumGoalStreak3PlusSum++;
            }
            if (hasStreakEndingOnDate(uid, date, (u, d) => userAchievedGoal(u, d, 'hard'))) {
              hardGoalStreak3PlusSum++;
            }
          }
        }

        // Check if any user played this date
        const dayHasData = userIds.some(uid => entry[uid][date]);
        if (dayHasData) daysWithData++;
      }

      const userIdsArray = Array.from(uniqueUsersSet).sort();

      // Override with larger hardcoded values based on time period
      // These values are consistent with daily values in 10-30 range (avg ~20 per day)
      const hardcodedStreaks = {
        'aggregate_7d': { puzzle: 140, easy: 130, medium: 125, hard: 120 },
        'aggregate_30d': { puzzle: 600, easy: 580, medium: 550, hard: 520 },
        'aggregate_90d': { puzzle: 1800, easy: 1750, medium: 1680, hard: 1600 },
      };
      const streaks = hardcodedStreaks[docId] || { puzzle: puzzleStreak3PlusSum, easy: easyGoalStreak3PlusSum, medium: mediumGoalStreak3PlusSum, hard: hardGoalStreak3PlusSum };

      await db.collection('usageStats').doc(docId).set({
        uniqueUsers: uniqueUsersSet.size,
        totalAttempts,
        daysWithData,
        startDate,
        endDate,
        userIds: userIdsArray,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Streak sums (hardcoded for larger values)
        puzzleStreak3PlusSum: streaks.puzzle,
        easyGoalStreak3PlusSum: streaks.easy,
        mediumGoalStreak3PlusSum: streaks.medium,
        hardGoalStreak3PlusSum: streaks.hard,
      }, { merge: true });

      console.log(`  ${docId}: ${uniqueUsersSet.size} users, ${totalAttempts} attempts, ${daysWithData} days, streaks: puzzle=${streaks.puzzle}, easy=${streaks.easy}, medium=${streaks.medium}, hard=${streaks.hard}`);
    }
    
    // Create aggregate documents
    await createAggregate('aggregate_7d', 7);
    await createAggregate('aggregate_30d', 30);
    await createAggregate('aggregate_90d', 90);
    
    // All-time aggregate (all DATES)
    const allUniqueUsersSet = new Set();
    let allTotalAttempts = 0;
    let allDaysWithData = 0;

    // Streak sum accumulators for all-time
    let allPuzzleStreak3PlusSum = 0;
    let allEasyGoalStreak3PlusSum = 0;
    let allMediumGoalStreak3PlusSum = 0;
    let allHardGoalStreak3PlusSum = 0;

    for (const date of DATES) {
      let dayHasData = false;
      for (const uid of userIds) {
        const entry = userHistories[uid][date];
        if (entry) {
          allUniqueUsersSet.add(uid);
          allTotalAttempts += entry.totalAttempts || 0;
          dayHasData = true;

          // Sum streaks for this user on this date
          if (hasStreakEndingOnDate(uid, date, userCompletedPuzzle)) {
            allPuzzleStreak3PlusSum++;
          }
          if (hasStreakEndingOnDate(uid, date, (u, d) => userAchievedGoal(u, d, 'easy'))) {
            allEasyGoalStreak3PlusSum++;
          }
          if (hasStreakEndingOnDate(uid, date, (u, d) => userAchievedGoal(u, d, 'medium'))) {
            allMediumGoalStreak3PlusSum++;
          }
          if (hasStreakEndingOnDate(uid, date, (u, d) => userAchievedGoal(u, d, 'hard'))) {
            allHardGoalStreak3PlusSum++;
          }
        }
      }
      if (dayHasData) allDaysWithData++;
    }

    const allUserIdsArray = Array.from(allUniqueUsersSet).sort();

    // Hardcoded streak values for allTime (same as 90d, consistent with daily 10-30 range)
    const allTimeStreaks = { puzzle: 1800, easy: 1750, medium: 1680, hard: 1600 };

    // Calculate allTime endDate with same 2-day delay as frontend
    const allTimeEndDateObj = new Date(todayStr + 'T00:00:00');
    allTimeEndDateObj.setDate(allTimeEndDateObj.getDate() - DATA_DELAY_DAYS);
    const allTimeEndDate = allTimeEndDateObj.toISOString().split('T')[0];

    await db.collection('usageStats').doc('aggregate_allTime').set({
      uniqueUsers: allUniqueUsersSet.size,
      totalAttempts: allTotalAttempts,
      daysWithData: allDaysWithData,
      startDate: DATES[0],
      endDate: allTimeEndDate,
      userIds: allUserIdsArray,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Streak sums (hardcoded for larger values)
      puzzleStreak3PlusSum: allTimeStreaks.puzzle,
      easyGoalStreak3PlusSum: allTimeStreaks.easy,
      mediumGoalStreak3PlusSum: allTimeStreaks.medium,
      hardGoalStreak3PlusSum: allTimeStreaks.hard,
    }, { merge: true });

    console.log(`  aggregate_allTime: ${allUniqueUsersSet.size} users, ${allTotalAttempts} attempts, ${allDaysWithData} days, streaks: puzzle=${allTimeStreaks.puzzle}, easy=${allTimeStreaks.easy}, medium=${allTimeStreaks.medium}, hard=${allTimeStreaks.hard}`);
    console.log('Created aggregate stats documents');

    // Verify usageStats for today (including streak data)
    const usageDoc = await db.collection('usageStats').doc(todayStr).get();
    if (usageDoc.exists) {
      const usageData = usageDoc.data();
      console.log(`usageStats for ${todayStr}:`);
      console.log(`  - ${usageData.uniqueUsers} unique users, ${usageData.totalAttempts} attempts`);
      console.log(`  - Streak counts (users with 3+ day streaks):`);
      console.log(`    - Puzzle: ${usageData.puzzleStreak3PlusCount || 0}`);
      console.log(`    - Easy Goal: ${usageData.easyGoalStreak3PlusCount || 0}`);
      console.log(`    - Medium Goal: ${usageData.mediumGoalStreak3PlusCount || 0}`);
      console.log(`    - Hard Goal: ${usageData.hardGoalStreak3PlusCount || 0}`);
    }

    console.log('Seeding completed successfully');
  }
  catch (error) {
    console.error('Error seeding data:', error);
  }
}

// Function to generate a Firebase-like UID
function generateMockFirebaseUID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let uid = '';
  for (let i = 0; i < 28; i++) {
    uid += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return uid;
}

// Run the seed function
seedData().then(() => {
  console.log('Done! You can now run your app and test with this data.');
  process.exit(0);
}); 
