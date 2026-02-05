/**
 * Tests for the leaderboard snapshot system bug fixes:
 *   Bug 1: Collection name mismatch (leaderboardSnapshots -> leaderboards)
 *   Bug 2: userRanks map for full rank coverage (not just top 100)
 *   Bug 3: totalEntries count before slice (not capped at 100)
 *   Bug 4: ELO score recomputation from eloScoreByDay
 */

// ─── Firebase Admin Mock ────────────────────────────────────────────────────

// Track which collection names are accessed (Bug 1 verification)
const collectionAccesses: string[] = [];
const batchSetCalls: Array<{ ref: any; data: any }> = [];

// Configurable mock data
let mockSnapshotDoc: { exists: boolean; data: () => any } = { exists: false, data: () => null };
let mockCollectionGroupDocs: any[] = [];
let mockPointReadDoc: { exists: boolean; data: () => any } = { exists: false, data: () => ({}) };
let mockGetUserResult: any = { displayName: 'TestUser' };

const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockBatchSet = jest.fn((ref: any, data: any) => {
    batchSetCalls.push({ ref, data });
});

const mockDocRef = (id: string) => ({
    id,
    get: jest.fn().mockImplementation(() => {
        return Promise.resolve(mockPointReadDoc);
    }),
    parent: {
        parent: { id },
    },
});

const mockCollectionDoc = jest.fn((docId: string) => ({
    get: jest.fn().mockImplementation(() => {
        return Promise.resolve(mockSnapshotDoc);
    }),
    id: docId,
}));

const mockCollection = jest.fn((name: string) => {
    collectionAccesses.push(name);
    return {
        doc: mockCollectionDoc,
    };
});

const mockDocPath = jest.fn((path: string) => ({
    get: jest.fn().mockImplementation(() => {
        return Promise.resolve(mockPointReadDoc);
    }),
}));

const mockCollectionGroup = jest.fn(() => ({
    get: jest.fn().mockImplementation(() => {
        return Promise.resolve({
            size: mockCollectionGroupDocs.length,
            forEach: (cb: any) => mockCollectionGroupDocs.forEach(cb),
        });
    }),
}));

jest.mock('firebase-admin', () => {
    const actualAdmin = jest.requireActual('firebase-admin');
    return {
        ...actualAdmin,
        initializeApp: jest.fn(),
        firestore: Object.assign(
            jest.fn(() => ({
                collection: mockCollection,
                collectionGroup: mockCollectionGroup,
                doc: mockDocPath,
                batch: jest.fn(() => ({
                    set: mockBatchSet,
                    commit: mockBatchCommit,
                })),
            })),
            {
                FieldValue: {
                    serverTimestamp: jest.fn(() => 'MOCK_TIMESTAMP'),
                    increment: jest.fn((n: number) => n),
                    arrayUnion: jest.fn((...args: any[]) => args),
                    delete: jest.fn(),
                },
                Timestamp: {
                    now: jest.fn(() => ({ seconds: Date.now() / 1000, nanoseconds: 0 })),
                    fromDate: jest.fn((d: Date) => ({ seconds: d.getTime() / 1000, nanoseconds: 0, toDate: () => d })),
                },
            }
        ),
        auth: jest.fn(() => ({
            getUsers: jest.fn().mockImplementation((identifiers: any[]) => {
                return Promise.resolve({
                    users: identifiers.map((id: any) => ({
                        uid: id.uid,
                        displayName: `User_${id.uid}`,
                    })),
                    notFound: [],
                });
            }),
            getUser: jest.fn().mockImplementation((uid: string) => {
                return Promise.resolve(mockGetUserResult || { displayName: `User_${uid}` });
            }),
        })),
    };
});

// ─── Firebase Functions Mocks ───────────────────────────────────────────────

