/**
 * Tests for the parallelized fetchAndCacheData function in DataCacheContext.
 *
 * These tests verify that:
 * - All 6 API calls run concurrently (not sequentially)
 * - Authenticated vs unauthenticated flows are handled correctly
 * - Individual fetch failures do not block other fetches (error isolation)
 * - isInitialFetchDone is set after all fetches complete
 * - Loading states are managed correctly
 * - Re-fetch is skipped if initial fetch is already done
 */

import React, { useEffect, useRef } from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { User } from 'firebase/auth';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Mock useSettings hook
vi.mock('../../hooks/useSettings', () => ({
    default: () => ({
        settings: {
            highContrastMode: false,
            colorBlindMode: 'none',
            customColorScheme: {},
            highlightLargestRegion: true,
            enableAnimations: true,
            enableSoundEffects: false,
            showLockedRegionCounter: true,
            difficultyLevel: 'easy',
        },
        updateSettings: vi.fn(),
    }),
}));

// Mock dateUtils
vi.mock('../../utils/dateUtils', () => ({
    dateKeyForToday: () => '2026-02-05',
}));

// Create mock functions that we can control per-test
const mockGetDailyScoresV2Stats = vi.fn();
const mockFetchPuzzleV2 = vi.fn();
const mockGetBestScoreForPuzzle = vi.fn();
const mockGetPersonalStats = vi.fn();
const mockGetWinModalStats = vi.fn();
const mockGetGlobalLeaderboardV2 = vi.fn();

vi.mock('../../services/firebaseService', () => ({
    getDailyScoresV2StatsCallable: (...args: any[]) => mockGetDailyScoresV2Stats(...args),
    fetchPuzzleV2Callable: (...args: any[]) => mockFetchPuzzleV2(...args),
    getBestScoreForPuzzle: (...args: any[]) => mockGetBestScoreForPuzzle(...args),
    getPersonalStatsCallable: (...args: any[]) => mockGetPersonalStats(...args),
    getWinModalStatsCallable: (...args: any[]) => mockGetWinModalStats(...args),
    getGlobalLeaderboardV2Callable: (...args: any[]) => mockGetGlobalLeaderboardV2(...args),
}));

// Import after mocks are set up
import { DataCacheProvider, useDataCache } from '../DataCacheContext';

// Suppress noisy console output from DataCacheContext during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal mock User object */
const mockUser = { uid: 'test-user-123' } as User;

/** Standard successful mock response factories */
function makeDailyScoresResponse() {
    return {
        data: {
            success: true,
            stats: {
                easy: { lowestScore: 5, totalPlayers: 10, playersWithLowestScore: 2, averageScore: 7 },
                medium: { lowestScore: 8, totalPlayers: 8, playersWithLowestScore: 1, averageScore: 10 },
                hard: { lowestScore: 12, totalPlayers: 5, playersWithLowestScore: 1, averageScore: 15 },
            },
        },
    };
}

function makePuzzleResponse() {
    return {
        data: {
            success: true,
            data: {
                easy: { algoScore: 5, targetColor: 'red', states: [], actions: [] },
                medium: { algoScore: 8, targetColor: 'blue', states: [], actions: [] },
                hard: { algoScore: 12, targetColor: 'green', states: [], actions: [] },
            },
        },
    };
}

function makePersonalStatsResponse() {
    return {
        data: {
            success: true,
            stats: {
                today: {
                    bestEloScore: 1200,
                    totalAttempts: 3,
                    fewestMoves: 5,
                    bestDifficultyEloScore: 1100,
                    attemptsToTieGoal: 1,
                    attemptsToBeatGoal: 2,
                },
                allTime: {
                    currentPuzzleStreak: 7,
                    currentGoalStreak: 5,
                    currentFirstTryStreak: 3,
                    gamesPlayed: 100,
                    puzzlesSolved: 90,
                    totalMoves: 500,
                },
                difficulty: 'hard',
            },
        },
    };
}

