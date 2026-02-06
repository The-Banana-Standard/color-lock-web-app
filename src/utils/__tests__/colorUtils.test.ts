/**
 * Tests for colorUtils.ts
 *
 * Covers:
 * - getAdjustedColorCSS: get CSS color based on accessibility settings
 * - getColorCSS: wrapper for getAdjustedColorCSS
 * - getLockedSquaresColor: get the color of locked squares
 * - getLockedColorCSS: get CSS color for locked region counter
 */

import { describe, it, expect } from 'vitest';
import {
  getAdjustedColorCSS,
  getColorCSS,
  getLockedSquaresColor,
  getLockedColorCSS,
} from '../colorUtils';
import { TileColor } from '../../types';
import { ColorBlindMode, AppSettings, defaultSettings } from '../../types/settings';
import { DifficultyLevel } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Test Data Helpers
// ---------------------------------------------------------------------------

function createSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...defaultSettings,
    ...overrides,
  };
}

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

// ---------------------------------------------------------------------------
// getAdjustedColorCSS Tests
// ---------------------------------------------------------------------------

describe('getAdjustedColorCSS', () => {
  describe('with no accessibility settings', () => {
    it('returns default color for Red', () => {
      const settings = createSettings();
      const result = getAdjustedColorCSS(TileColor.Red, settings);
      expect(result).toBe('rgb(235,78,62)');
    });

    it('returns default color for Green', () => {
      const settings = createSettings();
      const result = getAdjustedColorCSS(TileColor.Green, settings);
      expect(result).toBe('rgb(101,196,102)');
    });

    it('returns default color for Blue', () => {
      const settings = createSettings();
      const result = getAdjustedColorCSS(TileColor.Blue, settings);
      expect(result).toBe('rgb(52,120,247)');
    });

    it('returns default color for Yellow', () => {
      const settings = createSettings();
      const result = getAdjustedColorCSS(TileColor.Yellow, settings);
      expect(result).toBe('rgb(247,206,69)');
    });

    it('returns default color for Purple', () => {
      const settings = createSettings();
      const result = getAdjustedColorCSS(TileColor.Purple, settings);
      expect(result).toBe('rgb(163,7,215)');
    });

    it('returns default color for Orange', () => {
      const settings = createSettings();
      const result = getAdjustedColorCSS(TileColor.Orange, settings);
      expect(result).toBe('rgb(241,154,56)');
    });
  });

  describe('with custom color scheme', () => {
    it('returns custom color when specified', () => {
      const settings = createSettings({
        customColorScheme: {
          [TileColor.Red]: '#ff0000',
        },
      });

      const result = getAdjustedColorCSS(TileColor.Red, settings);

      expect(result).toBe('#ff0000');
    });

    it('returns default for colors not in custom scheme', () => {
      const settings = createSettings({
        customColorScheme: {
          [TileColor.Red]: '#ff0000',
        },
      });

      const result = getAdjustedColorCSS(TileColor.Green, settings);

      expect(result).toBe('rgb(101,196,102)');
    });

    it('custom scheme takes priority over color blind mode', () => {
      const settings = createSettings({
        colorBlindMode: ColorBlindMode.Protanopia,
        customColorScheme: {
          [TileColor.Red]: '#custom-red',
        },
      });

      const result = getAdjustedColorCSS(TileColor.Red, settings);

      expect(result).toBe('#custom-red');
    });
  });

  describe('with Protanopia color blind mode', () => {
    it('returns gray for Red', () => {
      const settings = createSettings({
        colorBlindMode: ColorBlindMode.Protanopia,
      });

      const result = getAdjustedColorCSS(TileColor.Red, settings);

      expect(result).toBe('#a0a0a0');
    });

    it('returns yellow-ish for Green', () => {
      const settings = createSettings({
        colorBlindMode: ColorBlindMode.Protanopia,
      });

      const result = getAdjustedColorCSS(TileColor.Green, settings);

      expect(result).toBe('#f5f5a0');
    });

    it('returns modified blue', () => {
      const settings = createSettings({
        colorBlindMode: ColorBlindMode.Protanopia,
      });

      const result = getAdjustedColorCSS(TileColor.Blue, settings);

      expect(result).toBe('rgb(52,120,247)');
    });
  });

  describe('with Deuteranopia color blind mode', () => {
    it('returns gray for Green', () => {
      const settings = createSettings({
        colorBlindMode: ColorBlindMode.Deuteranopia,
      });

      const result = getAdjustedColorCSS(TileColor.Green, settings);

      expect(result).toBe('#a0a0a0');
    });

    it('returns red-ish for Orange', () => {
      const settings = createSettings({
        colorBlindMode: ColorBlindMode.Deuteranopia,
      });

      const result = getAdjustedColorCSS(TileColor.Orange, settings);

      expect(result).toBe('rgb(235,78,62)');
    });
  });

  describe('with Tritanopia color blind mode', () => {
    it('returns gray for Blue', () => {
      const settings = createSettings({
        colorBlindMode: ColorBlindMode.Tritanopia,
      });

      const result = getAdjustedColorCSS(TileColor.Blue, settings);

      expect(result).toBe('#a0a0a0');
    });

    it('returns red-ish for Yellow', () => {
      const settings = createSettings({
        colorBlindMode: ColorBlindMode.Tritanopia,
      });

      const result = getAdjustedColorCSS(TileColor.Yellow, settings);

      expect(result).toBe('rgb(235,78,62)');
    });
  });

  describe('with high contrast mode', () => {
    it('returns same colors (high contrast is not currently differentiated)', () => {
      const settings = createSettings({
        highContrastMode: true,
      });

      // Currently, high contrast mode returns the same values as non-high-contrast
      expect(getAdjustedColorCSS(TileColor.Red, settings)).toBe('rgb(235,78,62)');
      expect(getAdjustedColorCSS(TileColor.Green, settings)).toBe('rgb(101,196,102)');
    });
  });
});

