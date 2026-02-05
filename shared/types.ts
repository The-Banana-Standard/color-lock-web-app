/**
 * Game difficulty levels — shared between frontend and Cloud Functions.
 */
export enum DifficultyLevel {
  Easy = "easy",
  Medium = "medium",
  Hard = "hard"
}

/**
 * Represents the overall game statistics for a user.
 * All statistics are stored at the root level of the document.
 */
export interface GameStatistics {
  lastPlayedIsoDate: string;
  currentPuzzleCompletedStreak: number;
  longestPuzzleCompletedStreak: number;
  puzzleCompletedStreakDate: string | null;
  currentTieBotStreak: number;
  longestTieBotStreak: number;
  tieBotStreakDate: string | null;
  playedDays: string[];
  goalAchievedDays: string[];
  goalBeatenDays: string[];
  totalWins: number;
  totalGamesPlayed: number;
  totalMovesUsed: number;
  totalHintsUsed: number;
  winsPerDay: { [date: string]: number };
  attemptsPerDay: { [date: string]: number };
  hintUsageByDay: { [date: string]: number };
  bestScoresByDay: { [date: string]: number };
  bestScoresByDayDifficulty: { [date: string]: DifficultyLevel };
  eloScoreByDay: { [date: string]: number };
  attemptsToAchieveBotScore: { [date: string]: number };
  attemptsToBeatBotScore: { [date: string]: number };
  attemptsToWinByDay: { [date: string]: number };
  currentFirstTryStreak: number;
  longestFirstTryStreak: number;
  firstTryStreakDate: string | null;
  attemptWhenHintUsed: { [date: string]: number | null };
  eloScoreAvg: number | null;
  eloScoreTotal: number | null;
  eloScoreAvgLast30: number | null;
  eloScoreTotalLast30: number | null;
}

/**
 * Default statistics with initial values.
 */
export const defaultStats: GameStatistics = {
  lastPlayedIsoDate: '',
  currentPuzzleCompletedStreak: 0,
  longestPuzzleCompletedStreak: 0,
  puzzleCompletedStreakDate: null,
  currentTieBotStreak: 0,
  longestTieBotStreak: 0,
  tieBotStreakDate: null,
  playedDays: [],
  goalAchievedDays: [],
  goalBeatenDays: [],
  totalWins: 0,
  totalGamesPlayed: 0,
  totalMovesUsed: 0,
  totalHintsUsed: 0,
  winsPerDay: {},
  attemptsPerDay: {},
  hintUsageByDay: {},
  bestScoresByDay: {},
  bestScoresByDayDifficulty: {},
  eloScoreByDay: {},
  attemptsToAchieveBotScore: {},
  attemptsToBeatBotScore: {},
  attemptsToWinByDay: {},
  currentFirstTryStreak: 0,
  longestFirstTryStreak: 0,
  firstTryStreakDate: null,
  attemptWhenHintUsed: {},
  eloScoreAvg: null,
  eloScoreTotal: null,
  eloScoreAvgLast30: null,
  eloScoreTotalLast30: null,
};

/**
 * Structure for an entry in the global leaderboard.
 */
export interface LeaderboardEntry {
  userId: string;
  username: string | null;
  totalWins: number;
  totalMovesUsed: number;
  longestPuzzleCompletedStreak: number;
  currentPuzzleCompletedStreak: number;
  puzzleCompletedStreakDate: string | null;
  longestTieBotStreak: number;
  currentTieBotStreak: number;
  tieBotStreakDate: string | null;
  currentFirstTryStreak: number;
  longestFirstTryStreak: number;
  eloScoreAvg: number | null;
  eloScoreTotal: number | null;
  eloScoreAvgLast30: number | null;
  eloScoreTotalLast30: number | null;
  botsBeaten: number;
  botsAchieved: number;
}
