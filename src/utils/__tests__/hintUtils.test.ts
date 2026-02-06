/**
 * Tests for hintUtils.ts
 *
 * Covers:
 * - NUM_COLORS constant
 * - decodeActionId: decode action ID to row, col, color
 * - getHint: get hint for current move number
 * - encodeAction: encode row, col, color to action ID
 * - computeActionDifference: evaluate action quality
 * - getValidActions: get list of valid actions
 */

import { describe, it, expect } from 'vitest';
import {
  NUM_COLORS,
  decodeActionId,
  getHint,
  encodeAction,
  computeActionDifference,
  getValidActions,
} from '../hintUtils';
import { TileColor, FirestorePuzzleData } from '../../types';

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
    actions: [42, 67, 89, 120, 145],
    colorMap: [0, 1, 2, 3, 4, 5],
    ...overrides,
  };
}

function createLockedCells(coords: [number, number][]): Set<string> {
  return new Set(coords.map(([r, c]) => `${r},${c}`));
}

// ---------------------------------------------------------------------------
// NUM_COLORS Tests
// ---------------------------------------------------------------------------

describe('NUM_COLORS', () => {
  it('equals 6', () => {
    expect(NUM_COLORS).toBe(6);
  });

  it('matches the number of TileColor enum values', () => {
    const tileColorValues = Object.values(TileColor);
    expect(NUM_COLORS).toBe(tileColorValues.length);
  });
});

// ---------------------------------------------------------------------------
// decodeActionId Tests
// ---------------------------------------------------------------------------