// ---------------------------------------------------------------------------
// getColorCSS Tests
// ---------------------------------------------------------------------------

describe('getColorCSS', () => {
  it('delegates to getAdjustedColorCSS', () => {
    const settings = createSettings({
      customColorScheme: {
        [TileColor.Blue]: '#0000ff',
      },
    });

    const result = getColorCSS(TileColor.Blue, settings);

    expect(result).toBe('#0000ff');
  });

  it('returns correct default color', () => {
    const settings = createSettings();

    const result = getColorCSS(TileColor.Purple, settings);

    expect(result).toBe('rgb(163,7,215)');
  });
});

// ---------------------------------------------------------------------------
// getLockedSquaresColor Tests
// ---------------------------------------------------------------------------

describe('getLockedSquaresColor', () => {
  it('returns null when no locked cells', () => {
    const grid = createGrid([
      'RRR',
      'GGG',
      'BBB',
    ]);
    const lockedCells = new Set<string>();

    const result = getLockedSquaresColor(grid, lockedCells);

    expect(result).toBeNull();
  });

  it('returns null when lockedCells is undefined', () => {
    const grid = createGrid([
      'RRR',
      'GGG',
      'BBB',
    ]);

    // @ts-expect-error Testing undefined case
    const result = getLockedSquaresColor(grid, undefined);

    expect(result).toBeNull();
  });

  it('returns the color of the first locked cell', () => {
    const grid = createGrid([
      'RGR',
      'GRG',
      'RGR',
    ]);
    const lockedCells = createLockedCells([[1, 1]]);

    const result = getLockedSquaresColor(grid, lockedCells);

    expect(result).toBe(TileColor.Red);
  });

  it('returns color from first cell when multiple cells are locked', () => {
    const grid = createGrid([
      'RRR',
      'RRR',
      'RRR',
    ]);
    const lockedCells = createLockedCells([
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
    ]);

    const result = getLockedSquaresColor(grid, lockedCells);

    // Should return the color of the first locked cell
    expect(result).toBe(TileColor.Red);
  });

  it('works with all six tile colors', () => {
    const colors = [
      { pattern: 'R', expected: TileColor.Red },
      { pattern: 'G', expected: TileColor.Green },
      { pattern: 'B', expected: TileColor.Blue },
      { pattern: 'Y', expected: TileColor.Yellow },
      { pattern: 'P', expected: TileColor.Purple },
      { pattern: 'O', expected: TileColor.Orange },
    ];

    for (const { pattern, expected } of colors) {
      const grid = createGrid([pattern]);
      const lockedCells = createLockedCells([[0, 0]]);

      const result = getLockedSquaresColor(grid, lockedCells);

      expect(result).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// getLockedColorCSS Tests
// ---------------------------------------------------------------------------

describe('getLockedColorCSS', () => {
  it('returns white when no locked cells', () => {
    const grid = createGrid([
      'RRR',
      'GGG',
      'BBB',
    ]);
    const lockedCells = new Set<string>();
    const settings = createSettings();

    const result = getLockedColorCSS(grid, lockedCells, settings);

    expect(result).toBe('#ffffff');
  });

  it('returns CSS color of locked region', () => {
    const grid = createGrid([
      'RRR',
      'RRR',
      'RRR',
    ]);
    const lockedCells = createLockedCells([[0, 0]]);
    const settings = createSettings();

    const result = getLockedColorCSS(grid, lockedCells, settings);

    expect(result).toBe('rgb(235,78,62)'); // Red
  });

  it('respects color blind mode for locked color', () => {
    const grid = createGrid([
      'RRR',
      'RRR',
      'RRR',
    ]);
    const lockedCells = createLockedCells([[0, 0]]);
    const settings = createSettings({
      colorBlindMode: ColorBlindMode.Protanopia,
    });

    const result = getLockedColorCSS(grid, lockedCells, settings);

    expect(result).toBe('#a0a0a0'); // Gray for protanopia
  });

  it('respects custom color scheme for locked color', () => {
    const grid = createGrid([
      'BBB',
      'BBB',
      'BBB',
    ]);
    const lockedCells = createLockedCells([[1, 1]]);
    const settings = createSettings({
      customColorScheme: {
        [TileColor.Blue]: '#123456',
      },
    });

    const result = getLockedColorCSS(grid, lockedCells, settings);

    expect(result).toBe('#123456');
  });
});
