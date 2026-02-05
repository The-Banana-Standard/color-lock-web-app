import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { FirestorePuzzleData } from '../types';
import { GameStatistics, defaultStats } from '../types/stats';
import { LeaderboardEntryV2 } from '../services/firebaseService';
import { DifficultyLevel } from '../types/settings';
import {
    fetchPuzzleV2Callable,
    getPersonalStatsCallable,
    getGlobalLeaderboardV2Callable,
    getDailyScoresV2StatsCallable,
    getWinModalStatsCallable,
    getBestScoreForPuzzle
} from '../services/firebaseService';
import { dateKeyForToday } from '../utils/dateUtils';
import { User } from 'firebase/auth';
import useSettings from '../hooks/useSettings';

interface DailyScoreStats {
    lowestScore: number | null;
    averageScore: number | null;
    totalPlayers: number;
    playersWithLowestScore: number;
}

// V2 per-difficulty stats shape
interface DifficultyDailyStats {
    lowestScore: number | null;
    totalPlayers: number;
    playersWithLowestScore: number;
    averageScore: number | null;
}
type DailyScoresV2Stats = Record<string, DifficultyDailyStats>;

interface WinModalStats {
    totalAttempts: number | null;
    currentPuzzleCompletedStreak: number | null;
    currentTieBotStreak: number | null;
    currentFirstTryStreak: number | null;
    difficulty: DifficultyLevel | null;
}

interface LoadingStates {
    dailyScores: boolean;
    puzzle: boolean;
    userStats: boolean;
    leaderboard: boolean;
    winModalStats: boolean;
}

interface ErrorStates {
    dailyScores: string | null;
    puzzle: string | null;
    userStats: string | null;
    leaderboard: string | null;
    winModalStats: string | null;
}

interface DataCacheContextValue {
    dailyScoresStats: DailyScoreStats | null;
    dailyScoresV2Stats: DailyScoresV2Stats | null;
    puzzleData: FirestorePuzzleData | null;
    puzzleDataV2: Record<'easy' | 'medium' | 'hard', FirestorePuzzleData> | null;
    userStats: GameStatistics | null;
    globalLeaderboard: LeaderboardEntryV2[] | null;
    winModalStats: WinModalStats | null;
    bestScoresForDay: Record<'easy' | 'medium' | 'hard', number | null>;
    loadingStates: LoadingStates;
    errorStates: ErrorStates;
    fetchAndCacheData: (currentUser: User | null) => Promise<void>;
    isInitialFetchDone: boolean;
    updateBestScoreForDay: (difficulty: 'easy' | 'medium' | 'hard', score: number) => void;
}

const initialLoadingStates: LoadingStates = {
    dailyScores: false,
    puzzle: false,
    userStats: false,
    leaderboard: false,
    winModalStats: false,
};

const initialErrorStates: ErrorStates = {
    dailyScores: null,
    puzzle: null,
    userStats: null,
    leaderboard: null,
    winModalStats: null,
};

const DataCacheContext = createContext<DataCacheContextValue | undefined>(undefined);

export const useDataCache = () => {
    const context = useContext(DataCacheContext);
    if (!context) {
        throw new Error('useDataCache must be used within a DataCacheProvider');
    }
    return context;
};

interface DataCacheProviderProps {
    children: ReactNode;
}