function makeWinModalStatsResponse() {
    return {
        data: {
            success: true,
            stats: {
                totalAttempts: 50,
                currentPuzzleCompletedStreak: 7,
                currentTieBotStreak: 5,
                currentFirstTryStreak: 3,
                difficulty: 'easy',
            },
        },
    };
}

function makeLeaderboardResponse() {
    return {
        data: {
            success: true,
            leaderboard: [
                { userId: 'u1', username: 'Alice', value: 100, rank: 1 },
                { userId: 'u2', username: 'Bob', value: 90, rank: 2 },
            ],
        },
    };
}

/** Configure all mocks to resolve successfully */
function setupAllMocksSuccess() {
    mockGetDailyScoresV2Stats.mockResolvedValue(makeDailyScoresResponse());
    mockFetchPuzzleV2.mockResolvedValue(makePuzzleResponse());
    mockGetBestScoreForPuzzle.mockResolvedValue(42);
    mockGetPersonalStats.mockResolvedValue(makePersonalStatsResponse());
    mockGetWinModalStats.mockResolvedValue(makeWinModalStatsResponse());
    mockGetGlobalLeaderboardV2.mockResolvedValue(makeLeaderboardResponse());
}

/**
 * Test consumer that auto-fetches on mount and exposes context values via
 * data attributes for assertion. This avoids module-level mutable state
 * which can cause test isolation problems.
 */
function AutoFetchConsumer({ user }: { user: User | null }) {
    const context = useDataCache();
    const hasFetched = useRef(false);

    useEffect(() => {
        if (!hasFetched.current) {
            hasFetched.current = true;
            context.fetchAndCacheData(user);
        }
    }, [context, user]);

    return (
        <div
            data-testid="consumer"
            data-initial-fetch-done={String(context.isInitialFetchDone)}
            data-loading-daily={String(context.loadingStates.dailyScores)}
            data-loading-puzzle={String(context.loadingStates.puzzle)}
            data-loading-userstats={String(context.loadingStates.userStats)}
            data-loading-leaderboard={String(context.loadingStates.leaderboard)}
            data-loading-winmodal={String(context.loadingStates.winModalStats)}
            data-error-daily={context.errorStates.dailyScores || ''}
            data-error-puzzle={context.errorStates.puzzle || ''}
            data-error-userstats={context.errorStates.userStats || ''}
            data-error-leaderboard={context.errorStates.leaderboard || ''}
            data-error-winmodal={context.errorStates.winModalStats || ''}
            data-has-daily-scores={String(context.dailyScoresV2Stats !== null)}
            data-has-puzzle={String(context.puzzleDataV2 !== null)}
            data-has-userstats={String(context.userStats !== null)}
            data-has-leaderboard={String(context.globalLeaderboard !== null)}
            data-has-winmodal={String(context.winModalStats !== null)}
            data-best-easy={String(context.bestScoresForDay.easy)}
            data-best-medium={String(context.bestScoresForDay.medium)}
            data-best-hard={String(context.bestScoresForDay.hard)}
        />
    );
}

/**
 * Test consumer with a manual fetch button for tests that need to
 * control timing or call fetch multiple times.
 */
