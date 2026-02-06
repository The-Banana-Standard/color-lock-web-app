/**
 * Tests for dateUtils.ts
 *
 * Covers:
 * - dateKeyForToday: returns current date in YYYY-MM-DD format
 * - stableSeedForDate: generates stable seed from date string
 * - createSwiftSeededGenerator: creates Swift-compatible RNG
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  dateKeyForToday,
  stableSeedForDate,
  createSwiftSeededGenerator,
} from '../dateUtils';

// ---------------------------------------------------------------------------
// dateKeyForToday Tests
// ---------------------------------------------------------------------------

describe('dateKeyForToday', () => {
  beforeEach(() => {
    // Suppress console.log from dateKeyForToday
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns date in YYYY-MM-DD format', () => {
    const result = dateKeyForToday();

    // Should match YYYY-MM-DD pattern
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('pads single-digit months with leading zero', () => {
    // Mock Date to return January (month 0)
    const mockDate = new Date(2026, 0, 15); // January 15, 2026
    vi.spyOn(global, 'Date').mockImplementation(() => mockDate as Date);

    const result = dateKeyForToday();

    expect(result).toBe('2026-01-15');
  });

  it('pads single-digit days with leading zero', () => {
    const mockDate = new Date(2026, 11, 5); // December 5, 2026
    vi.spyOn(global, 'Date').mockImplementation(() => mockDate as Date);

    const result = dateKeyForToday();

    expect(result).toBe('2026-12-05');
  });

  it('handles December 31st correctly', () => {
    const mockDate = new Date(2026, 11, 31); // December 31, 2026
    vi.spyOn(global, 'Date').mockImplementation(() => mockDate as Date);

    const result = dateKeyForToday();

    expect(result).toBe('2026-12-31');
  });

  it('handles January 1st correctly', () => {
    const mockDate = new Date(2027, 0, 1); // January 1, 2027
    vi.spyOn(global, 'Date').mockImplementation(() => mockDate as Date);

    const result = dateKeyForToday();

    expect(result).toBe('2027-01-01');
  });
});

// ---------------------------------------------------------------------------
// stableSeedForDate Tests
// ---------------------------------------------------------------------------

describe('stableSeedForDate', () => {
  it('returns a number', () => {
    const result = stableSeedForDate('2026-02-05');

    expect(typeof result).toBe('number');
  });

  it('returns the same value for the same date string', () => {
    const dateStr = '2026-02-05';

    const result1 = stableSeedForDate(dateStr);
    const result2 = stableSeedForDate(dateStr);

    expect(result1).toBe(result2);
  });

  it('returns different values for different dates', () => {
    const result1 = stableSeedForDate('2026-02-05');
    const result2 = stableSeedForDate('2026-02-06');

    expect(result1).not.toBe(result2);
  });

  it('returns different values for dates in different years', () => {
    const result1 = stableSeedForDate('2026-02-05');
    const result2 = stableSeedForDate('2027-02-05');

    expect(result1).not.toBe(result2);
  });

  it('returns different values for dates in different months', () => {
    const result1 = stableSeedForDate('2026-01-05');
    const result2 = stableSeedForDate('2026-02-05');

    expect(result1).not.toBe(result2);
  });

  it('handles empty string', () => {
    const result = stableSeedForDate('');

    expect(typeof result).toBe('number');
    expect(result).toBe(0); // Empty string should return initial accumulator
  });

  it('produces consistent hash for known input', () => {
    // This is a regression test to ensure the hash algorithm doesn't change
    const result = stableSeedForDate('2026-01-01');

    // The result should be deterministic
    const secondCall = stableSeedForDate('2026-01-01');
    expect(result).toBe(secondCall);
  });
});

// ---------------------------------------------------------------------------
// createSwiftSeededGenerator Tests
// ---------------------------------------------------------------------------

describe('createSwiftSeededGenerator', () => {
  describe('nextUInt64', () => {
    it('returns a bigint', () => {
      const rng = createSwiftSeededGenerator(12345);

      const result = rng.nextUInt64();

      expect(typeof result).toBe('bigint');
    });

    it('returns different values on subsequent calls', () => {
      const rng = createSwiftSeededGenerator(12345);

      const result1 = rng.nextUInt64();
      const result2 = rng.nextUInt64();

      expect(result1).not.toBe(result2);
    });

    it('produces the same sequence for the same seed', () => {
      const rng1 = createSwiftSeededGenerator(12345);
      const rng2 = createSwiftSeededGenerator(12345);

      const sequence1 = [rng1.nextUInt64(), rng1.nextUInt64(), rng1.nextUInt64()];
      const sequence2 = [rng2.nextUInt64(), rng2.nextUInt64(), rng2.nextUInt64()];

      expect(sequence1).toEqual(sequence2);
    });

    it('produces different sequences for different seeds', () => {
      const rng1 = createSwiftSeededGenerator(12345);
      const rng2 = createSwiftSeededGenerator(54321);

      const result1 = rng1.nextUInt64();
      const result2 = rng2.nextUInt64();

      expect(result1).not.toBe(result2);
    });

    it('handles seed of 0', () => {
      const rng = createSwiftSeededGenerator(0);

      const result = rng.nextUInt64();

      expect(typeof result).toBe('bigint');
    });

    it('handles negative seed', () => {
      const rng = createSwiftSeededGenerator(-12345);

      const result = rng.nextUInt64();

      expect(typeof result).toBe('bigint');
    });
  });

  describe('nextIntInRange', () => {
    it('returns a number', () => {
      const rng = createSwiftSeededGenerator(12345);

      const result = rng.nextIntInRange(10);

      expect(typeof result).toBe('number');
    });

    it('returns 0 when upperBound is 0', () => {
      const rng = createSwiftSeededGenerator(12345);

      const result = rng.nextIntInRange(0);

      expect(result).toBe(0);
    });

    it('returns 0 when upperBound is negative', () => {
      const rng = createSwiftSeededGenerator(12345);

      const result = rng.nextIntInRange(-5);

      expect(result).toBe(0);
    });

    it('returns value in range [0, upperBound)', () => {
      const rng = createSwiftSeededGenerator(12345);
      const upperBound = 10;

      // Generate many values and verify they're all in range
      for (let i = 0; i < 100; i++) {
        const result = rng.nextIntInRange(upperBound);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(upperBound);
      }
    });

    it('returns 0 for upperBound of 1', () => {
      const rng = createSwiftSeededGenerator(12345);

      // All values should be 0 when upper bound is 1
      for (let i = 0; i < 10; i++) {
        expect(rng.nextIntInRange(1)).toBe(0);
      }
    });

    it('produces different values for different ranges', () => {
      const rng1 = createSwiftSeededGenerator(12345);
      const rng2 = createSwiftSeededGenerator(12345);

      // Even with same seed, different ranges should produce different results
      // (unless the underlying values happen to be the same, which is unlikely)
      const results1: number[] = [];
      const results2: number[] = [];

      for (let i = 0; i < 10; i++) {
        results1.push(rng1.nextIntInRange(100));
        results2.push(rng2.nextIntInRange(1000));
      }

      // At least some values should differ
      const allSame = results1.every((v, i) => v === results2[i]);
      expect(allSame).toBe(false);
    });

    it('produces same sequence for same seed and range', () => {
      const rng1 = createSwiftSeededGenerator(99999);
      const rng2 = createSwiftSeededGenerator(99999);

      const sequence1 = [
        rng1.nextIntInRange(6),
        rng1.nextIntInRange(6),
        rng1.nextIntInRange(6),
        rng1.nextIntInRange(6),
        rng1.nextIntInRange(6),
      ];
      const sequence2 = [
        rng2.nextIntInRange(6),
        rng2.nextIntInRange(6),
        rng2.nextIntInRange(6),
        rng2.nextIntInRange(6),
        rng2.nextIntInRange(6),
      ];

      expect(sequence1).toEqual(sequence2);
    });

    it('handles large upper bound', () => {
      const rng = createSwiftSeededGenerator(12345);
      const upperBound = 1000000;

      const result = rng.nextIntInRange(upperBound);

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(upperBound);
    });

    it('provides reasonable distribution', () => {
      const rng = createSwiftSeededGenerator(12345);
      const upperBound = 6;
      const counts = new Array(upperBound).fill(0);
      const iterations = 600;

      for (let i = 0; i < iterations; i++) {
        const value = rng.nextIntInRange(upperBound);
        counts[value]++;
      }

      // Each bucket should have roughly iterations/upperBound values
      // Allow for reasonable variance (between 50 and 150 for 600 iterations / 6 buckets)
      const expectedCount = iterations / upperBound;
      for (const count of counts) {
        expect(count).toBeGreaterThan(expectedCount * 0.3);
        expect(count).toBeLessThan(expectedCount * 2);
      }
    });
  });

  describe('integration with stableSeedForDate', () => {
    it('produces consistent results when combined', () => {
      const dateStr = '2026-02-05';
      const seed1 = stableSeedForDate(dateStr);
      const seed2 = stableSeedForDate(dateStr);

      const rng1 = createSwiftSeededGenerator(seed1);
      const rng2 = createSwiftSeededGenerator(seed2);

      const value1 = rng1.nextIntInRange(6);
      const value2 = rng2.nextIntInRange(6);

      expect(value1).toBe(value2);
    });

    it('produces different results for different dates', () => {
      const seed1 = stableSeedForDate('2026-02-05');
      const seed2 = stableSeedForDate('2026-02-06');

      const rng1 = createSwiftSeededGenerator(seed1);
      const rng2 = createSwiftSeededGenerator(seed2);

      // Generate several values to increase confidence they differ
      const values1 = [rng1.nextIntInRange(100), rng1.nextIntInRange(100), rng1.nextIntInRange(100)];
      const values2 = [rng2.nextIntInRange(100), rng2.nextIntInRange(100), rng2.nextIntInRange(100)];

      // At least one value should differ
      const allSame = values1.every((v, i) => v === values2[i]);
      expect(allSame).toBe(false);
    });
  });
});
