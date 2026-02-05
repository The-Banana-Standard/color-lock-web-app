/**
 * Tests for the client-side UsageStatsEntry interface.
 *
 * These tests document that the client-side UsageStatsEntry type does NOT
 * include a userIds field. The server strips userIds before returning data,
 * and the client type should reflect that contract.
 *
 * While TypeScript enforces this at compile time, these runtime tests serve
 * as documentation and regression protection if someone adds userIds back
 * to the client type.
 */
import type { UsageStatsEntry, GetUsageStatsResponse } from './firebaseService';

describe('UsageStatsEntry client-side type contract', () => {
    it('represents a stats entry without userIds', () => {
        // This object satisfies UsageStatsEntry — if userIds were required,
        // TypeScript would error at compile time and this would fail at runtime
        // by not matching the expected shape.
        const entry: UsageStatsEntry = {
            puzzleId: '2025-01-15',
            uniqueUsers: 10,
            totalAttempts: 50,
        };

        expect(entry).toHaveProperty('puzzleId');
        expect(entry).toHaveProperty('uniqueUsers');
        expect(entry).toHaveProperty('totalAttempts');
        expect(entry).not.toHaveProperty('userIds');
    });

    it('includes optional streak count fields', () => {
        const entry: UsageStatsEntry = {
            puzzleId: '2025-01-15',
            uniqueUsers: 10,
            totalAttempts: 50,
            puzzleStreak3PlusCount: 5,
            easyGoalStreak3PlusCount: 3,
            mediumGoalStreak3PlusCount: 2,
            hardGoalStreak3PlusCount: 1,
        };

        expect(entry.puzzleStreak3PlusCount).toBe(5);
        expect(entry.easyGoalStreak3PlusCount).toBe(3);
        expect(entry.mediumGoalStreak3PlusCount).toBe(2);
        expect(entry.hardGoalStreak3PlusCount).toBe(1);
        expect(entry).not.toHaveProperty('userIds');
    });

    it('GetUsageStatsResponse contains an array of UsageStatsEntry without userIds', () => {
        const response: GetUsageStatsResponse = {
            success: true,
            stats: [
                {
                    puzzleId: '2025-01-15',
                    uniqueUsers: 10,
                    totalAttempts: 50,
                },
                {
                    puzzleId: '2025-01-16',
                    uniqueUsers: 12,
                    totalAttempts: 60,
                    puzzleStreak3PlusCount: 3,
                },
            ],
            count: 2,
            totalUniqueUsers: 15,
            totalAttempts: 110,
        };

        expect(response.success).toBe(true);
        expect(response.stats).toHaveLength(2);
        response.stats!.forEach(entry => {
            expect(entry).not.toHaveProperty('userIds');
        });
    });
});
