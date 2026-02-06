/**
 * Tests for autocompleteUtils.ts
 *
 * Covers:
 * - shouldShowAutocomplete: determine if autocomplete should be available
 * - autoCompletePuzzle: complete puzzle by changing remaining tiles
 */

import { describe, it, expect } from 'vitest';
import {
  shouldShowAutocomplete,
  autoCompletePuzzle,
} from '../autocompleteUtils';
import { TileColor, DailyPuzzle } from '../../types';

// ---------------------------------------------------------------------------
// Test Data Helpers
// ---------------------------------------------------------------------------

function createGrid(pattern: string[]): TileColor[][] {
  const colorMap: Record<string, TileColor> = {
    R: TileColor.Red,
    G: TileColor.Green,
    B: TileColor.Blue,
    Y: TileColor.Yellow,
    P: TileColor.Purple,
    O: TileColor.Orange,
  };

  return pattern.map((row) =>
    row.split('').map((char) => colorMap[char] || TileColor.Red)
  );
}

function createLockedCells(coords: [number, number][]): Set<string> {
  return new Set(coords.map(([r, c]) => `${r},${c}`));
}

function createBasePuzzle(overrides: Partial<DailyPuzzle> = {}): DailyPuzzle {
  return {
    dateString: '2026-02-05',
    grid: createGrid([
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]),
    startingGrid: createGrid([
      'RGBYP',
      'RGBYP',
      'RGBYP',
      'RGBYP',
      'RGBYP',
    ]),
    userMovesUsed: 3,
    isSolved: false,
    isLost: false,
    lockedCells: new Set<string>(),
    targetColor: TileColor.Red,
    bestScoreUsed: null,
    timesPlayed: 1,
    totalMovesForThisBoard: 3,
    algoScore: 5,
    effectiveStartingMoveIndex: 0,
    lossThreshold: 13,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// shouldShowAutocomplete Tests
// ---------------------------------------------------------------------------

describe('shouldShowAutocomplete', () => {
  describe('returns false when conditions are not met', () => {
    it('returns false when puzzle is null', () => {
      // @ts-expect-error Testing null case
      const result = shouldShowAutocomplete(null);

      expect(result).toBe(false);
    });

    it('returns false when puzzle is already solved', () => {
      const puzzle = createBasePuzzle({
        isSolved: true,
        lockedCells: createLockedCells([
          [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
          [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
          [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
          [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
          [4, 0], [4, 1], [4, 2],
        ]),
      });

      const result = shouldShowAutocomplete(puzzle);

      expect(result).toBe(false);
    });

    it('returns false when puzzle is lost', () => {
      const puzzle = createBasePuzzle({
        isLost: true,
        lockedCells: createLockedCells([
          [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
          [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
          [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
          [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
          [4, 0], [4, 1], [4, 2],
        ]),
      });

      const result = shouldShowAutocomplete(puzzle);

      expect(result).toBe(false);
    });

    it('returns false when locked region is smaller than threshold', () => {
      // 5x5 = 25 cells, threshold is boardSize - 3 = 22 cells
      const puzzle = createBasePuzzle({
        lockedCells: createLockedCells([
          [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
          [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
          [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
          [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
          [4, 0],
        ]), // 21 cells - not enough
        targetColor: TileColor.Red,
      });

      const result = shouldShowAutocomplete(puzzle);

      expect(result).toBe(false);
    });

    it('returns false when locked region is wrong color', () => {
      const puzzle = createBasePuzzle({
        grid: createGrid([
          'GGGGG',
          'GGGGG',
          'GGGGG',
          'GGGGG',
          'GGGRR',
        ]),
        lockedCells: createLockedCells([
          [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
          [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
          [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
          [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
          [4, 0], [4, 1], [4, 2],
        ]), // 23 green cells
        targetColor: TileColor.Blue, // Target is Blue, not Green
      });

      const result = shouldShowAutocomplete(puzzle);

      expect(result).toBe(false);
    });
  });

  describe('returns true when conditions are met', () => {
    it('returns true when locked region meets threshold and is target color', () => {
      const puzzle = createBasePuzzle({
        grid: createGrid([
          'BBBBB',
          'BBBBB',
          'BBBBB',
          'BBBBB',
          'BBBRR',
        ]),
        lockedCells: createLockedCells([
          [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
          [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
          [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
          [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
          [4, 0], [4, 1], [4, 2],
        ]), // 23 blue cells
        targetColor: TileColor.Blue,
      });

      const result = shouldShowAutocomplete(puzzle);

      expect(result).toBe(true);
    });

    it('returns true when locked region is exactly at threshold', () => {
      // 5x5 = 25 cells, threshold is 25 - 3 = 22 cells
      const puzzle = createBasePuzzle({
        grid: createGrid([
          'BBBBB',
          'BBBBB',
          'BBBBB',
          'BBBBB',
          'BBRRR',
        ]),
        lockedCells: createLockedCells([
          [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
          [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
          [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
          [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
          [4, 0], [4, 1],
        ]), // 22 blue cells - exactly at threshold
        targetColor: TileColor.Blue,
      });

      const result = shouldShowAutocomplete(puzzle);

      expect(result).toBe(true);
    });

    it('returns true for smaller grids with proportional threshold', () => {
      const puzzle = createBasePuzzle({
        grid: createGrid([
          'BBB',
          'BBB',
          'BBR',
        ]),
        lockedCells: createLockedCells([
          [0, 0], [0, 1], [0, 2],
          [1, 0], [1, 1], [1, 2],
        ]), // 6 blue cells (9 - 3 = 6 threshold)
        targetColor: TileColor.Blue,
      });

      const result = shouldShowAutocomplete(puzzle);

      expect(result).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty locked cells set', () => {
      const puzzle = createBasePuzzle({
        lockedCells: new Set<string>(),
      });

      const result = shouldShowAutocomplete(puzzle);

      expect(result).toBe(false);
    });

    it('handles 1x1 grid at threshold', () => {
      const puzzle = createBasePuzzle({
        grid: [[TileColor.Blue]],
        lockedCells: new Set<string>(), // 0 cells, threshold is 1 - 3 = -2
        targetColor: TileColor.Blue,
      });

      // With 0 locked cells and threshold of -2, condition is not met
      const result = shouldShowAutocomplete(puzzle);

      expect(result).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// autoCompletePuzzle Tests
// ---------------------------------------------------------------------------

describe('autoCompletePuzzle', () => {
  it('changes all tiles to target color', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBRR',
      ]),
      lockedCells: createLockedCells([
        [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
        [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
        [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
        [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
        [4, 0], [4, 1], [4, 2],
      ]),
      targetColor: TileColor.Blue,
      userMovesUsed: 5,
    });

    const result = autoCompletePuzzle(puzzle);

    // All cells should now be blue
    for (let r = 0; r < result.grid.length; r++) {
      for (let c = 0; c < result.grid[r].length; c++) {
        expect(result.grid[r][c]).toBe(TileColor.Blue);
      }
    }
  });

  it('sets isSolved to true', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBRR',
      ]),
      lockedCells: createLockedCells([
        [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
      ]),
      targetColor: TileColor.Blue,
      isSolved: false,
    });

    const result = autoCompletePuzzle(puzzle);

    expect(result.isSolved).toBe(true);
  });

  it('sets isLost to false', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBRR',
      ]),
      lockedCells: createLockedCells([
        [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
      ]),
      targetColor: TileColor.Blue,
      isLost: true, // Even if it was lost
    });

    const result = autoCompletePuzzle(puzzle);

    expect(result.isLost).toBe(false);
  });

  it('clears locked cells', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBRR',
      ]),
      lockedCells: createLockedCells([
        [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
        [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
      ]),
      targetColor: TileColor.Blue,
    });

    const result = autoCompletePuzzle(puzzle);

    expect(result.lockedCells.size).toBe(0);
  });

  it('counts moves accurately for single non-target region', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBRR',
      ]),
      lockedCells: createLockedCells([
        [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
        [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
        [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
        [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
        [4, 0], [4, 1], [4, 2],
      ]),
      targetColor: TileColor.Blue,
      userMovesUsed: 5,
    });

    const result = autoCompletePuzzle(puzzle);

    // 2 red cells form 1 connected region = 1 additional move
    expect(result.userMovesUsed).toBe(6);
  });

  it('counts moves accurately for multiple non-target regions', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'BBBBB',
        'BRBBB',
        'BBBBB',
        'BBBGB',
        'BBBBB',
      ]),
      lockedCells: createLockedCells([
        [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
        [1, 0], [1, 2], [1, 3], [1, 4],
        [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
        [3, 0], [3, 1], [3, 2], [3, 4],
        [4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
      ]),
      targetColor: TileColor.Blue,
      userMovesUsed: 5,
    });

    const result = autoCompletePuzzle(puzzle);

    // 1 red cell + 1 green cell = 2 separate regions = 2 additional moves
    expect(result.userMovesUsed).toBe(7);
  });

  it('does not count regions already at target color', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBBB',
      ]),
      lockedCells: createLockedCells([
        [0, 0], [0, 1],
      ]),
      targetColor: TileColor.Blue,
      userMovesUsed: 5,
    });

    const result = autoCompletePuzzle(puzzle);

    // All cells are already blue, so no additional moves needed
    expect(result.userMovesUsed).toBe(5);
  });

  it('does not modify the original puzzle', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBRR',
      ]),
      lockedCells: createLockedCells([
        [0, 0], [0, 1],
      ]),
      targetColor: TileColor.Blue,
      userMovesUsed: 5,
    });

    const originalGridCell = puzzle.grid[4][3];
    const originalMovesUsed = puzzle.userMovesUsed;

    autoCompletePuzzle(puzzle);

    expect(puzzle.grid[4][3]).toBe(originalGridCell);
    expect(puzzle.userMovesUsed).toBe(originalMovesUsed);
    expect(puzzle.isSolved).toBe(false);
  });

  it('handles grid where all non-locked cells are different colors', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'BBBB',
        'BBBR',
        'BBGY',
        'BPOB',
      ]),
      lockedCells: createLockedCells([
        [0, 0], [0, 1], [0, 2], [0, 3],
        [1, 0], [1, 1], [1, 2],
        [2, 0], [2, 1],
        [3, 0], [3, 3],
      ]),
      targetColor: TileColor.Blue,
      userMovesUsed: 3,
    });

    const result = autoCompletePuzzle(puzzle);

    // Non-locked cells: (1,3)=R, (2,2)=G, (2,3)=Y, (3,1)=P, (3,2)=O
    // These are 5 individual cells = 5 additional moves
    expect(result.userMovesUsed).toBe(8);
    expect(result.isSolved).toBe(true);
  });

  it('preserves other puzzle properties', () => {
    const puzzle = createBasePuzzle({
      dateString: '2026-02-05',
      startingGrid: createGrid([
        'RGBYP',
        'RGBYP',
        'RGBYP',
        'RGBYP',
        'RGBYP',
      ]),
      algoScore: 7,
      bestScoreUsed: 5,
      timesPlayed: 3,
      grid: createGrid([
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBRR',
      ]),
      lockedCells: createLockedCells([
        [0, 0],
      ]),
      targetColor: TileColor.Blue,
    });

    const result = autoCompletePuzzle(puzzle);

    expect(result.dateString).toBe('2026-02-05');
    expect(result.algoScore).toBe(7);
    expect(result.bestScoreUsed).toBe(5);
    expect(result.timesPlayed).toBe(3);
    expect(result.startingGrid).toEqual(puzzle.startingGrid);
  });
});