jest.mock('firebase-functions/v2', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

jest.mock('firebase-functions/v2/https', () => ({
    onCall: jest.fn((configOrHandler: any, handler?: any) => {
        const fn = handler || configOrHandler;
        return { run: (req: any) => fn(req) };
    }),
    HttpsError: class HttpsError extends Error {
        code: string;
        constructor(code: string, message: string) {
            super(message);
            this.code = code;
            this.name = 'HttpsError';
        }
    },
}));

jest.mock('firebase-functions/v2/scheduler', () => ({
    onSchedule: jest.fn((configOrHandler: any, handler?: any) => {
        const fn = handler || configOrHandler;
        return { run: (event: any) => fn(event) };
    }),
}));

jest.mock('firebase-functions/v2/firestore', () => ({
    onDocumentWritten: jest.fn(() => jest.fn()),
}));

// ─── Import after mocking ──────────────────────────────────────────────────

import { getGlobalLeaderboardV2, precomputeLeaderboards } from '../index';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a mock Firestore document for the collectionGroup scan */
function makeMockLeaderboardDoc(
    userId: string,
    docId: string,
    data: Record<string, unknown>
) {
    return {
        id: docId,
        ref: {
            parent: {
                parent: { id: userId },
            },
        },
        data: () => data,
    };
}

/**
 * Format a date as YYYY-MM-DD in UTC.
 */
function formatDateUTC(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ─── Test Suites ────────────────────────────────────────────────────────────

describe('Leaderboard Snapshot Bug Fixes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        collectionAccesses.length = 0;
        batchSetCalls.length = 0;
        mockSnapshotDoc = { exists: false, data: () => null };
        mockCollectionGroupDocs = [];
        mockPointReadDoc = { exists: false, data: () => ({}) };
        mockGetUserResult = { displayName: 'TestUser' };
    });

    // ═══════════════════════════════════════════════════════════════════════
    // computeEloAggregates — tested indirectly through precomputeLeaderboards
    // ═══════════════════════════════════════════════════════════════════════

    describe('computeEloAggregates (tested via precomputeLeaderboards)', () => {
        // Helper: run precomputeLeaderboards with a single user having an eloScoreByDay map,
        // then inspect batchSetCalls to see what value was written for score_allTime, score_last30, score_last7
        async function runWithEloMap(eloScoreByDay: Record<string, unknown>) {
            mockCollectionGroupDocs = [
                makeMockLeaderboardDoc('user-elo', 'levelAgnostic', {
                    eloScoreByDay,
                    eloScoreAllTime: 9999, // stale stored value that should NOT be used
                    eloScoreLast30: 9999,
                    eloScoreLast7: 9999,
                }),
            ];

            await (precomputeLeaderboards as any).run({});

            // Extract the entries written for each score config
            const results: Record<string, number | undefined> = {};
            for (const call of batchSetCalls) {
                const key = call.ref?.id || '';
                if (key === 'score_allTime' || key === 'score_last30' || key === 'score_last7') {
                    const entries = call.data?.entries || [];
                    results[key] = entries.length > 0 ? entries[0].value : undefined;
                }
            }
            return results;
        }

        it('correctly sums all-time scores', async () => {
            const today = new Date();
            const day1 = formatDateUTC(today);
            const oldDay = '2020-01-01';

            const result = await runWithEloMap({
                [day1]: 100,
                [oldDay]: 200,
            });

            expect(result['score_allTime']).toBe(300);
        });

        it('correctly filters last 7 days', async () => {
            const today = new Date();
            const todayStr = formatDateUTC(today);

            // 6 days ago = included in last7
            const sixDaysAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 6));
            const sixDaysAgoStr = formatDateUTC(sixDaysAgo);

            // 8 days ago = NOT in last7
            const eightDaysAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 8));
            const eightDaysAgoStr = formatDateUTC(eightDaysAgo);

            const result = await runWithEloMap({
                [todayStr]: 50,
                [sixDaysAgoStr]: 30,
                [eightDaysAgoStr]: 200,
            });

            // last7 = today (50) + 6 days ago (30) = 80
            expect(result['score_last7']).toBe(80);
        });

        it('correctly filters last 30 days', async () => {
            const today = new Date();
            const todayStr = formatDateUTC(today);

            // 29 days ago = included in last30
            const twentyNineDaysAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29));
            const twentyNineDaysAgoStr = formatDateUTC(twentyNineDaysAgo);

            // 31 days ago = NOT in last30
            const thirtyOneDaysAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 31));
            const thirtyOneDaysAgoStr = formatDateUTC(thirtyOneDaysAgo);

            const result = await runWithEloMap({
                [todayStr]: 10,
                [twentyNineDaysAgoStr]: 20,
                [thirtyOneDaysAgoStr]: 500,
            });

            // last30 = today (10) + 29 days ago (20) = 30
            expect(result['score_last30']).toBe(30);
            // allTime = 10 + 20 + 500 = 530
            expect(result['score_allTime']).toBe(530);
        });

        it('handles empty map', async () => {
            const result = await runWithEloMap({});

            // No entries means value=0, which is filtered out (value === 0 => skip)
            expect(result['score_allTime']).toBeUndefined();
            expect(result['score_last7']).toBeUndefined();
            expect(result['score_last30']).toBeUndefined();
        });

        it('handles malformed date strings (still counts in allTime)', async () => {
            const result = await runWithEloMap({
                'not-a-date': 100,
                'abc': 50,
                '2020-13-45': 25, // invalid month/day but has 3 parts
            });

            // All numeric values are summed into allTime regardless of date parsing
            // 'not-a-date' splits to 3 parts but parsing fails for date filter; allTime still counts
            // 'abc' splits to 1 part so date filtering is skipped; allTime still counts
            // The allTime total is 100 + 50 + 25 = 175
            expect(result['score_allTime']).toBe(175);
        });

        it('handles NaN and non-number values (skips them entirely)', async () => {
            const result = await runWithEloMap({
                '2025-01-01': NaN,
                '2025-01-02': 'hello' as any,
                '2025-01-03': null as any,
                '2025-01-04': undefined as any,
                '2025-01-05': 42,
            });

            // Only the numeric non-NaN value (42) is counted
            expect(result['score_allTime']).toBe(42);
        });

        it('boundary: score exactly 7 days ago IS included (>= start7)', async () => {
            const today = new Date();
            // start7 = today - 6 days, so "exactly 6 days ago" is the boundary
            const sixDaysAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 6));
            const sixDaysAgoStr = formatDateUTC(sixDaysAgo);

            const result = await runWithEloMap({
                [sixDaysAgoStr]: 77,
            });

            expect(result['score_last7']).toBe(77);
        });

        it('boundary: score 7 days ago (7 days back) is NOT in last7 but IS in last30', async () => {
            const today = new Date();
            // 7 days back (> 6 days back boundary)
            const sevenDaysAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 7));
            const sevenDaysAgoStr = formatDateUTC(sevenDaysAgo);

            const result = await runWithEloMap({
                [sevenDaysAgoStr]: 55,
            });

            // Not in last7 (>= start7 means >= today-6, but this is today-7)
            expect(result['score_last7']).toBeUndefined();
            // But IS in last30 (>= today-29)
            expect(result['score_last30']).toBe(55);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // getGlobalLeaderboardV2 — snapshot read path
    // ═══════════════════════════════════════════════════════════════════════

    describe('getGlobalLeaderboardV2 (snapshot read path)', () => {
        /** Build a snapshot document with the given entries and userRanks */
        function setSnapshotDoc(
            entries: Array<{ userId: string; username: string; value: number; currentValue?: number }>,
            userRanks: Record<string, number> = {},
            totalEntries?: number
        ) {
            mockSnapshotDoc = {
                exists: true,
                data: () => ({
                    entries,
                    userRanks,
                    totalEntries: totalEntries ?? entries.length,
                    updatedAt: 'MOCK_TIMESTAMP',
                }),
            };
        }

        it('reads from "leaderboards" collection, not "leaderboardSnapshots" (Bug 1)', async () => {
            setSnapshotDoc([
                { userId: 'u1', username: 'Alice', value: 100 },
            ]);

            await (getGlobalLeaderboardV2 as any).run({
                data: { category: 'score', subcategory: 'allTime' },
                auth: { uid: 'u1' },
                app: undefined,
            });

            // Verify the collection name used is "leaderboards"
            expect(collectionAccesses).toContain('leaderboards');
            expect(collectionAccesses).not.toContain('leaderboardSnapshots');
        });

        it('returns top 10 entries with correct rank ordering', async () => {
            const entries = Array.from({ length: 15 }, (_, i) => ({
                userId: `user-${i + 1}`,
                username: `Player${i + 1}`,
                value: 1500 - i * 100,
            }));
            setSnapshotDoc(entries);

            const result = await (getGlobalLeaderboardV2 as any).run({
                data: { category: 'score', subcategory: 'allTime' },
                auth: { uid: 'guest-user' },
                app: undefined,
            });

            expect(result.success).toBe(true);
            expect(result.leaderboard).toHaveLength(10);
            expect(result.leaderboard[0].rank).toBe(1);
            expect(result.leaderboard[0].value).toBe(1500);
            expect(result.leaderboard[9].rank).toBe(10);
            expect(result.leaderboard[9].value).toBe(600);
        });

        it('handles requester in top 10 (no separate requesterEntry needed)', async () => {
            setSnapshotDoc([
                { userId: 'u1', username: 'Alice', value: 500 },
                { userId: 'requester-abc', username: 'Bob', value: 400 },
                { userId: 'u3', username: 'Carol', value: 300 },
            ]);

            const result = await (getGlobalLeaderboardV2 as any).run({
                data: { category: 'score', subcategory: 'allTime' },
                auth: { uid: 'requester-abc' },
                app: undefined,
            });

            expect(result.success).toBe(true);
            // Requester is in the top 10 so requesterEntry should be undefined
            expect(result.requesterEntry).toBeUndefined();
            // Verify the requester appears in the main leaderboard
            const requesterInBoard = result.leaderboard.find((e: any) => e.userId === 'requester-abc');
            expect(requesterInBoard).toBeDefined();
            expect(requesterInBoard.rank).toBe(2);
        });

        it('handles requester in top 100 but outside top 10 (found in snapshot entries)', async () => {
            // Build 12 entries; requester is at index 10 (rank 11)
            const entries = Array.from({ length: 12 }, (_, i) => ({
                userId: i === 10 ? 'requester-xyz' : `user-${i + 1}`,
                username: i === 10 ? 'ReqUser' : `Player${i + 1}`,
                value: 1200 - i * 100,
            }));
            setSnapshotDoc(entries);

            const result = await (getGlobalLeaderboardV2 as any).run({
                data: { category: 'score', subcategory: 'allTime' },
                auth: { uid: 'requester-xyz' },
                app: undefined,
            });

            expect(result.success).toBe(true);
            expect(result.leaderboard).toHaveLength(10);
            // Requester is outside top 10 but in entries
            expect(result.requesterEntry).toBeDefined();
            expect(result.requesterEntry.userId).toBe('requester-xyz');
            expect(result.requesterEntry.rank).toBe(11);
            expect(result.requesterEntry.value).toBe(200);
        });

        it('handles requester in userRanks but outside top 100 (triggers point read) (Bug 2)', async () => {
            // Only 3 entries in the snapshot, but requester is rank 150 in userRanks
            setSnapshotDoc(
                [
                    { userId: 'u1', username: 'Alice', value: 500 },
                    { userId: 'u2', username: 'Bob', value: 400 },
                    { userId: 'u3', username: 'Carol', value: 300 },
                ],
                { 'u1': 1, 'u2': 2, 'u3': 3, 'requester-far': 150 }
            );

            // Set up the point read for the requester's leaderboard doc
            mockPointReadDoc = {
                exists: true,
                data: () => ({
                    eloScoreAllTime: 42,
                    eloScoreLast7: 10,
                    eloScoreLast30: 25,
                }),
            };
            mockGetUserResult = { displayName: 'FarAwayUser' };

            const result = await (getGlobalLeaderboardV2 as any).run({
                data: { category: 'score', subcategory: 'allTime' },
                auth: { uid: 'requester-far' },
                app: undefined,
            });

            expect(result.success).toBe(true);
            expect(result.requesterEntry).toBeDefined();
            expect(result.requesterEntry.userId).toBe('requester-far');
            expect(result.requesterEntry.rank).toBe(150);
            expect(result.requesterEntry.value).toBe(42);
            expect(result.requesterEntry.username).toBe('FarAwayUser');
        });

        it('handles requester not in userRanks (no requesterEntry)', async () => {
            setSnapshotDoc(
                [
                    { userId: 'u1', username: 'Alice', value: 500 },
                ],
                { 'u1': 1 } // requester not in this map
            );

            const result = await (getGlobalLeaderboardV2 as any).run({
                data: { category: 'score', subcategory: 'allTime' },
                auth: { uid: 'unknown-user' },
                app: undefined,
            });

            expect(result.success).toBe(true);
            expect(result.requesterEntry).toBeUndefined();
        });

        it('falls back to full scan when snapshot does not exist', async () => {
            // Snapshot does not exist
            mockSnapshotDoc = { exists: false, data: () => null };

            // Set up collectionGroup data for the fallback path
            mockCollectionGroupDocs = [
                makeMockLeaderboardDoc('user-a', 'levelAgnostic', {
                    eloScoreAllTime: 900,
                }),
                makeMockLeaderboardDoc('user-b', 'levelAgnostic', {
                    eloScoreAllTime: 700,
                }),
            ];

            const result = await (getGlobalLeaderboardV2 as any).run({
                data: { category: 'score', subcategory: 'allTime' },
                auth: { uid: 'user-a' },
                app: undefined,
            });

            expect(result.success).toBe(true);
            // Should have used collectionGroup fallback
            expect(result.leaderboard.length).toBeGreaterThanOrEqual(1);
        });

        it('correctly computes isCurrent for streak leaderboards', async () => {
            setSnapshotDoc([
                { userId: 'u1', username: 'Alice', value: 10, currentValue: 10 },
                { userId: 'u2', username: 'Bob', value: 8, currentValue: 5 },
                { userId: 'u3', username: 'Carol', value: 6 },
            ]);

            // Note: the implementation requires difficulty for all streaks categories
            // (even puzzleCompleted which is level-agnostic), due to the broad validation check
            const result = await (getGlobalLeaderboardV2 as any).run({
                data: { category: 'streaks', subcategory: 'puzzleCompleted', difficulty: 'hard' },
                auth: { uid: 'guest-user' },
                app: undefined,
            });

            expect(result.success).toBe(true);
            // u1: currentValue === value => isCurrent = true
            expect(result.leaderboard[0].isCurrent).toBe(true);
            // u2: currentValue !== value => isCurrent = false
            expect(result.leaderboard[1].isCurrent).toBe(false);
            // u3: no currentValue => isCurrent = undefined
            expect(result.leaderboard[2].isCurrent).toBeUndefined();
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // precomputeLeaderboards — write path
    // ═══════════════════════════════════════════════════════════════════════

    describe('precomputeLeaderboards (write path)', () => {
        it('writes to "leaderboards" collection, not "leaderboardSnapshots" (Bug 1)', async () => {
            mockCollectionGroupDocs = [
                makeMockLeaderboardDoc('u1', 'levelAgnostic', {
                    eloScoreByDay: { '2025-01-01': 100 },
                    eloScoreAllTime: 100,
                    eloScoreLast30: 100,
                    eloScoreLast7: 100,
                }),
            ];

            await (precomputeLeaderboards as any).run({});

            // Verify we are writing to "leaderboards"
            expect(collectionAccesses).toContain('leaderboards');
            expect(collectionAccesses).not.toContain('leaderboardSnapshots');
        });

        it('totalEntries reflects full count, not capped at 100 (Bug 3)', async () => {
            // Create 150 users
            mockCollectionGroupDocs = Array.from({ length: 150 }, (_, i) =>
                makeMockLeaderboardDoc(`user-${i}`, 'levelAgnostic', {
                    eloScoreByDay: { '2025-01-01': 1000 - i },
                    eloScoreAllTime: 1000 - i,
                    eloScoreLast30: 1000 - i,
                    eloScoreLast7: 1000 - i,
                })
            );

            await (precomputeLeaderboards as any).run({});

            // Find the score_allTime batch call
            const allTimeCall = batchSetCalls.find(c => c.ref?.id === 'score_allTime');
            expect(allTimeCall).toBeDefined();
            expect(allTimeCall!.data.totalEntries).toBe(150);
            // Entries array should be capped at 100
            expect(allTimeCall!.data.entries.length).toBe(100);
        });

        it('userRanks map includes ALL users, not just top 100 (Bug 2)', async () => {
            // Create 120 users
            mockCollectionGroupDocs = Array.from({ length: 120 }, (_, i) =>
                makeMockLeaderboardDoc(`user-${i}`, 'levelAgnostic', {
                    eloScoreByDay: { '2025-01-01': 1200 - i },
                    eloScoreAllTime: 1200 - i,
                    eloScoreLast30: 1200 - i,
                    eloScoreLast7: 1200 - i,
                })
            );

            await (precomputeLeaderboards as any).run({});

            const allTimeCall = batchSetCalls.find(c => c.ref?.id === 'score_allTime');
            expect(allTimeCall).toBeDefined();

            const userRanks = allTimeCall!.data.userRanks;
            // Should have all 120 users in the ranks map
            const rankKeys = Object.keys(userRanks);
            expect(rankKeys.length).toBe(120);

            // User at index 0 should have rank 1 (highest value)
            expect(userRanks['user-0']).toBe(1);
            // User at index 119 should have rank 120
            expect(userRanks['user-119']).toBe(120);
            // User at index 105 (rank 106, outside top 100) should still be in the map
            expect(userRanks['user-105']).toBe(106);
        });

        it('for score configs, uses recomputed ELO (not stored field values) (Bug 4)', async () => {
            const today = new Date();
            const todayStr = formatDateUTC(today);

            // 60 days ago -- should NOT appear in last7 or last30
            const sixtyDaysAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 60));
            const sixtyDaysAgoStr = formatDateUTC(sixtyDaysAgo);

            mockCollectionGroupDocs = [
                makeMockLeaderboardDoc('user-elo-test', 'levelAgnostic', {
                    eloScoreByDay: {
                        [todayStr]: 50,
                        [sixtyDaysAgoStr]: 200,
                    },
                    // Stale stored values that should be IGNORED for score configs
                    eloScoreAllTime: 9999,
                    eloScoreLast30: 8888,
                    eloScoreLast7: 7777,
                }),
            ];

            await (precomputeLeaderboards as any).run({});

            const allTimeCall = batchSetCalls.find(c => c.ref?.id === 'score_allTime');
            const last30Call = batchSetCalls.find(c => c.ref?.id === 'score_last30');
            const last7Call = batchSetCalls.find(c => c.ref?.id === 'score_last7');

            // allTime should be 50 + 200 = 250 (recomputed), NOT 9999 (stored)
            expect(allTimeCall).toBeDefined();
            expect(allTimeCall!.data.entries[0].value).toBe(250);

            // last30 should be 50 only (60-day-old score excluded), NOT 8888
            expect(last30Call).toBeDefined();
            expect(last30Call!.data.entries[0].value).toBe(50);

            // last7 should be 50 only, NOT 7777
            expect(last7Call).toBeDefined();
            expect(last7Call!.data.entries[0].value).toBe(50);
        });

        it('for non-score configs, uses stored field values directly', async () => {
            mockCollectionGroupDocs = [
                makeMockLeaderboardDoc('user-goals', 'hard', {
                    goalsBeaten: 42,
                    goalsAchieved: 88,
                }),
            ];

            await (precomputeLeaderboards as any).run({});

            const goalsBeatenHard = batchSetCalls.find(c => c.ref?.id === 'goals_beaten_hard');
            expect(goalsBeatenHard).toBeDefined();
            expect(goalsBeatenHard!.data.entries[0].value).toBe(42);

            const goalsMatchedHard = batchSetCalls.find(c => c.ref?.id === 'goals_matched_hard');
            expect(goalsMatchedHard).toBeDefined();
            expect(goalsMatchedHard!.data.entries[0].value).toBe(88);
        });

        it('entries are sorted descending by value', async () => {
            mockCollectionGroupDocs = [
                makeMockLeaderboardDoc('user-low', 'levelAgnostic', {
                    eloScoreByDay: { '2025-01-01': 10 },
                    eloScoreAllTime: 10,
                }),
                makeMockLeaderboardDoc('user-high', 'levelAgnostic', {
                    eloScoreByDay: { '2025-01-01': 500 },
                    eloScoreAllTime: 500,
                }),
                makeMockLeaderboardDoc('user-mid', 'levelAgnostic', {
                    eloScoreByDay: { '2025-01-01': 200 },
                    eloScoreAllTime: 200,
                }),
            ];

            await (precomputeLeaderboards as any).run({});

            const allTimeCall = batchSetCalls.find(c => c.ref?.id === 'score_allTime');
            expect(allTimeCall).toBeDefined();

            const entries = allTimeCall!.data.entries;
            expect(entries[0].value).toBe(500);
            expect(entries[1].value).toBe(200);
            expect(entries[2].value).toBe(10);
        });

        it('stores currentValue for streak configs', async () => {
            mockCollectionGroupDocs = [
                makeMockLeaderboardDoc('user-streak', 'levelAgnostic', {
                    longestPuzzleCompletedStreak: 15,
                    currentPuzzleCompletedStreak: 10,
                }),
            ];

            await (precomputeLeaderboards as any).run({});

            const streakCall = batchSetCalls.find(c => c.ref?.id === 'streaks_puzzleCompleted');
            expect(streakCall).toBeDefined();
            expect(streakCall!.data.entries[0].value).toBe(15);
            expect(streakCall!.data.entries[0].currentValue).toBe(10);
        });

        it('skips entries with value 0', async () => {
            mockCollectionGroupDocs = [
                makeMockLeaderboardDoc('user-zero', 'levelAgnostic', {
                    eloScoreByDay: {},
                    eloScoreAllTime: 0,
                }),
                makeMockLeaderboardDoc('user-good', 'levelAgnostic', {
                    eloScoreByDay: { '2025-01-01': 100 },
                    eloScoreAllTime: 100,
                }),
            ];

            await (precomputeLeaderboards as any).run({});

            const allTimeCall = batchSetCalls.find(c => c.ref?.id === 'score_allTime');
            expect(allTimeCall).toBeDefined();
            // Only user-good should appear (user-zero has value 0 and should be filtered)
            expect(allTimeCall!.data.entries.length).toBe(1);
            expect(allTimeCall!.data.entries[0].userId).toBe('user-good');
        });
    });
});
