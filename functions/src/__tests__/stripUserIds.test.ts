/**
 * Tests for the userIds stripping logic used in getUsageStats.
 *
 * The server stores userIds in UsageStatsEntry for deduplication, but the
 * getUsageStats callable strips them before returning data to the client.
 * This tests the exact sanitization pattern:
 *   finalStats.map(({ userIds: _userIds, ...rest }) => rest)
 */

interface UsageStatsEntry {
    puzzleId: string;
    uniqueUsers: number;
    totalAttempts: number;
    userIds?: string[];
    puzzleStreak3PlusCount?: number;
    easyGoalStreak3PlusCount?: number;
    mediumGoalStreak3PlusCount?: number;
    hardGoalStreak3PlusCount?: number;
}

/**
 * Extracted sanitization function — identical to the logic in getUsageStats.
 */
function stripUserIds(stats: UsageStatsEntry[]): Omit<UsageStatsEntry, 'userIds'>[] {
    return stats.map(({ userIds: _userIds, ...rest }) => rest);
}

describe('stripUserIds (getUsageStats sanitization)', () => {
    it('removes userIds from entries that have them', () => {
        const input: UsageStatsEntry[] = [
            {
                puzzleId: '2025-01-15',
                uniqueUsers: 3,
                totalAttempts: 10,
                userIds: ['user-a', 'user-b', 'user-c'],
            },
        ];

        const result = stripUserIds(input);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            puzzleId: '2025-01-15',
            uniqueUsers: 3,
            totalAttempts: 10,
        });
        expect(result[0]).not.toHaveProperty('userIds');
    });

    it('handles entries where userIds is undefined', () => {
        const input: UsageStatsEntry[] = [
            {
                puzzleId: '2025-01-15',
                uniqueUsers: 5,
                totalAttempts: 20,
                // userIds intentionally omitted
            },
        ];

        const result = stripUserIds(input);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            puzzleId: '2025-01-15',
            uniqueUsers: 5,
            totalAttempts: 20,
        });
        expect(result[0]).not.toHaveProperty('userIds');
    });

    it('handles an empty array', () => {
        const result = stripUserIds([]);

        expect(result).toEqual([]);
        expect(result).toHaveLength(0);
    });

    it('preserves all non-userIds fields including streak counts', () => {
        const input: UsageStatsEntry[] = [
            {
                puzzleId: '2025-02-01',
                uniqueUsers: 42,
                totalAttempts: 128,
                userIds: ['uid-1', 'uid-2'],
                puzzleStreak3PlusCount: 5,
                easyGoalStreak3PlusCount: 3,
                mediumGoalStreak3PlusCount: 2,
                hardGoalStreak3PlusCount: 1,
            },
        ];

        const result = stripUserIds(input);

        expect(result[0]).toEqual({
            puzzleId: '2025-02-01',
            uniqueUsers: 42,
            totalAttempts: 128,
            puzzleStreak3PlusCount: 5,
            easyGoalStreak3PlusCount: 3,
            mediumGoalStreak3PlusCount: 2,
            hardGoalStreak3PlusCount: 1,
        });
        expect(result[0]).not.toHaveProperty('userIds');
    });

    it('strips userIds from multiple entries', () => {
        const input: UsageStatsEntry[] = [
            {
                puzzleId: '2025-01-15',
                uniqueUsers: 3,
                totalAttempts: 10,
                userIds: ['user-a', 'user-b', 'user-c'],
            },
            {
                puzzleId: '2025-01-16',
                uniqueUsers: 5,
                totalAttempts: 15,
                userIds: ['user-a', 'user-d', 'user-e', 'user-f', 'user-g'],
            },
            {
                puzzleId: '2025-01-17',
                uniqueUsers: 1,
                totalAttempts: 2,
                // No userIds — simulates older data that may lack this field
            },
        ];

        const result = stripUserIds(input);

        expect(result).toHaveLength(3);
        result.forEach(entry => {
            expect(entry).not.toHaveProperty('userIds');
        });
        expect(result[0].puzzleId).toBe('2025-01-15');
        expect(result[1].puzzleId).toBe('2025-01-16');
        expect(result[2].puzzleId).toBe('2025-01-17');
    });

    it('handles entries with empty userIds array', () => {
        const input: UsageStatsEntry[] = [
            {
                puzzleId: '2025-01-15',
                uniqueUsers: 0,
                totalAttempts: 0,
                userIds: [],
            },
        ];

        const result = stripUserIds(input);

        expect(result).toHaveLength(1);
        expect(result[0]).not.toHaveProperty('userIds');
        expect(result[0].uniqueUsers).toBe(0);
        expect(result[0].totalAttempts).toBe(0);
    });

    it('does not mutate the original array', () => {
        const input: UsageStatsEntry[] = [
            {
                puzzleId: '2025-01-15',
                uniqueUsers: 3,
                totalAttempts: 10,
                userIds: ['user-a', 'user-b', 'user-c'],
            },
        ];

        stripUserIds(input);

        // Original should still have userIds
        expect(input[0].userIds).toEqual(['user-a', 'user-b', 'user-c']);
    });

    it('handles entries with only required fields', () => {
        const input: UsageStatsEntry[] = [
            {
                puzzleId: '2025-01-15',
                uniqueUsers: 1,
                totalAttempts: 1,
            },
        ];

        const result = stripUserIds(input);

        expect(result[0]).toEqual({
            puzzleId: '2025-01-15',
            uniqueUsers: 1,
            totalAttempts: 1,
        });
    });

    it('produces entries whose keys do not include userIds even when explicitly set to undefined', () => {
        const input: UsageStatsEntry[] = [
            {
                puzzleId: '2025-01-15',
                uniqueUsers: 2,
                totalAttempts: 4,
                userIds: undefined,
            },
        ];

        const result = stripUserIds(input);

        // The destructuring pattern removes the key entirely,
        // so Object.keys should not include 'userIds'
        expect(Object.keys(result[0])).not.toContain('userIds');
    });
});
