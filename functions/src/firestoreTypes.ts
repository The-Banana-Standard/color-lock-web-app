import { DifficultyLevel } from "../../shared/types";

/** Shape of a single difficulty entry within a puzzle document */
export interface PuzzleDifficultyEntry {
    attempts?: number;
    totalAttempts?: number;
    attemptNumber?: number;
    lowestMovesAttemptNumber?: number | null;
    moves?: number | null;
    hintUsed?: boolean;
    firstTry?: boolean;
    firstToBeatBot?: boolean;
    eloScore?: number | null;
    elo?: number; // Legacy field name
    attemptToTieBot?: number | null;
    attemptToBeatBot?: number | null;
}

/** Shape of userPuzzleHistory/{uid}/puzzles/{puzzleId} */
export interface UserPuzzleDocument {
    totalAttempts?: number;
    easy?: PuzzleDifficultyEntry;
    medium?: PuzzleDifficultyEntry;
    hard?: PuzzleDifficultyEntry;
    [key: string]: PuzzleDifficultyEntry | number | undefined;
}

/** Shape of userPuzzleHistory/{uid}/leaderboard/levelAgnostic */
export interface LevelAgnosticLeaderboardDoc {
    moves?: number;
    puzzleAttempts?: number;
    puzzleSolved?: number;
    currentPuzzleCompletedStreak?: number;
    longestPuzzleCompletedStreak?: number;
    lastPuzzleCompletedDate?: string | null;
    lastEasyCompletedDate?: string | null;
    lastMediumCompletedDate?: string | null;
    lastHardCompletedDate?: string | null;
    eloScoreByDay?: Record<string, number>;
    eloScoreAllTime?: number;
    eloScoreLast30?: number;
    eloScoreLast7?: number;
    [key: string]: unknown;
}

/** Shape of userPuzzleHistory/{uid}/leaderboard/{easy|medium|hard} */
export interface DifficultyLeaderboardDoc {
    currentFirstTryStreak?: number;
    longestFirstTryStreak?: number;
    lastFirstTryDate?: string | null;
    goalsAchieved?: number;
    goalAchievedDate?: string | null;
    goalsBeaten?: number;
    goalBeatenDate?: string | null;
    currentTieBotStreak?: number;
    longestTieBotStreak?: number;
    lastTieBotDate?: string | null;
    [key: string]: unknown;
}

/** Shape of dailyScoresV2/{puzzleId} */
export interface DailyScoresV2Document {
    easy?: Record<string, number>;
    medium?: Record<string, number>;
    hard?: Record<string, number>;
    [key: string]: Record<string, number> | undefined;
}

/** Server-side grid type (functions don't have access to frontend PuzzleGrid) */
export type FirestorePuzzleGrid = Record<string, unknown[]>;

/** Shape of a puzzlesV2/{docId} document (used to return data from fetchPuzzleV2) */
export interface PuzzleV2Document {
    algoScore: number;
    targetColor: string;
    states: FirestorePuzzleGrid[];
    actions: number[];
    colorMap: number[];
    [key: string]: unknown;
}
