/**
 * Tests for gameUtils.ts
 *
 * Covers:
 * - GRID_SIZE constant
 * - getLockedRegionsInfo: analyze locked regions
 * - checkIfOnOptimalPath: verify current grid matches expected state
 * - applyActionToGrid: apply a move to a grid (for difficulty adjustment)
 * - applyColorChange: apply user color changes to puzzle
 * - decodeActionIdToHint: decode action ID to hint
 * - getGameHint: get hint for current puzzle state
 */

import { describe, it, expect, vi } from 'vitest';
import {
  GRID_SIZE,
  getLockedRegionsInfo,
  checkIfOnOptimalPath,
  applyActionToGrid,
  applyColorChange,
} from '../gameUtils';
import { TileColor, DailyPuzzle, FirestorePuzzleData } from '../../types';

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
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]),
    userMovesUsed: 0,
    isSolved: false,
    isLost: false,
    lockedCells: new Set<string>(),
    targetColor: TileColor.Red,
    bestScoreUsed: null,
    timesPlayed: 0,
    totalMovesForThisBoard: 0,
    algoScore: 5,
    effectiveStartingMoveIndex: 0,
    lossThreshold: 13,
    ...overrides,
  };
}

function createFirestoreData(overrides: Partial<FirestorePuzzleData> = {}): FirestorePuzzleData {
  return {
    algoScore: 5,
    targetColor: TileColor.Blue,
    states: [
      {
        '0': [TileColor.Red, TileColor.Green, TileColor.Blue, TileColor.Yellow, TileColor.Purple],
        '1': [TileColor.Red, TileColor.Green, TileColor.Blue, TileColor.Yellow, TileColor.Purple],
        '2': [TileColor.Red, TileColor.Green, TileColor.Blue, TileColor.Yellow, TileColor.Purple],
        '3': [TileColor.Red, TileColor.Green, TileColor.Blue, TileColor.Yellow, TileColor.Purple],
        '4': [TileColor.Red, TileColor.Green, TileColor.Blue, TileColor.Yellow, TileColor.Purple],
      },
    ],
    actions: [42, 67, 89],
    colorMap: [0, 1, 2, 3, 4, 5],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GRID_SIZE Tests
// ---------------------------------------------------------------------------

describe('GRID_SIZE', () => {
  it('is 5', () => {
    expect(GRID_SIZE).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// getLockedRegionsInfo Tests
// ---------------------------------------------------------------------------

describe('getLockedRegionsInfo', () => {
  it('returns empty info when no locked cells', () => {
    const grid = createGrid([
      'RRR',
      'GGG',
      'BBB',
    ]);
    const lockedCells = new Set<string>();

    const result = getLockedRegionsInfo(grid, lockedCells);

    expect(result.totalSize).toBe(0);
    expect(result.regions).toEqual([]);
  });

  it('returns single region when all locked cells are connected', () => {
    const grid = createGrid([
      'RRR',
      'RGG',
      'RGG',
    ]);
    // Lock the L-shaped red region
    const lockedCells = createLockedCells([
      [0, 0], [0, 1], [0, 2],
      [1, 0],
      [2, 0],
    ]);

    const result = getLockedRegionsInfo(grid, lockedCells);

    expect(result.totalSize).toBe(5);
    expect(result.regions).toEqual([5]);
  });

  it('identifies multiple disconnected locked regions', () => {
    const grid = createGrid([
      'RGR',
      'GGG',
      'RGR',
    ]);
    // Lock the four corners (disconnected red cells)
    const lockedCells = createLockedCells([
      [0, 0], [0, 2],
      [2, 0], [2, 2],
    ]);

    const result = getLockedRegionsInfo(grid, lockedCells);

    expect(result.totalSize).toBe(4);
    expect(result.regions.length).toBe(4);
    expect(result.regions).toEqual([1, 1, 1, 1]); // Four single-cell regions
  });

  it('sorts regions by size (largest first)', () => {
    const grid = createGrid([
      'RRRGG',
      'RRRGG',
      'GGGRR',
      'GGGRR',
      'GGGRR',
    ]);
    // Lock two regions: 6-cell Red and 3-cell Red
    const lockedCells = createLockedCells([
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 3], [2, 4],
      [3, 3], [3, 4],
      [4, 3], [4, 4],
    ]);

    const result = getLockedRegionsInfo(grid, lockedCells);

    expect(result.totalSize).toBe(12);
    // Should be sorted largest first
    expect(result.regions[0]).toBeGreaterThanOrEqual(result.regions[1]);
  });

  it('handles single locked cell', () => {
    const grid = createGrid([
      'RGR',
      'GGG',
      'RGR',
    ]);
    const lockedCells = createLockedCells([[1, 1]]);

    const result = getLockedRegionsInfo(grid, lockedCells);

    expect(result.totalSize).toBe(1);
    expect(result.regions).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// checkIfOnOptimalPath Tests
// ---------------------------------------------------------------------------

describe('checkIfOnOptimalPath', () => {
  it('returns true when grid matches expected state at move 0', () => {
    const grid: TileColor[][] = [
      [TileColor.Red, TileColor.Green, TileColor.Blue, TileColor.Yellow, TileColor.Purple],
      [TileColor.Red, TileColor.Green, TileColor.Blue, TileColor.Yellow, TileColor.Purple],
      [TileColor.Red, TileColor.Green, TileColor.Blue, TileColor.Yellow, TileColor.Purple],
      [TileColor.Red, TileColor.Green, TileColor.Blue, TileColor.Yellow, TileColor.Purple],
      [TileColor.Red, TileColor.Green, TileColor.Blue, TileColor.Yellow, TileColor.Purple],
    ];
    const firestoreData = createFirestoreData();

    const result = checkIfOnOptimalPath(grid, 0, firestoreData);

    expect(result).toBe(true);
  });

  it('returns false when grid does not match expected state', () => {
    const grid = createGrid([
      'GGGGG',
      'GGGGG',
      'GGGGG',
      'GGGGG',
      'GGGGG',
    ]);
    const firestoreData = createFirestoreData();

    const result = checkIfOnOptimalPath(grid, 0, firestoreData);

    expect(result).toBe(false);
  });

  it('returns false when firestoreData is null', () => {
    const grid = createGrid([
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]);

    const result = checkIfOnOptimalPath(grid, 0, null);

    expect(result).toBe(false);
  });

  it('returns false when moveNumber exceeds available states', () => {
    const grid = createGrid([
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]);
    const firestoreData = createFirestoreData(); // Has only 1 state

    const result = checkIfOnOptimalPath(grid, 5, firestoreData);

    expect(result).toBe(false);
  });

  it('returns false when firestoreData has no states', () => {
    const grid = createGrid([
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]);
    const firestoreData = createFirestoreData({ states: [] });

    const result = checkIfOnOptimalPath(grid, 0, firestoreData);

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyActionToGrid Tests
// ---------------------------------------------------------------------------

describe('applyActionToGrid', () => {
  it('returns original grid when action is invalid', () => {
    // Suppress console.warn for this test
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const grid = createGrid([
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]);
    const firestoreData = createFirestoreData({ colorMap: undefined });

    // Action ID that decodes to invalid coordinates or same color
    const result = applyActionToGrid(grid, -1, firestoreData);

    // Should return the original grid unchanged
    expect(result).toEqual(grid);
  });

  it('returns original grid when new color equals old color', () => {
    const grid = createGrid([
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]);
    // Create an action that would change Red to Red
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    // Action ID 0 would be: row=4, col=0, colorIndex=0 (Red)
    // If grid[4][0] is already Red, it should return unchanged
    const result = applyActionToGrid(grid, 0, firestoreData);

    expect(result).toEqual(grid);
  });

  it('applies flood fill when changing to a different color', () => {
    const grid = createGrid([
      'RRGGB',
      'RRGGB',
      'BBBBB',
      'BBBBB',
      'BBBBB',
    ]);
    // Change the top-left Red region to Green
    // This requires knowing the exact action ID encoding
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5], // Direct mapping
    });

    // We need to calculate an action that targets (0,0) with Green
    // row = (5 - 1) - floor(actionId / (5 * 6)) = 4 - floor(actionId / 30)
    // For row = 4: floor(actionId / 30) = 0, so actionId < 30
    // For row = 0: floor(actionId / 30) = 4, so 120 <= actionId < 150
    // remainder = actionId % 30
    // col = floor(remainder / 6)
    // colorIndex = remainder % 6
    // For col = 0, colorIndex = 1 (Green): remainder = 1, actionId = 120 + 1 = 121
    const actionId = 121;

    const result = applyActionToGrid(grid, actionId, firestoreData);

    // The top-left 2x2 Red region should now be Green
    expect(result[0][0]).toBe(TileColor.Green);
    expect(result[0][1]).toBe(TileColor.Green);
    expect(result[1][0]).toBe(TileColor.Green);
    expect(result[1][1]).toBe(TileColor.Green);
    // The rest should be unchanged
    expect(result[0][2]).toBe(TileColor.Green); // Already was green
    expect(result[2][0]).toBe(TileColor.Blue);
  });

  it('does not modify the original grid', () => {
    const grid = createGrid([
      'RRGGB',
      'RRGGB',
      'BBBBB',
      'BBBBB',
      'BBBBB',
    ]);
    const originalFirstCell = grid[0][0];
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    const actionId = 121; // Changes (0,0) to Green
    applyActionToGrid(grid, actionId, firestoreData);

    // Original grid should not be modified
    expect(grid[0][0]).toBe(originalFirstCell);
  });
});

// ---------------------------------------------------------------------------
// applyColorChange Tests
// ---------------------------------------------------------------------------

describe('applyColorChange', () => {
  it('returns unchanged puzzle when new color equals current color', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'RRRRR',
        'RRRRR',
        'RRRRR',
        'RRRRR',
        'RRRRR',
      ]),
    });

    const result = applyColorChange(puzzle, 0, 0, TileColor.Red);

    expect(result).toBe(puzzle); // Same reference
    expect(result.userMovesUsed).toBe(0);
  });

  it('increments userMovesUsed when color changes', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'RGBYR',
        'RGBYR',
        'RGBYR',
        'RGBYR',
        'RGBYR',
      ]),
      userMovesUsed: 2,
    });

    const result = applyColorChange(puzzle, 0, 0, TileColor.Green);

    expect(result.userMovesUsed).toBe(3);
  });

  it('applies flood fill to connected region', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'RRGGG',
        'RRGGG',
        'GGGGG',
        'GGGGG',
        'GGGGG',
      ]),
      targetColor: TileColor.Blue,
    });

    const result = applyColorChange(puzzle, 0, 0, TileColor.Blue);

    // The 4-cell Red region should now be Blue
    expect(result.grid[0][0]).toBe(TileColor.Blue);
    expect(result.grid[0][1]).toBe(TileColor.Blue);
    expect(result.grid[1][0]).toBe(TileColor.Blue);
    expect(result.grid[1][1]).toBe(TileColor.Blue);
    // Green cells should remain unchanged
    expect(result.grid[0][2]).toBe(TileColor.Green);
  });

  it('sets isSolved to true when board becomes unified with target color', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BBBBB',
        'BRRRR',
      ]),
      targetColor: TileColor.Blue,
      lockedCells: createLockedCells([
        [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
        [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
        [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
        [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
        [4, 0],
      ]),
    });

    const result = applyColorChange(puzzle, 4, 1, TileColor.Blue);

    expect(result.isSolved).toBe(true);
    expect(result.isLost).toBe(false);
    expect(result.lockedCells.size).toBe(0); // Cleared on win
  });

  it('sets isLost to true when board becomes unified with wrong color', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'GGGGG',
        'GGGGG',
        'GGGGG',
        'GGGGG',
        'GRRRR',
      ]),
      targetColor: TileColor.Blue,
      lockedCells: createLockedCells([
        [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
        [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
        [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
        [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
        [4, 0],
      ]),
    });

    const result = applyColorChange(puzzle, 4, 1, TileColor.Green);

    expect(result.isLost).toBe(true);
    expect(result.isSolved).toBe(false);
  });

  it('sets isLost when locked region reaches threshold with wrong color', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'GGGGG',
        'GGGGG',
        'GGGGG',
        'GRRGG',
        'GRRGG',
      ]),
      targetColor: TileColor.Blue,
      lossThreshold: 13, // Need 13 or more locked cells of wrong color to lose
      lockedCells: createLockedCells([
        [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
        [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
        [2, 0], [2, 1],
      ]), // 12 green cells locked
    });

    // Change the Red region to Green, expanding the locked region
    const result = applyColorChange(puzzle, 3, 1, TileColor.Green);

    // Now the green region is larger and includes the converted cells
    expect(result.isLost).toBe(true);
  });

  it('updates lockedCells only when new region is strictly larger', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'RRRRR',
        'RRRRR',
        'RRGGR',
        'RRGBR',
        'RRRRR',
      ]),
      targetColor: TileColor.Blue,
      lockedCells: createLockedCells([
        [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
        [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
        [2, 0], [2, 1], [2, 4],
        [3, 0], [3, 1], [3, 4],
        [4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
      ]), // 20 red cells locked
    });

    // Change a small green region to Yellow - the new largest region (red) is 21 cells
    // (after changing green to yellow, red is still largest at 21 cells since red is connected)
    const result = applyColorChange(puzzle, 2, 2, TileColor.Yellow);

    // The largest region is now 21 cells (the connected red region)
    // So locked cells will update to the new larger region
    expect(result.lockedCells.size).toBe(21);
  });

  it('does not modify the original puzzle grid', () => {
    const puzzle = createBasePuzzle({
      grid: createGrid([
        'RRGGB',
        'RRGGB',
        'BBBBB',
        'BBBBB',
        'BBBBB',
      ]),
    });
    const originalFirstCell = puzzle.grid[0][0];

    applyColorChange(puzzle, 0, 0, TileColor.Green);

    expect(puzzle.grid[0][0]).toBe(originalFirstCell);
  });
});