describe('decodeActionId', () => {
  it('returns row, col, newColor for a valid action', () => {
    const firestoreData = createFirestoreData();

    // Action ID 0: row = 4 - floor(0/30) = 4, remainder = 0, col = 0, colorIndex = 0
    const result = decodeActionId(0, firestoreData);

    expect(result.row).toBe(4);
    expect(result.col).toBe(0);
    expect(result.valid).toBe(true);
  });

  it('correctly decodes action for different rows', () => {
    const firestoreData = createFirestoreData();

    // For 5x5 grid: actionId / 30 gives row offset from bottom
    // row = 4 - floor(actionId / 30)
    // actionId = 30 -> row = 4 - 1 = 3
    const result = decodeActionId(30, firestoreData);

    expect(result.row).toBe(3);
    expect(result.valid).toBe(true);
  });

  it('correctly decodes action for different columns', () => {
    const firestoreData = createFirestoreData();

    // remainder = actionId % 30
    // col = floor(remainder / 6)
    // actionId = 6 -> remainder = 6, col = 1
    const result = decodeActionId(6, firestoreData);

    expect(result.col).toBe(1);
    expect(result.row).toBe(4);
    expect(result.valid).toBe(true);
  });

  it('correctly decodes color using colorMap', () => {
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5], // Direct mapping
    });

    // colorIndex = remainder % 6
    // actionId = 1 -> colorIndex = 1 -> Green
    const result = decodeActionId(1, firestoreData);

    expect(result.newColor).toBe(TileColor.Green);
  });

  it('handles colorMap remapping', () => {
    const firestoreData = createFirestoreData({
      colorMap: [5, 4, 3, 2, 1, 0], // Reversed mapping
    });

    // actionId = 0 -> colorIndex = 0
    // colorMap.indexOf(0) = 5 -> color at index 5
    const result = decodeActionId(0, firestoreData);

    // This tests the reverse lookup: colorMap.indexOf(0) = 5 (last position)
    expect(result.newColor).toBe(TileColor.Orange);
  });

  it('falls back to direct mapping when colorMap not provided', () => {
    const firestoreData = createFirestoreData({
      colorMap: undefined,
    });

    const result = decodeActionId(0, firestoreData);

    // Direct mapping: colorIndex 0 = first TileColor value
    expect(result.newColor).toBe(TileColor.Red);
  });

  it('marks action as invalid when row is out of bounds', () => {
    const firestoreData = createFirestoreData();

    // Very large action ID would produce negative row
    const result = decodeActionId(999, firestoreData);

    // row = 4 - floor(999/30) = 4 - 33 = -29
    expect(result.valid).toBe(false);
  });

  it('handles grid size from states array', () => {
    const firestoreData = createFirestoreData({
      states: [
        {
          '0': [TileColor.Red, TileColor.Green, TileColor.Blue],
          '1': [TileColor.Red, TileColor.Green, TileColor.Blue],
          '2': [TileColor.Red, TileColor.Green, TileColor.Blue],
        },
      ],
    });

    // 3x3 grid: actionId / (3*6) = actionId / 18 gives row offset
    const result = decodeActionId(0, firestoreData);

    // For 3x3: row = 2 - floor(0/18) = 2
    expect(result.row).toBe(2);
    expect(result.valid).toBe(true);
  });

  it('defaults to grid size 5 when states not available', () => {
    const firestoreData = createFirestoreData({
      states: [],
    });

    const result = decodeActionId(0, firestoreData);

    // Should use default 5x5 grid size
    expect(result.row).toBe(4);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getHint Tests
// ---------------------------------------------------------------------------

describe('getHint', () => {
  it('returns hint for move 0', () => {
    const firestoreData = createFirestoreData({
      actions: [42, 67, 89],
    });

    const result = getHint(firestoreData, 0);

    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
  });

  it('returns null when firestoreData is null', () => {
    // @ts-expect-error Testing null case
    const result = getHint(null, 0);

    expect(result).toBeNull();
  });

  it('returns null when moveNumber exceeds actions array', () => {
    const firestoreData = createFirestoreData({
      actions: [42, 67], // Only 2 actions
    });

    const result = getHint(firestoreData, 5);

    expect(result).toBeNull();
  });

  it('returns null when actions array is empty', () => {
    const firestoreData = createFirestoreData({
      actions: [],
    });

    const result = getHint(firestoreData, 0);

    expect(result).toBeNull();
  });

  it('returns null when actions array is undefined', () => {
    const firestoreData = createFirestoreData({
      // @ts-expect-error Testing undefined case
      actions: undefined,
    });

    const result = getHint(firestoreData, 0);

    expect(result).toBeNull();
  });

  it('returns correct hint for each move number', () => {
    const firestoreData = createFirestoreData({
      actions: [0, 30, 60], // Different row positions
    });

    const hint0 = getHint(firestoreData, 0);
    const hint1 = getHint(firestoreData, 1);
    const hint2 = getHint(firestoreData, 2);

    expect(hint0!.row).toBe(4);
    expect(hint1!.row).toBe(3);
    expect(hint2!.row).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// encodeAction Tests
// ---------------------------------------------------------------------------

describe('encodeAction', () => {
  it('encodes row, col, color to action ID', () => {
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    // Encode (4, 0, Red) should give action ID 0
    const result = encodeAction(4, 0, TileColor.Red, firestoreData, 5);

    expect(result).toBe(0);
  });

  it('round-trips with decodeActionId', () => {
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    const row = 2;
    const col = 3;
    const color = TileColor.Blue;

    const encoded = encodeAction(row, col, color, firestoreData, 5);
    const decoded = decodeActionId(encoded, firestoreData);

    expect(decoded.row).toBe(row);
    expect(decoded.col).toBe(col);
    expect(decoded.newColor).toBe(color);
  });

  it('handles all tile colors', () => {
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    const colors = Object.values(TileColor);

    for (const color of colors) {
      const encoded = encodeAction(0, 0, color, firestoreData, 5);
      const decoded = decodeActionId(encoded, firestoreData);

      expect(decoded.newColor).toBe(color);
    }
  });

  it('encodes different grid positions correctly', () => {
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    // Test corners of 5x5 grid
    const positions = [
      { row: 0, col: 0 },
      { row: 0, col: 4 },
      { row: 4, col: 0 },
      { row: 4, col: 4 },
      { row: 2, col: 2 }, // Center
    ];

    for (const { row, col } of positions) {
      const encoded = encodeAction(row, col, TileColor.Red, firestoreData, 5);
      const decoded = decodeActionId(encoded, firestoreData);

      expect(decoded.row).toBe(row);
      expect(decoded.col).toBe(col);
    }
  });

  it('applies colorMap for encoding', () => {
    const firestoreData = createFirestoreData({
      colorMap: [5, 4, 3, 2, 1, 0], // Reversed
    });

    // When encoding, should use the colorMap value
    const result = encodeAction(4, 0, TileColor.Red, firestoreData, 5);

    // Red is at index 0, colorMap[0] = 5, so colorIndex should be 5
    expect(result % 6).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// getValidActions Tests
// ---------------------------------------------------------------------------

describe('getValidActions', () => {
  it('excludes actions on locked cells', () => {
    const grid = createGrid([
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]);
    const lockedCells = createLockedCells([[0, 0], [0, 1]]);
    const firestoreData = createFirestoreData();

    const validActions = getValidActions(grid, lockedCells, firestoreData);

    // Check that no action targets locked cells
    for (const actionId of validActions) {
      const decoded = decodeActionId(actionId, firestoreData);
      const key = `${decoded.row},${decoded.col}`;
      expect(lockedCells.has(key)).toBe(false);
    }
  });

  it('excludes no-op actions (same color)', () => {
    const grid = createGrid([
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]);
    const lockedCells = new Set<string>();
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    const validActions = getValidActions(grid, lockedCells, firestoreData);

    // Check that no action changes a cell to its current color
    for (const actionId of validActions) {
      const decoded = decodeActionId(actionId, firestoreData);
      const currentColor = grid[decoded.row][decoded.col];
      expect(decoded.newColor).not.toBe(currentColor);
    }
  });

  it('returns actions for all 5 colors on each unlocked cell', () => {
    const grid = createGrid([
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]);
    const lockedCells = new Set<string>();
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    const validActions = getValidActions(grid, lockedCells, firestoreData);

    // 25 cells * 5 valid colors each (excluding current Red) = 125 actions
    expect(validActions.length).toBe(125);
  });

  it('handles grid with mixed colors', () => {
    const grid = createGrid([
      'RGBYR',
      'RGBYR',
      'RGBYR',
      'RGBYR',
      'RGBYR',
    ]);
    const lockedCells = new Set<string>();
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    const validActions = getValidActions(grid, lockedCells, firestoreData);

    // Each cell can change to 5 other colors
    // 25 cells * 5 = 125
    expect(validActions.length).toBe(125);
  });

  it('returns empty array when all cells are locked', () => {
    const grid = createGrid([
      'RR',
      'RR',
    ]);
    const lockedCells = createLockedCells([
      [0, 0], [0, 1],
      [1, 0], [1, 1],
    ]);

    // Create firestore data for 2x2 grid
    const firestoreData = createFirestoreData({
      states: [
        {
          '0': [TileColor.Red, TileColor.Red],
          '1': [TileColor.Red, TileColor.Red],
        },
      ],
    });

    const validActions = getValidActions(grid, lockedCells, firestoreData);

    expect(validActions.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeActionDifference Tests
// ---------------------------------------------------------------------------

describe('computeActionDifference', () => {
  it('returns negative value for invalid action', () => {
    const grid = createGrid([
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]);
    const lockedCells = createLockedCells([[0, 0]]);
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    // Action that targets locked cell
    // For (0, 0) with color 1: actionId = (4-0)*30 + 0*6 + 1 = 121
    const result = computeActionDifference(
      grid,
      lockedCells,
      TileColor.Blue,
      121,
      firestoreData
    );

    expect(result).toBe(-999999);
  });

  it('returns negative value for no-op action', () => {
    const grid = createGrid([
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]);
    const lockedCells = new Set<string>();
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    // Action that changes Red to Red (no-op)
    // For (4, 0) with color 0 (Red): actionId = 0
    const result = computeActionDifference(
      grid,
      lockedCells,
      TileColor.Blue,
      0,
      firestoreData
    );

    expect(result).toBe(-999999);
  });

  it('returns negative value when result exceeds loss threshold with wrong color', () => {
    const grid = createGrid([
      'GGGGG',
      'GGGGG',
      'GGGGG',
      'GRRGG',
      'GRRGG',
    ]);
    const lockedCells = createLockedCells([
      [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
      [2, 0], [2, 1], [2, 2],
    ]);
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    // Changing red to green would create a large green region
    // Target is Blue, so green is wrong
    // Action for (3, 1) to Green: actionId = (4-3)*30 + 1*6 + 1 = 37
    const result = computeActionDifference(
      grid,
      lockedCells,
      TileColor.Blue,
      37,
      firestoreData,
      13 // Loss threshold
    );

    expect(result).toBe(-999999);
  });

  it('returns positive value for good action', () => {
    const grid = createGrid([
      'BBBBB',
      'BBBBB',
      'BBBBB',
      'BRRRB',
      'BBBBB',
    ]);
    const lockedCells = new Set<string>();
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    // Changing red to blue would merge with surrounding blues
    // This should be a good action
    // Action for (3, 1) to Blue: actionId = (4-3)*30 + 1*6 + 2 = 38
    const result = computeActionDifference(
      grid,
      lockedCells,
      TileColor.Blue,
      38,
      firestoreData
    );

    // Should be positive as we're merging regions
    expect(result).toBeGreaterThan(0);
  });

  it('handles out of bounds action', () => {
    const grid = createGrid([
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
      'RRRRR',
    ]);
    const lockedCells = new Set<string>();
    const firestoreData = createFirestoreData({
      colorMap: [0, 1, 2, 3, 4, 5],
    });

    // Very large action ID resulting in out of bounds coordinates
    const result = computeActionDifference(
      grid,
      lockedCells,
      TileColor.Blue,
      9999,
      firestoreData
    );

    expect(result).toBe(-999999);
  });
});
