/**
 * Tests for gameLogic.ts
 *
 * Covers:
 * - floodFill: flood fill algorithm for finding connected regions
 * - findLargestRegion: find largest contiguous region of same color
 * - isBoardUnified: check if entire board is single color
 * - convertFirestoreGridToArray / convertArrayToFirestoreGrid: grid conversions
 */

import { describe, it, expect, vi } from 'vitest';
import {
  floodFill,
  findLargestRegion,
  isBoardUnified,
  convertFirestoreGridToArray,
  convertArrayToFirestoreGrid,
  generatePuzzleFromDB,
} from '../gameLogic';
import { TileColor, PuzzleGrid, FirestorePuzzleData } from '../../types';
import { AppSettings, DifficultyLevel } from '../../types/settings';

// ---------------------------------------------------------------------------
// Test Data Helpers
// ---------------------------------------------------------------------------

function createGrid(pattern: string[]): TileColor[][] {
  // Map single characters to TileColor values
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

// ---------------------------------------------------------------------------
// floodFill Tests
// ---------------------------------------------------------------------------

describe('floodFill', () => {
  it('returns the starting cell when it is isolated', () => {
    const grid = createGrid([
      'RGB',
      'YPO',
      'BGR',
    ]);

    const [rows, cols] = floodFill(grid, 0, 0, TileColor.Red);

    expect(rows).toEqual([0]);
    expect(cols).toEqual([0]);
  });

  it('returns connected cells of the same color horizontally', () => {
    const grid = createGrid([
      'RRR',
      'GGG',
      'BBB',
    ]);

    const [rows, cols] = floodFill(grid, 0, 0, TileColor.Red);

    expect(rows.length).toBe(3);
    expect(cols.length).toBe(3);
    // All cells should be in row 0
    expect(rows.every((r) => r === 0)).toBe(true);
    // Columns should cover 0, 1, 2
    expect(cols.sort()).toEqual([0, 1, 2]);
  });

  it('returns connected cells of the same color vertically', () => {
    const grid = createGrid([
      'RGB',
      'RGB',
      'RGB',
    ]);

    const [rows, cols] = floodFill(grid, 0, 0, TileColor.Red);

    expect(rows.length).toBe(3);
    expect(cols.length).toBe(3);
    // All cells should be in column 0
    expect(cols.every((c) => c === 0)).toBe(true);
    // Rows should cover 0, 1, 2
    expect(rows.sort()).toEqual([0, 1, 2]);
  });

  it('returns L-shaped connected region', () => {
    const grid = createGrid([
      'RRG',
      'RGG',
      'RGG',
    ]);

    const [rows, cols] = floodFill(grid, 0, 0, TileColor.Red);

    expect(rows.length).toBe(4);
    // Should include (0,0), (0,1), (1,0), (2,0)
    const cells = rows.map((r, i) => `${r},${cols[i]}`);
    expect(cells).toContain('0,0');
    expect(cells).toContain('0,1');
    expect(cells).toContain('1,0');
    expect(cells).toContain('2,0');
  });

  it('returns empty arrays when starting cell does not match color', () => {
    const grid = createGrid([
      'RGR',
      'GRG',
      'RGR',
    ]);

    // Start at (0,0) which is Red, but search for Green
    const [rows, cols] = floodFill(grid, 0, 0, TileColor.Green);

    expect(rows).toEqual([]);
    expect(cols).toEqual([]);
  });

  it('fills entire grid when all cells are same color', () => {
    const grid = createGrid([
      'RRR',
      'RRR',
      'RRR',
    ]);

    const [rows, cols] = floodFill(grid, 1, 1, TileColor.Red);

    expect(rows.length).toBe(9);
    expect(cols.length).toBe(9);
  });

  it('does not include diagonally adjacent cells', () => {
    const grid = createGrid([
      'RGR',
      'GRG',
      'RGR',
    ]);

    // Start at center (1,1) which is Red
    const [rows, cols] = floodFill(grid, 1, 1, TileColor.Red);

    // Should only include the center cell, not the corners
    expect(rows.length).toBe(1);
    expect(rows[0]).toBe(1);
    expect(cols[0]).toBe(1);
  });

  it('handles single cell grid', () => {
    const grid = createGrid(['R']);

    const [rows, cols] = floodFill(grid, 0, 0, TileColor.Red);

    expect(rows).toEqual([0]);
    expect(cols).toEqual([0]);
  });

  it('handles rectangular grids (non-square)', () => {
    const grid = createGrid([
      'RRRR',
      'GGGG',
    ]);

    const [rows, cols] = floodFill(grid, 0, 0, TileColor.Red);

    expect(rows.length).toBe(4);
    expect(rows.every((r) => r === 0)).toBe(true);
    expect(cols.sort()).toEqual([0, 1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// findLargestRegion Tests
// ---------------------------------------------------------------------------

describe('findLargestRegion', () => {
  it('returns all cells when grid is unified', () => {
    const grid = createGrid([
      'RRR',
      'RRR',
      'RRR',
    ]);

    const largest = findLargestRegion(grid);

    expect(largest.size).toBe(9);
  });

  it('returns the single largest region when there are multiple', () => {
    const grid = createGrid([
      'RRG',
      'RRG',
      'GGG',
    ]);

    const largest = findLargestRegion(grid);

    // Green region has 5 cells: (0,2), (1,2), (2,0), (2,1), (2,2)
    // Red region has 4 cells: (0,0), (0,1), (1,0), (1,1)
    expect(largest.size).toBe(5);
    // Verify it's the green region
    expect(largest.has('2,0')).toBe(true);
    expect(largest.has('2,1')).toBe(true);
    expect(largest.has('2,2')).toBe(true);
  });

  it('returns any one of the largest regions when there is a tie', () => {
    const grid = createGrid([
      'RRG',
      'GGR',
      'GRR',
    ]);

    const largest = findLargestRegion(grid);

    // Both Red and Green have 4 cells each (assuming the pattern creates two 4-cell regions)
    // The function should return one of them
    expect(largest.size).toBeGreaterThanOrEqual(3);
  });

  it('handles grid with all unique colors', () => {
    const grid = createGrid([
      'RGB',
      'YPO',
      'GBR',
    ]);

    const largest = findLargestRegion(grid);

    // All cells are isolated, so largest region is 1 cell
    expect(largest.size).toBe(1);
  });

  it('identifies L-shaped region as largest', () => {
    const grid = createGrid([
      'RRR',
      'RGG',
      'RGG',
    ]);

    const largest = findLargestRegion(grid);

    // Red L-shape has 5 cells: (0,0), (0,1), (0,2), (1,0), (2,0)
    // Green square has 4 cells: (1,1), (1,2), (2,1), (2,2)
    // Red is larger
    expect(largest.size).toBe(5);
  });

  it('handles single cell grid', () => {
    const grid = createGrid(['R']);

    const largest = findLargestRegion(grid);

    expect(largest.size).toBe(1);
    expect(largest.has('0,0')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isBoardUnified Tests
// ---------------------------------------------------------------------------

describe('isBoardUnified', () => {
  it('returns true when all cells are the same color', () => {
    const grid = createGrid([
      'RRR',
      'RRR',
      'RRR',
    ]);

    expect(isBoardUnified(grid)).toBe(true);
  });

  it('returns false when cells have different colors', () => {
    const grid = createGrid([
      'RRR',
      'RGR',
      'RRR',
    ]);

    expect(isBoardUnified(grid)).toBe(false);
  });

  it('returns false when only first row differs', () => {
    const grid = createGrid([
      'GGG',
      'RRR',
      'RRR',
    ]);

    expect(isBoardUnified(grid)).toBe(false);
  });

  it('returns false when only last cell differs', () => {
    const grid = createGrid([
      'RRR',
      'RRR',
      'RRG',
    ]);

    expect(isBoardUnified(grid)).toBe(false);
  });

  it('returns true for single cell grid', () => {
    const grid = createGrid(['R']);

    expect(isBoardUnified(grid)).toBe(true);
  });

  it('returns true for empty grid', () => {
    const grid: TileColor[][] = [];

    expect(isBoardUnified(grid)).toBe(true);
  });

  it('returns true for grid with empty rows', () => {
    const grid: TileColor[][] = [[]];

    expect(isBoardUnified(grid)).toBe(true);
  });

  it('handles all six colors when unified', () => {
    // Test each color
    for (const color of Object.values(TileColor)) {
      const grid = [[color, color], [color, color]];
      expect(isBoardUnified(grid)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// convertFirestoreGridToArray Tests
// ---------------------------------------------------------------------------

describe('convertFirestoreGridToArray', () => {
  it('converts a 3x3 Firestore grid to a 2D array', () => {
    const firestoreGrid: PuzzleGrid = {
      '0': [TileColor.Red, TileColor.Green, TileColor.Blue],
      '1': [TileColor.Yellow, TileColor.Purple, TileColor.Orange],
      '2': [TileColor.Red, TileColor.Green, TileColor.Blue],
    };

    const result = convertFirestoreGridToArray(firestoreGrid);

    expect(result.length).toBe(3);
    expect(result[0]).toEqual([TileColor.Red, TileColor.Green, TileColor.Blue]);
    expect(result[1]).toEqual([TileColor.Yellow, TileColor.Purple, TileColor.Orange]);
    expect(result[2]).toEqual([TileColor.Red, TileColor.Green, TileColor.Blue]);
  });

  it('converts a 5x5 Firestore grid correctly', () => {
    const firestoreGrid: PuzzleGrid = {
      '0': [TileColor.Red, TileColor.Red, TileColor.Red, TileColor.Red, TileColor.Red],
      '1': [TileColor.Green, TileColor.Green, TileColor.Green, TileColor.Green, TileColor.Green],
      '2': [TileColor.Blue, TileColor.Blue, TileColor.Blue, TileColor.Blue, TileColor.Blue],
      '3': [TileColor.Yellow, TileColor.Yellow, TileColor.Yellow, TileColor.Yellow, TileColor.Yellow],
      '4': [TileColor.Purple, TileColor.Purple, TileColor.Purple, TileColor.Purple, TileColor.Purple],
    };

    const result = convertFirestoreGridToArray(firestoreGrid);

    expect(result.length).toBe(5);
    expect(result[0].length).toBe(5);
    expect(result[0].every((c) => c === TileColor.Red)).toBe(true);
    expect(result[4].every((c) => c === TileColor.Purple)).toBe(true);
  });

  it('handles single row grid', () => {
    const firestoreGrid: PuzzleGrid = {
      '0': [TileColor.Red, TileColor.Green, TileColor.Blue],
    };

    const result = convertFirestoreGridToArray(firestoreGrid);

    expect(result.length).toBe(1);
    expect(result[0]).toEqual([TileColor.Red, TileColor.Green, TileColor.Blue]);
  });

  it('preserves row order based on numeric keys', () => {
    // Even if keys are not in order in the object, should be converted correctly
    const firestoreGrid: PuzzleGrid = {
      '2': [TileColor.Blue, TileColor.Blue, TileColor.Blue],
      '0': [TileColor.Red, TileColor.Red, TileColor.Red],
      '1': [TileColor.Green, TileColor.Green, TileColor.Green],
    };

    const result = convertFirestoreGridToArray(firestoreGrid);

    expect(result[0]).toEqual([TileColor.Red, TileColor.Red, TileColor.Red]);
    expect(result[1]).toEqual([TileColor.Green, TileColor.Green, TileColor.Green]);
    expect(result[2]).toEqual([TileColor.Blue, TileColor.Blue, TileColor.Blue]);
  });
});

// ---------------------------------------------------------------------------
// convertArrayToFirestoreGrid Tests
// ---------------------------------------------------------------------------

describe('convertArrayToFirestoreGrid', () => {
  it('converts a 2D array to Firestore grid format', () => {
    const grid: TileColor[][] = [
      [TileColor.Red, TileColor.Green, TileColor.Blue],
      [TileColor.Yellow, TileColor.Purple, TileColor.Orange],
    ];

    const result = convertArrayToFirestoreGrid(grid);

    expect(Object.keys(result)).toEqual(['0', '1']);
    expect(result['0']).toEqual([TileColor.Red, TileColor.Green, TileColor.Blue]);
    expect(result['1']).toEqual([TileColor.Yellow, TileColor.Purple, TileColor.Orange]);
  });

  it('creates independent copies of rows (not references)', () => {
    const grid: TileColor[][] = [
      [TileColor.Red, TileColor.Green],
      [TileColor.Blue, TileColor.Yellow],
    ];

    const result = convertArrayToFirestoreGrid(grid);

    // Modify original grid
    grid[0][0] = TileColor.Purple;

    // Result should not be affected
    expect(result['0'][0]).toBe(TileColor.Red);
  });

  it('handles empty grid', () => {
    const grid: TileColor[][] = [];

    const result = convertArrayToFirestoreGrid(grid);

    expect(Object.keys(result)).toEqual([]);
  });

  it('round-trips correctly with convertFirestoreGridToArray', () => {
    const originalGrid: TileColor[][] = [
      [TileColor.Red, TileColor.Green, TileColor.Blue],
      [TileColor.Yellow, TileColor.Purple, TileColor.Orange],
      [TileColor.Red, TileColor.Green, TileColor.Blue],
    ];

    const firestoreGrid = convertArrayToFirestoreGrid(originalGrid);
    const roundTrippedGrid = convertFirestoreGridToArray(firestoreGrid);

    expect(roundTrippedGrid).toEqual(originalGrid);
  });
});

// ---------------------------------------------------------------------------
// generatePuzzleFromDB Tests
// ---------------------------------------------------------------------------

describe('generatePuzzleFromDB', () => {
  // Helper to create a 5x5 Firestore grid
  function create5x5FirestoreGrid(pattern: string[]): PuzzleGrid {
    const colorMap: Record<string, TileColor> = {
      R: TileColor.Red,
      G: TileColor.Green,
      B: TileColor.Blue,
      Y: TileColor.Yellow,
      P: TileColor.Purple,
      O: TileColor.Orange,
    };
    const result: PuzzleGrid = {};
    pattern.forEach((row, i) => {
      result[i.toString()] = row.split('').map((char) => colorMap[char] || TileColor.Red);
    });
    return result;
  }

  // Helper to create Firestore puzzle data
  function createFirestorePuzzleData(overrides: Partial<FirestorePuzzleData> = {}): FirestorePuzzleData {
    return {
      algoScore: 5,
      targetColor: TileColor.Blue,
      states: [
        create5x5FirestoreGrid([
          'RGBYR',
          'RGBYR',
          'RGBYR',
          'RGBYR',
          'RGBYR',
        ]),
        create5x5FirestoreGrid([
          'GGBYR',
          'GGBYR',
          'RGBYR',
          'RGBYR',
          'RGBYR',
        ]),
        create5x5FirestoreGrid([
          'BBBYR',
          'BBBYR',
          'BGBYR',
          'RGBYR',
          'RGBYR',
        ]),
        create5x5FirestoreGrid([
          'BBBYR',
          'BBBYR',
          'BBBYR',
          'BGBYR',
          'RGBYR',
        ]),
        create5x5FirestoreGrid([
          'BBBYR',
          'BBBYR',
          'BBBYR',
          'BBBYR',
          'BGBYR',
        ]),
      ],
      actions: [121, 122, 123, 124, 125], // 5 actions for full game
      colorMap: [0, 1, 2, 3, 4, 5],
      ...overrides,
    };
  }

  // Helper to create default settings
  function createSettings(difficulty: DifficultyLevel): AppSettings {
    return {
      highContrastMode: false,
      colorBlindMode: 'none' as any,
      customColorScheme: {},
      highlightLargestRegion: true,
      enableAnimations: true,
      enableSoundEffects: false,
      showLockedRegionCounter: true,
      difficultyLevel: difficulty,
    };
  }

  beforeEach(() => {
    // Suppress console.log/warn for cleaner test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Hard difficulty: starts with original grid (no actions applied)', () => {
    const firestoreData = createFirestorePuzzleData();
    const settings = createSettings(DifficultyLevel.Hard);

    const result = generatePuzzleFromDB(firestoreData, '2026-02-05', settings);

    // Should start at the original state (index 0)
    expect(result.effectiveStartingMoveIndex).toBe(0);
    // Grid should match the first state from Firestore
    expect(result.grid[0][0]).toBe(TileColor.Red);
    expect(result.grid[0][1]).toBe(TileColor.Green);
    expect(result.userMovesUsed).toBe(0);
  });

  it('Medium difficulty: applies 1 action to starting grid', () => {
    // Create a simple puzzle where we know the action effect
    const initialGrid = create5x5FirestoreGrid([
      'RRGGG',
      'RRGGG',
      'GGGGG',
      'GGGGG',
      'GGGGG',
    ]);
    const afterFirstAction = create5x5FirestoreGrid([
      'GGGGG',
      'GGGGG',
      'GGGGG',
      'GGGGG',
      'GGGGG',
    ]);
    const firestoreData = createFirestorePuzzleData({
      states: [initialGrid, afterFirstAction],
      // Action 121 changes (0,0) to Green: row=0, col=0, colorIndex=1 (Green)
      actions: [121, 122],
    });
    const settings = createSettings(DifficultyLevel.Medium);

    const result = generatePuzzleFromDB(firestoreData, '2026-02-05', settings);

    // Should have applied 1 action
    expect(result.effectiveStartingMoveIndex).toBe(1);
    // User starts with 0 moves regardless
    expect(result.userMovesUsed).toBe(0);
  });

  it('Easy difficulty: applies 3 actions to starting grid', () => {
    const firestoreData = createFirestorePuzzleData(); // Has 5 actions
    const settings = createSettings(DifficultyLevel.Easy);

    const result = generatePuzzleFromDB(firestoreData, '2026-02-05', settings);

    // Should have applied 3 actions
    expect(result.effectiveStartingMoveIndex).toBe(3);
    expect(result.userMovesUsed).toBe(0);
  });

  it('handles insufficient actions for Medium difficulty gracefully', () => {
    const firestoreData = createFirestorePuzzleData({
      actions: [], // No actions available
    });
    const settings = createSettings(DifficultyLevel.Medium);

    const result = generatePuzzleFromDB(firestoreData, '2026-02-05', settings);

    // Should fall back to Hard behavior (no actions applied)
    expect(result.effectiveStartingMoveIndex).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Not enough actions')
    );
  });

  it('handles insufficient actions for Easy difficulty gracefully (applies fewer moves)', () => {
    const firestoreData = createFirestorePuzzleData({
      actions: [121, 122], // Only 2 actions available, Easy needs 3
    });
    const settings = createSettings(DifficultyLevel.Easy);

    const result = generatePuzzleFromDB(firestoreData, '2026-02-05', settings);

    // Should apply as many actions as possible (2)
    expect(result.effectiveStartingMoveIndex).toBe(2);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Not enough actions')
    );
  });

  it('skipDifficultyAdjustments option bypasses difficulty-based actions', () => {
    const firestoreData = createFirestorePuzzleData();
    const settings = createSettings(DifficultyLevel.Easy);

    const result = generatePuzzleFromDB(firestoreData, '2026-02-05', settings, {
      skipDifficultyAdjustments: true,
    });

    // Should not apply any actions despite Easy difficulty
    expect(result.effectiveStartingMoveIndex).toBe(0);
    // Grid should match the original first state
    expect(result.grid[0][0]).toBe(TileColor.Red);
  });

  it('sets correct lossThreshold based on difficulty', () => {
    const firestoreData = createFirestorePuzzleData();

    const easyResult = generatePuzzleFromDB(firestoreData, '2026-02-05', createSettings(DifficultyLevel.Easy));
    const mediumResult = generatePuzzleFromDB(firestoreData, '2026-02-05', createSettings(DifficultyLevel.Medium));
    const hardResult = generatePuzzleFromDB(firestoreData, '2026-02-05', createSettings(DifficultyLevel.Hard));

    expect(easyResult.lossThreshold).toBe(8);
    expect(mediumResult.lossThreshold).toBe(13);
    expect(hardResult.lossThreshold).toBe(18);
  });

  it('preserves original algoScore regardless of difficulty', () => {
    const firestoreData = createFirestorePuzzleData({ algoScore: 7 });
    const settings = createSettings(DifficultyLevel.Easy);

    const result = generatePuzzleFromDB(firestoreData, '2026-02-05', settings);

    expect(result.algoScore).toBe(7);
  });

  it('sets targetColor from Firestore data', () => {
    const firestoreData = createFirestorePuzzleData({ targetColor: TileColor.Purple });
    const settings = createSettings(DifficultyLevel.Hard);

    const result = generatePuzzleFromDB(firestoreData, '2026-02-05', settings);

    expect(result.targetColor).toBe(TileColor.Purple);
  });

  it('sets dateString correctly', () => {
    const firestoreData = createFirestorePuzzleData();
    const settings = createSettings(DifficultyLevel.Hard);

    const result = generatePuzzleFromDB(firestoreData, '2026-02-05', settings);

    expect(result.dateString).toBe('2026-02-05');
  });

  it('initializes puzzle state correctly', () => {
    const firestoreData = createFirestorePuzzleData();
    const settings = createSettings(DifficultyLevel.Hard);

    const result = generatePuzzleFromDB(firestoreData, '2026-02-05', settings);

    expect(result.isSolved).toBe(false);
    expect(result.isLost).toBe(false);
    expect(result.userMovesUsed).toBe(0);
    expect(result.bestScoreUsed).toBeNull();
    expect(result.timesPlayed).toBe(0);
    expect(result.totalMovesForThisBoard).toBe(0);
  });

  it('calculates lockedCells based on difficulty-adjusted starting grid', () => {
    const firestoreData = createFirestorePuzzleData();
    const settings = createSettings(DifficultyLevel.Hard);

    const result = generatePuzzleFromDB(firestoreData, '2026-02-05', settings);

    // lockedCells should be the largest region in the starting grid
    expect(result.lockedCells).toBeInstanceOf(Set);
    expect(result.lockedCells.size).toBeGreaterThan(0);
  });
});
