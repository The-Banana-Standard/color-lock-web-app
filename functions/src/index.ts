/**
 * Cloud Functions for Color Lock
 *
 * This file re-exports all Cloud Functions from their respective modules.
 * Firebase uses the export names as the function names in deployment.
 */

// Puzzle Functions
export { fetchPuzzle } from "./functions/puzzles/fetchPuzzle.js";
export { fetchPuzzleV2 } from "./functions/puzzles/fetchPuzzleV2.js";
export { recordPuzzleHistory, normalizeDifficulty, isDayAfter } from "./functions/puzzles/recordPuzzleHistory.js";
export { setHintUsedForPuzzle } from "./functions/puzzles/setHintUsedForPuzzle.js";

// Stats Functions
export { getDailyScoresV2Stats } from "./functions/stats/getDailyScoresV2Stats.js";
export { getWinModalStats } from "./functions/stats/getWinModalStats.js";
export { getPersonalStats } from "./functions/stats/getPersonalStats.js";

// Leaderboard Functions
export { getGlobalLeaderboardV2 } from "./functions/leaderboard/getGlobalLeaderboardV2.js";
export { precomputeLeaderboards } from "./functions/leaderboard/precomputeLeaderboards.js";

// Usage Stats Functions
export { collectDailyUsageStats } from "./functions/usage/collectDailyUsageStats.js";
export { getUsageStats } from "./functions/usage/getUsageStats.js";
export { backfillUsageStats } from "./functions/usage/backfillUsageStats.js";

// User Functions
export { deleteAccount } from "./functions/user/deleteAccount.js";
export { updateNotificationPreferences } from "./functions/user/updateNotificationPreferences.js";

// Notification Functions
export { sendDailyPuzzleReminders } from "./functions/notifications/sendDailyPuzzleReminders.js";

// Firestore Triggers
export { onBestScoreWritten } from "./functions/triggers/onBestScoreWritten.js";

// Scheduled Functions
export { updateWeeklyHardestPuzzle } from "./functions/scheduled/updateWeeklyHardestPuzzle.js";