function ManualFetchConsumer({ user }: { user: User | null }) {
    const context = useDataCache();

    return (
        <div
            data-testid="consumer"
            data-initial-fetch-done={String(context.isInitialFetchDone)}
            data-loading-daily={String(context.loadingStates.dailyScores)}
            data-loading-puzzle={String(context.loadingStates.puzzle)}
            data-loading-userstats={String(context.loadingStates.userStats)}
            data-loading-leaderboard={String(context.loadingStates.leaderboard)}
            data-loading-winmodal={String(context.loadingStates.winModalStats)}
            data-error-daily={context.errorStates.dailyScores || ''}
            data-error-puzzle={context.errorStates.puzzle || ''}
            data-error-userstats={context.errorStates.userStats || ''}
            data-error-leaderboard={context.errorStates.leaderboard || ''}
            data-error-winmodal={context.errorStates.winModalStats || ''}
            data-has-daily-scores={String(context.dailyScoresV2Stats !== null)}
            data-has-puzzle={String(context.puzzleDataV2 !== null)}
            data-has-userstats={String(context.userStats !== null)}
            data-has-leaderboard={String(context.globalLeaderboard !== null)}
            data-has-winmodal={String(context.winModalStats !== null)}
            data-best-easy={String(context.bestScoresForDay.easy)}
            data-best-medium={String(context.bestScoresForDay.medium)}
            data-best-hard={String(context.bestScoresForDay.hard)}
        >
            <button
                data-testid="fetch-btn"
                onClick={() => context.fetchAndCacheData(user)}
            >
                Fetch
            </button>
        </div>
    );
}

function renderAutoFetch(user: User | null) {
    return render(
        <DataCacheProvider>
            <AutoFetchConsumer user={user} />
        </DataCacheProvider>
    );
}

function renderManual(user: User | null) {
    return render(
        <DataCacheProvider>
            <ManualFetchConsumer user={user} />
        </DataCacheProvider>
    );
}