export const DataCacheProvider: React.FC<DataCacheProviderProps> = ({ children }) => {
    const { settings } = useSettings();
    const [dailyScoresStats, setDailyScoresStats] = useState<DailyScoreStats | null>(null);
    const [dailyScoresV2Stats, setDailyScoresV2Stats] = useState<DailyScoresV2Stats | null>(null);
    const [puzzleData, setPuzzleData] = useState<FirestorePuzzleData | null>(null);
    const [puzzleDataV2, setPuzzleDataV2] = useState<Record<'easy' | 'medium' | 'hard', FirestorePuzzleData> | null>(null);
    const [userStats, setUserStats] = useState<GameStatistics | null>(null);
    const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardEntryV2[] | null>(null);
    const [winModalStats, setWinModalStats] = useState<WinModalStats | null>(null);
    const [bestScoresForDay, setBestScoresForDay] = useState<Record<'easy' | 'medium' | 'hard', number | null>>({
        easy: null, medium: null, hard: null
    });
    const [loadingStates, setLoadingStates] = useState<LoadingStates>(initialLoadingStates);
    const [errorStates, setErrorStates] = useState<ErrorStates>(initialErrorStates);
    const [isInitialFetchDone, setIsInitialFetchDone] = useState(false);

    const fetchAndCacheData = useCallback(async (currentUser: User | null) => {
        if (isInitialFetchDone) {
            console.log("DataCacheContext: Initial fetch already done, skipping.");
            return;
        }
        console.log("DataCacheContext: Starting initial data fetch sequence...");

        const today = dateKeyForToday();

        // --- Step 1: Batch all loading/error state resets upfront ---
        setLoadingStates(prev => ({
            ...prev,
            dailyScores: true,
            puzzle: true,
            leaderboard: true,
            ...(currentUser ? { userStats: true, winModalStats: true } : {}),
        }));
        setErrorStates(prev => ({
            ...prev,
            dailyScores: null,
            puzzle: null,
            leaderboard: null,
            ...(currentUser ? { userStats: null, winModalStats: null } : {}),
        }));

        // --- Step 2: Define each fetch as a self-contained async function ---

        // 1. Fetch Daily Scores V2 Stats (per difficulty)
        const fetchDailyScoresV2 = async () => {
            try {
                console.log("DataCacheContext: Fetching Daily Scores V2 Stats (per difficulty)...");
                const result = await getDailyScoresV2StatsCallable({ puzzleId: today });
                if (result.data.success && result.data.stats) {
                    setDailyScoresV2Stats(result.data.stats as DailyScoresV2Stats);
                    console.log("DataCacheContext: Daily Scores V2 Stats fetched successfully.");
                } else {
                    throw new Error(result.data.error || 'Failed to fetch daily scores V2 stats');
                }
            } catch (error: unknown) {
                console.error("DataCacheContext: Error fetching daily scores V2 stats:", error);
                setErrorStates(prev => ({ ...prev, dailyScores: error instanceof Error ? error.message : 'Failed to load daily stats' }));
            } finally {
                setLoadingStates(prev => ({ ...prev, dailyScores: false }));
            }
        };

        // 2. Fetch Puzzle Data V2 (all difficulties)
        const fetchPuzzleDataV2 = async () => {
            try {
                console.log("DataCacheContext: Fetching Puzzle Data V2 (all difficulties)...");
                const result = await fetchPuzzleV2Callable({ date: today });
                if (result.data.success && result.data.data) {
                    setPuzzleDataV2(result.data.data);
                    console.log("DataCacheContext: Puzzle Data V2 fetched successfully.");
                    console.log("DataCacheContext: Puzzle Data V2:", result.data.data);
                } else {
                    throw new Error(result.data.error || 'Failed to fetch puzzle data');
                }
            } catch (error: unknown) {
                console.error("DataCacheContext: Error fetching puzzle data V2:", error);
                setErrorStates(prev => ({ ...prev, puzzle: error instanceof Error ? error.message : 'Failed to load puzzle' }));
            } finally {
                setLoadingStates(prev => ({ ...prev, puzzle: false }));
            }
        };

        // 2.5. Fetch Best Scores for today (all difficulties in parallel)
        const fetchBestScores = async () => {
            try {
                console.log("DataCacheContext: Fetching Best Scores for today...");
                const [easyBest, mediumBest, hardBest] = await Promise.all([
                    getBestScoreForPuzzle(today, 'easy'),
                    getBestScoreForPuzzle(today, 'medium'),
                    getBestScoreForPuzzle(today, 'hard')
                ]);
                setBestScoresForDay({ easy: easyBest, medium: mediumBest, hard: hardBest });
                console.log("DataCacheContext: Best Scores fetched:", { easy: easyBest, medium: mediumBest, hard: hardBest });
            } catch (error: unknown) {
                console.warn("DataCacheContext: Error fetching best scores (non-critical):", error);
                // Best scores are non-critical, so we don't set an error state
            }
        };

        // 3. Fetch Personal Stats (for any authenticated user, including guests)
        const fetchPersonalStats = async () => {
            if (!currentUser) {
                console.log("DataCacheContext: Skipping user stats fetch (no user logged in).");
                setUserStats(null); // Ensure userStats is null if not fetched
                return;
            }
            try {
                console.log("DataCacheContext: Fetching Personal Stats...");
                const result = await getPersonalStatsCallable({
                    puzzleId: today,
                    difficulty: DifficultyLevel.Hard
                });
                if (result.data.success && result.data.stats) {
                    setUserStats(result.data.stats);
                    console.log("DataCacheContext: User Stats fetched successfully.");
                } else {
                    // If stats don't exist for user, backend returns success: true but no stats
                    if (result.data.success && !result.data.stats) {
                        console.log("DataCacheContext: No user stats found for user, using defaults.");
                        setUserStats({ ...defaultStats }); // Use default stats if none exist
                    } else {
                         throw new Error(result.data.error || 'Failed to fetch user stats');
                    }
                }
            } catch (error: unknown) {
                console.error("DataCacheContext: Error fetching user stats:", error);
                setErrorStates(prev => ({ ...prev, userStats: error instanceof Error ? error.message : 'Failed to load user stats' }));
            } finally {
                setLoadingStates(prev => ({ ...prev, userStats: false }));
            }
        };

        // 3.5. Fetch Win Modal Stats (for authenticated users only)
        const fetchWinModalStats = async () => {
            if (!currentUser) {
                console.log("DataCacheContext: Skipping win modal stats fetch (no user logged in).");
                setWinModalStats(null);
                return;
            }
            const emptyWinModalStats: WinModalStats = {
                totalAttempts: null,
                currentPuzzleCompletedStreak: null,
                currentTieBotStreak: null,
                currentFirstTryStreak: null,
                difficulty: settings.difficultyLevel,
            };
            try {
                console.log("DataCacheContext: Fetching Win Modal Stats...");
                const result = await getWinModalStatsCallable({
                    puzzleId: today,
                    difficulty: settings.difficultyLevel
                });
                if (result.data?.success && result.data?.stats) {
                    setWinModalStats({
                        totalAttempts: result.data.stats.totalAttempts ?? null,
                        currentPuzzleCompletedStreak: result.data.stats.currentPuzzleCompletedStreak ?? null,
                        currentTieBotStreak: result.data.stats.currentTieBotStreak ?? null,
                        currentFirstTryStreak: result.data.stats.currentFirstTryStreak ?? null,
                        difficulty: settings.difficultyLevel,
                    });
                    console.log("DataCacheContext: Win Modal Stats fetched successfully.");
                } else {
                    // If stats don't exist yet, use null values
                    console.log("DataCacheContext: No win modal stats found for user, using null values.");
                    setWinModalStats(emptyWinModalStats);
                }
            } catch (error: unknown) {
                console.error("DataCacheContext: Error fetching win modal stats:", error);
                setErrorStates(prev => ({ ...prev, winModalStats: error instanceof Error ? error.message : 'Failed to load win modal stats' }));
                setWinModalStats(emptyWinModalStats);
            } finally {
                setLoadingStates(prev => ({ ...prev, winModalStats: false }));
            }
        };

        // 4. Fetch Global Leaderboard V2 (Score - All Time)
        const fetchLeaderboard = async () => {
            try {
                console.log("DataCacheContext: Fetching Global Leaderboard V2 (Score - All Time)...");
                const result = await getGlobalLeaderboardV2Callable({
                    category: 'score',
                    subcategory: 'allTime'
                });
                if (result.data.success && result.data.leaderboard) {
                    setGlobalLeaderboard(result.data.leaderboard);
                    console.log("DataCacheContext: Global Leaderboard V2 fetched successfully.");
                } else {
                    throw new Error(result.data.error || 'Failed to fetch global leaderboard');
                }
            } catch (error: unknown) {
                console.error("DataCacheContext: Error fetching global leaderboard V2:", error);
                setErrorStates(prev => ({ ...prev, leaderboard: error instanceof Error ? error.message : 'Failed to load leaderboard' }));
            } finally {
                setLoadingStates(prev => ({ ...prev, leaderboard: false }));
            }
        };

        // --- Step 3: Execute all fetches in parallel ---
        await Promise.all([
            fetchDailyScoresV2(),
            fetchPuzzleDataV2(),
            fetchBestScores(),
            fetchPersonalStats(),
            fetchWinModalStats(),
            fetchLeaderboard(),
        ]);

        console.log("DataCacheContext: Initial data fetch sequence complete.");
        setIsInitialFetchDone(true);

    }, [isInitialFetchDone, settings.difficultyLevel]); // Include difficulty level in dependencies

    // Update best score for a specific difficulty (used after winning a game)
    const updateBestScoreForDay = useCallback((difficulty: 'easy' | 'medium' | 'hard', score: number) => {
        setBestScoresForDay(prev => {
            const currentBest = prev[difficulty];
            // Only update if the new score is better (lower) or if there's no current best
            if (currentBest === null || score < currentBest) {
                return { ...prev, [difficulty]: score };
            }
            return prev;
        });
    }, []);

    const value: DataCacheContextValue = {
        dailyScoresStats,
        dailyScoresV2Stats,
        puzzleData,
        puzzleDataV2,
        userStats,
        globalLeaderboard,
        winModalStats,
        bestScoresForDay,
        loadingStates,
        errorStates,
        fetchAndCacheData,
        isInitialFetchDone,
        updateBestScoreForDay,
    };

    return (
        <DataCacheContext.Provider value={value}>
            {children}
        </DataCacheContext.Provider>
    );
}; 