/** Wait for auto-fetch to complete */
async function waitForFetchComplete() {
    await waitFor(() => {
        expect(screen.getByTestId('consumer').getAttribute('data-initial-fetch-done')).toBe('true');
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks();
    setupAllMocksSuccess();
});

describe('DataCacheContext - fetchAndCacheData', () => {
    // -----------------------------------------------------------------------
    // 1. Parallel execution
    // -----------------------------------------------------------------------
    describe('parallel execution', () => {
        it('initiates all 6 API calls concurrently before any resolve', async () => {
            // Track call order. If calls were sequential, each would be invoked
            // only after the previous resolves. We use controlled promises to
            // verify all are called before any resolves.
            const callTimestamps: string[] = [];
            let resolveAll: () => void;
            const allCallsGate = new Promise<void>((r) => { resolveAll = r; });

            mockGetDailyScoresV2Stats.mockImplementation(async () => {
                callTimestamps.push('dailyScores');
                await allCallsGate;
                return makeDailyScoresResponse();
            });
            mockFetchPuzzleV2.mockImplementation(async () => {
                callTimestamps.push('puzzle');
                await allCallsGate;
                return makePuzzleResponse();
            });
            mockGetBestScoreForPuzzle.mockImplementation(async () => {
                callTimestamps.push('bestScores');
                await allCallsGate;
                return 42;
            });
            mockGetPersonalStats.mockImplementation(async () => {
                callTimestamps.push('personalStats');
                await allCallsGate;
                return makePersonalStatsResponse();
            });
            mockGetWinModalStats.mockImplementation(async () => {
                callTimestamps.push('winModalStats');
                await allCallsGate;
                return makeWinModalStatsResponse();
            });
            mockGetGlobalLeaderboardV2.mockImplementation(async () => {
                callTimestamps.push('leaderboard');
                await allCallsGate;
                return makeLeaderboardResponse();
            });

            // Render but don't await completion yet — the gate holds everything
            let rendered: ReturnType<typeof render>;
            await act(async () => {
                rendered = render(
                    <DataCacheProvider>
                        <AutoFetchConsumer user={mockUser} />
                    </DataCacheProvider>
                );
            });

            // Give microtasks a tick to allow all fetch wrappers to be called
            await act(async () => {
                await new Promise((r) => setTimeout(r, 50));
            });

            // All calls should have been initiated before any resolved
            expect(callTimestamps).toContain('dailyScores');
            expect(callTimestamps).toContain('puzzle');
            expect(callTimestamps).toContain('bestScores');
            expect(callTimestamps).toContain('personalStats');
            expect(callTimestamps).toContain('winModalStats');
            expect(callTimestamps).toContain('leaderboard');

            // The counts confirm all were called
            expect(mockGetDailyScoresV2Stats).toHaveBeenCalledTimes(1);
            expect(mockFetchPuzzleV2).toHaveBeenCalledTimes(1);
            expect(mockGetBestScoreForPuzzle).toHaveBeenCalledTimes(3); // easy, medium, hard
            expect(mockGetPersonalStats).toHaveBeenCalledTimes(1);
            expect(mockGetWinModalStats).toHaveBeenCalledTimes(1);
            expect(mockGetGlobalLeaderboardV2).toHaveBeenCalledTimes(1);

            // isInitialFetchDone should still be false since nothing resolved
            expect(
                rendered!.getByTestId('consumer').getAttribute('data-initial-fetch-done')
            ).toBe('false');

            // Now release the gate and let everything resolve
            await act(async () => {
                resolveAll!();
                await new Promise((r) => setTimeout(r, 50));
            });

            await waitFor(() => {
                expect(
                    rendered!.getByTestId('consumer').getAttribute('data-initial-fetch-done')
                ).toBe('true');
            });
        });
    });

    // -----------------------------------------------------------------------
    // 2. Authenticated user flow
    // -----------------------------------------------------------------------
    describe('authenticated user flow', () => {
        it('fires all 6 fetch categories and populates state', async () => {
            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');

            // All callables invoked
            expect(mockGetDailyScoresV2Stats).toHaveBeenCalledTimes(1);
            expect(mockFetchPuzzleV2).toHaveBeenCalledTimes(1);
            expect(mockGetBestScoreForPuzzle).toHaveBeenCalledTimes(3);
            expect(mockGetPersonalStats).toHaveBeenCalledTimes(1);
            expect(mockGetWinModalStats).toHaveBeenCalledTimes(1);
            expect(mockGetGlobalLeaderboardV2).toHaveBeenCalledTimes(1);

            // Verify correct arguments
            expect(mockGetDailyScoresV2Stats).toHaveBeenCalledWith({ puzzleId: '2026-02-05' });
            expect(mockFetchPuzzleV2).toHaveBeenCalledWith({ date: '2026-02-05' });
            expect(mockGetBestScoreForPuzzle).toHaveBeenCalledWith('2026-02-05', 'easy');
            expect(mockGetBestScoreForPuzzle).toHaveBeenCalledWith('2026-02-05', 'medium');
            expect(mockGetBestScoreForPuzzle).toHaveBeenCalledWith('2026-02-05', 'hard');
            expect(mockGetPersonalStats).toHaveBeenCalledWith({
                puzzleId: '2026-02-05',
                difficulty: 'hard', // Hardcoded DifficultyLevel.Hard in implementation
            });
            expect(mockGetWinModalStats).toHaveBeenCalledWith({
                puzzleId: '2026-02-05',
                difficulty: 'easy', // from mocked settings.difficultyLevel
            });
            expect(mockGetGlobalLeaderboardV2).toHaveBeenCalledWith({
                category: 'score',
                subcategory: 'allTime',
            });

            // State should be populated
            expect(el.getAttribute('data-has-daily-scores')).toBe('true');
            expect(el.getAttribute('data-has-puzzle')).toBe('true');
            expect(el.getAttribute('data-has-userstats')).toBe('true');
            expect(el.getAttribute('data-has-leaderboard')).toBe('true');
            expect(el.getAttribute('data-has-winmodal')).toBe('true');
            expect(el.getAttribute('data-best-easy')).toBe('42');
            expect(el.getAttribute('data-best-medium')).toBe('42');
            expect(el.getAttribute('data-best-hard')).toBe('42');
            expect(el.getAttribute('data-initial-fetch-done')).toBe('true');
        });
    });

    // -----------------------------------------------------------------------
    // 3. Unauthenticated user flow
    // -----------------------------------------------------------------------
    describe('unauthenticated user flow', () => {
        it('fires only 4 public fetches and skips auth-gated calls', async () => {
            renderAutoFetch(null);
            await waitForFetchComplete();

            // Public calls fire
            expect(mockGetDailyScoresV2Stats).toHaveBeenCalledTimes(1);
            expect(mockFetchPuzzleV2).toHaveBeenCalledTimes(1);
            expect(mockGetBestScoreForPuzzle).toHaveBeenCalledTimes(3);
            expect(mockGetGlobalLeaderboardV2).toHaveBeenCalledTimes(1);

            // Auth-gated calls should NOT fire
            expect(mockGetPersonalStats).not.toHaveBeenCalled();
            expect(mockGetWinModalStats).not.toHaveBeenCalled();
        });

        it('sets userStats and winModalStats to null when no user', async () => {
            renderAutoFetch(null);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            expect(el.getAttribute('data-has-userstats')).toBe('false');
            expect(el.getAttribute('data-has-winmodal')).toBe('false');
            expect(el.getAttribute('data-initial-fetch-done')).toBe('true');
        });

        it('does not set loading states for auth-gated resources when unauthenticated', async () => {
            // Slow down a public fetch so we can capture loading states mid-flight
            let resolveDaily: () => void;
            mockGetDailyScoresV2Stats.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        resolveDaily = () => resolve(makeDailyScoresResponse());
                    })
            );

            await act(async () => {
                render(
                    <DataCacheProvider>
                        <ManualFetchConsumer user={null} />
                    </DataCacheProvider>
                );
            });

            // Trigger fetch
            await act(async () => {
                screen.getByTestId('fetch-btn').click();
                await new Promise((r) => setTimeout(r, 10));
            });

            const el = screen.getByTestId('consumer');
            // userStats and winModalStats loading should NOT be set to true for unauth
            expect(el.getAttribute('data-loading-userstats')).toBe('false');
            expect(el.getAttribute('data-loading-winmodal')).toBe('false');
            // Public loading should be true (dailyScores is still pending)
            expect(el.getAttribute('data-loading-daily')).toBe('true');

            // Clean up: resolve the pending promise
            await act(async () => {
                resolveDaily!();
                await new Promise((r) => setTimeout(r, 10));
            });
        });
    });

    // -----------------------------------------------------------------------
    // 4. Error isolation
    // -----------------------------------------------------------------------
    describe('error isolation', () => {
        it('when dailyScores fails, other fetches still succeed', async () => {
            mockGetDailyScoresV2Stats.mockRejectedValue(new Error('Network error'));

            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            expect(el.getAttribute('data-error-daily')).toBe('Network error');
            expect(el.getAttribute('data-has-daily-scores')).toBe('false');

            // Other data populated normally
            expect(el.getAttribute('data-has-puzzle')).toBe('true');
            expect(el.getAttribute('data-has-userstats')).toBe('true');
            expect(el.getAttribute('data-has-leaderboard')).toBe('true');
            expect(el.getAttribute('data-has-winmodal')).toBe('true');
            expect(el.getAttribute('data-initial-fetch-done')).toBe('true');
        });

        it('when puzzle fetch fails, other fetches still succeed', async () => {
            mockFetchPuzzleV2.mockRejectedValue(new Error('Puzzle unavailable'));

            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            expect(el.getAttribute('data-error-puzzle')).toBe('Puzzle unavailable');
            expect(el.getAttribute('data-has-puzzle')).toBe('false');

            expect(el.getAttribute('data-has-daily-scores')).toBe('true');
            expect(el.getAttribute('data-has-userstats')).toBe('true');
            expect(el.getAttribute('data-has-leaderboard')).toBe('true');
        });

        it('when personalStats fails, other fetches still succeed', async () => {
            mockGetPersonalStats.mockRejectedValue(new Error('Auth expired'));

            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            expect(el.getAttribute('data-error-userstats')).toBe('Auth expired');

            expect(el.getAttribute('data-has-daily-scores')).toBe('true');
            expect(el.getAttribute('data-has-puzzle')).toBe('true');
            expect(el.getAttribute('data-has-leaderboard')).toBe('true');
            expect(el.getAttribute('data-has-winmodal')).toBe('true');
        });

        it('when winModalStats fails, error state is set and null stats are provided', async () => {
            mockGetWinModalStats.mockRejectedValue(new Error('Win stats failed'));

            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            expect(el.getAttribute('data-error-winmodal')).toBe('Win stats failed');
            // Implementation sets a null-values winModalStats object on error, so it is not null
            expect(el.getAttribute('data-has-winmodal')).toBe('true');

            // Others still succeed
            expect(el.getAttribute('data-has-daily-scores')).toBe('true');
            expect(el.getAttribute('data-has-puzzle')).toBe('true');
        });

        it('when leaderboard fails, other fetches still succeed', async () => {
            mockGetGlobalLeaderboardV2.mockRejectedValue(new Error('Leaderboard down'));

            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            expect(el.getAttribute('data-error-leaderboard')).toBe('Leaderboard down');
            expect(el.getAttribute('data-has-leaderboard')).toBe('false');

            expect(el.getAttribute('data-has-daily-scores')).toBe('true');
            expect(el.getAttribute('data-has-puzzle')).toBe('true');
            expect(el.getAttribute('data-has-userstats')).toBe('true');
        });

        it('when bestScores fails, it is silently handled (non-critical)', async () => {
            mockGetBestScoreForPuzzle.mockRejectedValue(new Error('Firestore read failed'));

            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            // bestScores has no dedicated error state — defaults remain
            expect(el.getAttribute('data-best-easy')).toBe('null');
            expect(el.getAttribute('data-best-medium')).toBe('null');
            expect(el.getAttribute('data-best-hard')).toBe('null');

            // Others succeed
            expect(el.getAttribute('data-has-daily-scores')).toBe('true');
            expect(el.getAttribute('data-has-puzzle')).toBe('true');
            expect(el.getAttribute('data-initial-fetch-done')).toBe('true');
        });

        it('when ALL fetches fail, isInitialFetchDone is still set to true', async () => {
            mockGetDailyScoresV2Stats.mockRejectedValue(new Error('fail'));
            mockFetchPuzzleV2.mockRejectedValue(new Error('fail'));
            mockGetBestScoreForPuzzle.mockRejectedValue(new Error('fail'));
            mockGetPersonalStats.mockRejectedValue(new Error('fail'));
            mockGetWinModalStats.mockRejectedValue(new Error('fail'));
            mockGetGlobalLeaderboardV2.mockRejectedValue(new Error('fail'));

            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            expect(el.getAttribute('data-initial-fetch-done')).toBe('true');
            expect(el.getAttribute('data-error-daily')).toBe('fail');
            expect(el.getAttribute('data-error-puzzle')).toBe('fail');
            expect(el.getAttribute('data-error-userstats')).toBe('fail');
            expect(el.getAttribute('data-error-leaderboard')).toBe('fail');
            expect(el.getAttribute('data-error-winmodal')).toBe('fail');
        });
    });

    // -----------------------------------------------------------------------
    // 5. isInitialFetchDone
    // -----------------------------------------------------------------------
    describe('isInitialFetchDone', () => {
        it('is false before fetchAndCacheData is called', async () => {
            await act(async () => {
                render(
                    <DataCacheProvider>
                        <ManualFetchConsumer user={mockUser} />
                    </DataCacheProvider>
                );
            });

            expect(
                screen.getByTestId('consumer').getAttribute('data-initial-fetch-done')
            ).toBe('false');
        });

        it('is true after fetchAndCacheData completes', async () => {
            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            expect(
                screen.getByTestId('consumer').getAttribute('data-initial-fetch-done')
            ).toBe('true');
        });

        it('is not set to true until ALL promises resolve', async () => {
            let resolveLeaderboard: () => void;
            mockGetGlobalLeaderboardV2.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        resolveLeaderboard = () => resolve(makeLeaderboardResponse());
                    })
            );

            await act(async () => {
                render(
                    <DataCacheProvider>
                        <AutoFetchConsumer user={mockUser} />
                    </DataCacheProvider>
                );
            });

            // Wait for fast mocks to settle
            await act(async () => {
                await new Promise((r) => setTimeout(r, 50));
            });

            // isInitialFetchDone should still be false — leaderboard is pending
            expect(
                screen.getByTestId('consumer').getAttribute('data-initial-fetch-done')
            ).toBe('false');

            // Resolve leaderboard
            await act(async () => {
                resolveLeaderboard!();
                await new Promise((r) => setTimeout(r, 50));
            });

            await waitFor(() => {
                expect(
                    screen.getByTestId('consumer').getAttribute('data-initial-fetch-done')
                ).toBe('true');
            });
        });
    });

    // -----------------------------------------------------------------------
    // 6. Loading states
    // -----------------------------------------------------------------------
    describe('loading states', () => {
        it('sets loading states to true upfront for authenticated user', async () => {
            // Hold ALL mocks so none resolve, ensuring loading states stay true
            let resolveAll: () => void;
            const gate = new Promise<void>((r) => { resolveAll = r; });

            mockGetDailyScoresV2Stats.mockImplementation(async () => { await gate; return makeDailyScoresResponse(); });
            mockFetchPuzzleV2.mockImplementation(async () => { await gate; return makePuzzleResponse(); });
            mockGetBestScoreForPuzzle.mockImplementation(async () => { await gate; return 42; });
            mockGetPersonalStats.mockImplementation(async () => { await gate; return makePersonalStatsResponse(); });
            mockGetWinModalStats.mockImplementation(async () => { await gate; return makeWinModalStatsResponse(); });
            mockGetGlobalLeaderboardV2.mockImplementation(async () => { await gate; return makeLeaderboardResponse(); });

            await act(async () => {
                render(
                    <DataCacheProvider>
                        <ManualFetchConsumer user={mockUser} />
                    </DataCacheProvider>
                );
            });

            // Trigger fetch
            await act(async () => {
                screen.getByTestId('fetch-btn').click();
                await new Promise((r) => setTimeout(r, 10));
            });

            // Check loading states mid-flight — all should be true
            const el = screen.getByTestId('consumer');
            expect(el.getAttribute('data-loading-daily')).toBe('true');
            expect(el.getAttribute('data-loading-puzzle')).toBe('true');
            expect(el.getAttribute('data-loading-userstats')).toBe('true');
            expect(el.getAttribute('data-loading-leaderboard')).toBe('true');
            expect(el.getAttribute('data-loading-winmodal')).toBe('true');

            // Clean up: release gate so all promises resolve
            await act(async () => {
                resolveAll!();
                await new Promise((r) => setTimeout(r, 50));
            });
        });

        it('all loading states are false after fetch completes', async () => {
            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            expect(el.getAttribute('data-loading-daily')).toBe('false');
            expect(el.getAttribute('data-loading-puzzle')).toBe('false');
            expect(el.getAttribute('data-loading-leaderboard')).toBe('false');
            expect(el.getAttribute('data-loading-userstats')).toBe('false');
            expect(el.getAttribute('data-loading-winmodal')).toBe('false');
        });

        it('loading state is set to false even when individual fetch fails', async () => {
            mockGetDailyScoresV2Stats.mockRejectedValue(new Error('fail'));
            mockGetPersonalStats.mockRejectedValue(new Error('fail'));

            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            // Failed fetches should still have loading = false (from finally blocks)
            expect(el.getAttribute('data-loading-daily')).toBe('false');
            expect(el.getAttribute('data-loading-userstats')).toBe('false');
            // Successful fetches too
            expect(el.getAttribute('data-loading-puzzle')).toBe('false');
            expect(el.getAttribute('data-loading-leaderboard')).toBe('false');
        });
    });

    // -----------------------------------------------------------------------
    // 7. Skip re-fetch
    // -----------------------------------------------------------------------
    describe('skip re-fetch', () => {
        it('returns early without making API calls if isInitialFetchDone is already true', async () => {
            await act(async () => {
                render(
                    <DataCacheProvider>
                        <ManualFetchConsumer user={mockUser} />
                    </DataCacheProvider>
                );
            });

            // First fetch
            await act(async () => {
                screen.getByTestId('fetch-btn').click();
            });

            await waitFor(() => {
                expect(
                    screen.getByTestId('consumer').getAttribute('data-initial-fetch-done')
                ).toBe('true');
            });

            expect(mockGetDailyScoresV2Stats).toHaveBeenCalledTimes(1);
            expect(mockFetchPuzzleV2).toHaveBeenCalledTimes(1);

            // Clear mocks and set up again
            vi.clearAllMocks();
            setupAllMocksSuccess();

            // Second fetch should be a no-op
            await act(async () => {
                screen.getByTestId('fetch-btn').click();
            });

            // Wait a tick to ensure the function had a chance to execute
            await act(async () => {
                await new Promise((r) => setTimeout(r, 10));
            });

            expect(mockGetDailyScoresV2Stats).not.toHaveBeenCalled();
            expect(mockFetchPuzzleV2).not.toHaveBeenCalled();
            expect(mockGetBestScoreForPuzzle).not.toHaveBeenCalled();
            expect(mockGetPersonalStats).not.toHaveBeenCalled();
            expect(mockGetWinModalStats).not.toHaveBeenCalled();
            expect(mockGetGlobalLeaderboardV2).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // 8. Response handling edge cases
    // -----------------------------------------------------------------------
    describe('response handling edge cases', () => {
        it('handles unsuccessful dailyScores response (success=false)', async () => {
            mockGetDailyScoresV2Stats.mockResolvedValue({
                data: { success: false, error: 'Server error' },
            });

            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            expect(el.getAttribute('data-error-daily')).toBe('Server error');
            expect(el.getAttribute('data-has-daily-scores')).toBe('false');
        });

        it('handles unsuccessful puzzle response (success=false)', async () => {
            mockFetchPuzzleV2.mockResolvedValue({
                data: { success: false, error: 'No puzzle for today' },
            });

            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            expect(el.getAttribute('data-error-puzzle')).toBe('No puzzle for today');
            expect(el.getAttribute('data-has-puzzle')).toBe('false');
        });

        it('handles personalStats with no stats (new user defaults)', async () => {
            mockGetPersonalStats.mockResolvedValue({
                data: { success: true }, // success but no stats
            });

            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            // Should set default stats for new user (userStats will be non-null)
            expect(el.getAttribute('data-has-userstats')).toBe('true');
            expect(el.getAttribute('data-error-userstats')).toBe('');
        });

        it('handles winModalStats with no stats (new user)', async () => {
            mockGetWinModalStats.mockResolvedValue({
                data: { success: true }, // success but no stats
            });

            renderAutoFetch(mockUser);
            await waitForFetchComplete();

            const el = screen.getByTestId('consumer');
            // Should set null-value stats object
            expect(el.getAttribute('data-has-winmodal')).toBe('true');
            expect(el.getAttribute('data-error-winmodal')).toBe('');
        });
    });

    // -----------------------------------------------------------------------
    // 9. useDataCache hook error
    // -----------------------------------------------------------------------
    describe('useDataCache hook', () => {
        it('throws when used outside DataCacheProvider', () => {
            function BadConsumer() {
                useDataCache();
                return <div />;
            }

            // In React 19, render errors don't propagate synchronously.
            // We need to use an error boundary or check for the error message.
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

            // React 19 uses createRoot under the hood in @testing-library/react v16
            // and errors are handled differently. We test this by verifying
            // the component does not render successfully.
            expect(() => {
                render(<BadConsumer />);
            }).toThrow();

            spy.mockRestore();
        });
    });
});
