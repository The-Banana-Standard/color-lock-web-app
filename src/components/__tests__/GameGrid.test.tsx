/**
 * Tests for GameGrid.tsx
 *
 * Covers:
 * - Rendering grids of different sizes
 * - Tile interactions
 * - Locked region display
 * - Hint highlighting
 * - CSS variable calculations
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GameGrid from '../GameGrid';
import { TileColor } from '../../types';
import { HintResult } from '../../utils/hintUtils';
import { AppSettings, defaultSettings } from '../../types/settings';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const mockGetColorCSS = (color: TileColor): string => {
  const colors: Record<TileColor, string> = {
    [TileColor.Red]: 'rgb(235, 78, 62)',
    [TileColor.Green]: 'rgb(101, 196, 102)',
    [TileColor.Blue]: 'rgb(52, 120, 247)',
    [TileColor.Yellow]: 'rgb(247, 206, 69)',
    [TileColor.Purple]: 'rgb(163, 7, 215)',
    [TileColor.Orange]: 'rgb(241, 154, 56)',
  };
  return colors[color] || '#ffffff';
};

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

function createSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...defaultSettings,
    ...overrides,
  };
}

interface GameGridTestProps {
  grid?: TileColor[][];
  lockedCells?: Set<string>;
  hintCell?: HintResult | null;
  settings?: AppSettings;
  onTileClick?: (row: number, col: number) => void;
  puzzleTargetColor?: TileColor;
}

function renderGameGrid(props: GameGridTestProps = {}) {
  const defaultProps = {
    grid: createGrid([
      'RGR',
      'GRG',
      'RGR',
    ]),
    lockedCells: new Set<string>(),
    hintCell: null,
    settings: createSettings(),
    onTileClick: vi.fn(),
    getColorCSS: mockGetColorCSS,
    puzzleTargetColor: TileColor.Blue,
    ...props,
  };

  return render(<GameGrid {...defaultProps} />);
}

// ---------------------------------------------------------------------------
// Rendering Tests
// ---------------------------------------------------------------------------

describe('GameGrid - Rendering', () => {
  it('renders a grid container', () => {
    renderGameGrid();

    const grid = document.querySelector('.grid');
    expect(grid).toBeInTheDocument();
  });

  it('renders the correct number of rows', () => {
    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
    });

    const rows = document.querySelectorAll('.grid-row');
    expect(rows.length).toBe(3);
  });

  it('renders the correct number of tiles', () => {
    renderGameGrid({
      grid: createGrid([
        'RGRG',
        'GRGR',
        'RGRG',
        'GRGR',
      ]),
    });

    const tiles = screen.getAllByRole('button');
    expect(tiles.length).toBe(16);
  });

  it('renders each tile with correct color', () => {
    renderGameGrid({
      grid: createGrid([
        'RG',
        'BY',
      ]),
    });

    const tiles = screen.getAllByRole('button');

    // Verify colors through aria-labels
    expect(tiles[0]).toHaveAttribute('aria-label', expect.stringContaining('Red'));
    expect(tiles[1]).toHaveAttribute('aria-label', expect.stringContaining('Green'));
    expect(tiles[2]).toHaveAttribute('aria-label', expect.stringContaining('Blue'));
    expect(tiles[3]).toHaveAttribute('aria-label', expect.stringContaining('Yellow'));
  });

  it('renders 5x5 grid correctly', () => {
    renderGameGrid({
      grid: createGrid([
        'RGBYR',
        'GBYRO',
        'BYROP',
        'YROPG',
        'ROPGB',
      ]),
    });

    const tiles = screen.getAllByRole('button');
    expect(tiles.length).toBe(25);
  });

  it('renders single cell grid', () => {
    renderGameGrid({
      grid: createGrid(['R']),
    });

    const tiles = screen.getAllByRole('button');
    expect(tiles.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CSS Variable Tests
// ---------------------------------------------------------------------------

describe('GameGrid - CSS Variables', () => {
  it('sets grid cell size CSS variable based on grid dimensions', () => {
    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
    });

    const grid = document.querySelector('.grid') as HTMLElement;
    expect(grid).toBeInTheDocument();
    expect(grid.style.getPropertyValue('--grid-cell-container-size')).toBeTruthy();
  });

  it('sets different cell sizes for different grid dimensions', () => {
    const { unmount: unmount3 } = renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
    });

    const grid3 = document.querySelector('.grid') as HTMLElement;
    const size3 = grid3.style.getPropertyValue('--grid-cell-container-size');

    unmount3();

    renderGameGrid({
      grid: createGrid([
        'RGBYP',
        'RGBYP',
        'RGBYP',
        'RGBYP',
        'RGBYP',
      ]),
    });

    const grid5 = document.querySelector('.grid') as HTMLElement;
    const size5 = grid5.style.getPropertyValue('--grid-cell-container-size');

    // 5x5 should have smaller cells than 3x3
    expect(parseFloat(size5)).toBeLessThan(parseFloat(size3));
  });

  it('includes margin CSS variable', () => {
    renderGameGrid();

    const grid = document.querySelector('.grid') as HTMLElement;
    expect(grid.style.getPropertyValue('--grid-cell-margin')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Locked Cells Tests
// ---------------------------------------------------------------------------

describe('GameGrid - Locked Cells', () => {
  it('marks tiles as locked when in lockedCells set', () => {
    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
      lockedCells: createLockedCells([[0, 0], [1, 1], [2, 2]]),
    });

    const tiles = screen.getAllByRole('button');

    // Check locked tiles have lock icon
    expect(tiles[0].querySelector('.lock-icon')).toBeInTheDocument();
    expect(tiles[4].querySelector('.lock-icon')).toBeInTheDocument();
    expect(tiles[8].querySelector('.lock-icon')).toBeInTheDocument();

    // Check unlocked tiles don't have lock icon
    expect(tiles[1].querySelector('.lock-icon')).not.toBeInTheDocument();
    expect(tiles[2].querySelector('.lock-icon')).not.toBeInTheDocument();
  });

  it('highlights locked cells when highlightLargestRegion is enabled', () => {
    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
      lockedCells: createLockedCells([[0, 0], [0, 2]]),
      settings: createSettings({ highlightLargestRegion: true }),
    });

    const tiles = screen.getAllByRole('button');

    // Locked tiles should have highlight class
    expect(tiles[0]).toHaveClass('highlight-largest-region');
    expect(tiles[2]).toHaveClass('highlight-largest-region');

    // Unlocked tiles should not
    expect(tiles[1]).not.toHaveClass('highlight-largest-region');
  });

  it('does not highlight locked cells when highlightLargestRegion is disabled', () => {
    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
      lockedCells: createLockedCells([[0, 0], [0, 2]]),
      settings: createSettings({ highlightLargestRegion: false }),
    });

    const tiles = screen.getAllByRole('button');

    // No tiles should have highlight class
    expect(tiles[0]).not.toHaveClass('highlight-largest-region');
    expect(tiles[2]).not.toHaveClass('highlight-largest-region');
  });
});

// ---------------------------------------------------------------------------
// Hint Tests
// ---------------------------------------------------------------------------

describe('GameGrid - Hint Display', () => {
  const hintCell: HintResult = {
    row: 1,
    col: 1,
    newColor: TileColor.Blue,
    valid: true,
    connectedCells: [[1, 1], [0, 1], [2, 1]],
  };

  it('marks primary hint cell with hint class', () => {
    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
      hintCell,
    });

    const tiles = screen.getAllByRole('button');

    // Center tile (1,1) is the primary hint cell
    expect(tiles[4]).toHaveClass('hint-cell');
    expect(tiles[4]).toHaveClass('primary-hint-cell');
  });

  it('marks connected cells with hint class but not primary', () => {
    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
      hintCell,
    });

    const tiles = screen.getAllByRole('button');

    // Connected cells at (0,1) and (2,1)
    expect(tiles[1]).toHaveClass('hint-cell');
    expect(tiles[1]).not.toHaveClass('primary-hint-cell');

    expect(tiles[7]).toHaveClass('hint-cell');
    expect(tiles[7]).not.toHaveClass('primary-hint-cell');
  });

  it('does not mark non-hint cells', () => {
    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
      hintCell,
    });

    const tiles = screen.getAllByRole('button');

    // Corners should not be hinted
    expect(tiles[0]).not.toHaveClass('hint-cell');
    expect(tiles[2]).not.toHaveClass('hint-cell');
    expect(tiles[6]).not.toHaveClass('hint-cell');
    expect(tiles[8]).not.toHaveClass('hint-cell');
  });

  it('handles null hintCell', () => {
    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
      hintCell: null,
    });

    const tiles = screen.getAllByRole('button');

    // No tiles should be hinted
    for (const tile of tiles) {
      expect(tile).not.toHaveClass('hint-cell');
    }
  });

  it('handles hintCell without connectedCells', () => {
    const singleHint: HintResult = {
      row: 0,
      col: 0,
      newColor: TileColor.Blue,
      valid: true,
      // No connectedCells property
    };

    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
      hintCell: singleHint,
    });

    const tiles = screen.getAllByRole('button');

    // Only primary cell should be hinted
    expect(tiles[0]).toHaveClass('hint-cell');
    expect(tiles[0]).toHaveClass('primary-hint-cell');

    // Others should not
    expect(tiles[1]).not.toHaveClass('hint-cell');
  });
});

// ---------------------------------------------------------------------------
// Click Handler Tests
// ---------------------------------------------------------------------------

describe('GameGrid - Click Handlers', () => {
  it('calls onTileClick with correct coordinates when tile is clicked', () => {
    const onTileClick = vi.fn();

    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
      onTileClick,
    });

    const tiles = screen.getAllByRole('button');

    // Click center tile (1, 1)
    fireEvent.click(tiles[4]);

    expect(onTileClick).toHaveBeenCalledTimes(1);
    expect(onTileClick).toHaveBeenCalledWith(1, 1);
  });

  it('calls onTileClick with correct coordinates for different tiles', () => {
    const onTileClick = vi.fn();

    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
      onTileClick,
    });

    const tiles = screen.getAllByRole('button');

    // Click each tile and verify coordinates
    fireEvent.click(tiles[0]); // (0, 0)
    expect(onTileClick).toHaveBeenLastCalledWith(0, 0);

    fireEvent.click(tiles[2]); // (0, 2)
    expect(onTileClick).toHaveBeenLastCalledWith(0, 2);

    fireEvent.click(tiles[6]); // (2, 0)
    expect(onTileClick).toHaveBeenLastCalledWith(2, 0);

    fireEvent.click(tiles[8]); // (2, 2)
    expect(onTileClick).toHaveBeenLastCalledWith(2, 2);
  });

  it('allows clicking on locked tiles', () => {
    const onTileClick = vi.fn();

    renderGameGrid({
      grid: createGrid([
        'RGR',
        'GRG',
        'RGR',
      ]),
      lockedCells: createLockedCells([[1, 1]]),
      onTileClick,
    });

    const tiles = screen.getAllByRole('button');

    // Click locked center tile
    fireEvent.click(tiles[4]);

    expect(onTileClick).toHaveBeenCalledTimes(1);
    expect(onTileClick).toHaveBeenCalledWith(1, 1);
  });
});

// ---------------------------------------------------------------------------
// Keyboard Navigation Tests
// ---------------------------------------------------------------------------

describe('GameGrid - Keyboard Navigation', () => {
  it('allows keyboard interaction with tiles', () => {
    const onTileClick = vi.fn();

    renderGameGrid({
      grid: createGrid([
        'RG',
        'BR',
      ]),
      onTileClick,
    });

    const tiles = screen.getAllByRole('button');

    // Keyboard interaction on first tile
    fireEvent.keyDown(tiles[0], { key: 'Enter' });

    expect(onTileClick).toHaveBeenCalledTimes(1);
    expect(onTileClick).toHaveBeenCalledWith(0, 0);
  });

  it('all tiles are focusable', () => {
    renderGameGrid({
      grid: createGrid([
        'RGB',
        'YPO',
      ]),
    });

    const tiles = screen.getAllByRole('button');

    for (const tile of tiles) {
      expect(tile).toHaveAttribute('tabIndex', '0');
    }
  });
});

// ---------------------------------------------------------------------------
// Edge Cases Tests
// ---------------------------------------------------------------------------

describe('GameGrid - Edge Cases', () => {
  it('handles 1x1 grid', () => {
    renderGameGrid({
      grid: [[TileColor.Red]],
    });

    const tiles = screen.getAllByRole('button');
    expect(tiles.length).toBe(1);
  });

  it('handles rectangular grid (non-square)', () => {
    renderGameGrid({
      grid: createGrid([
        'RGBYO',
        'RGBYO',
        'RGBYO',
      ]),
    });

    const tiles = screen.getAllByRole('button');
    expect(tiles.length).toBe(15);

    const rows = document.querySelectorAll('.grid-row');
    expect(rows.length).toBe(3);
  });

  it('handles all six colors', () => {
    renderGameGrid({
      grid: createGrid([
        'RGB',
        'YPO',
      ]),
    });

    const tiles = screen.getAllByRole('button');

    expect(tiles[0]).toHaveAttribute('aria-label', expect.stringContaining('Red'));
    expect(tiles[1]).toHaveAttribute('aria-label', expect.stringContaining('Green'));
    expect(tiles[2]).toHaveAttribute('aria-label', expect.stringContaining('Blue'));
    expect(tiles[3]).toHaveAttribute('aria-label', expect.stringContaining('Yellow'));
    expect(tiles[4]).toHaveAttribute('aria-label', expect.stringContaining('Purple'));
    expect(tiles[5]).toHaveAttribute('aria-label', expect.stringContaining('Orange'));
  });

  it('handles empty locked cells set', () => {
    renderGameGrid({
      grid: createGrid([
        'RG',
        'BR',
      ]),
      lockedCells: new Set<string>(),
    });

    const tiles = screen.getAllByRole('button');

    for (const tile of tiles) {
      expect(tile.querySelector('.lock-icon')).not.toBeInTheDocument();
    }
  });

  it('handles all cells locked', () => {
    renderGameGrid({
      grid: createGrid([
        'RG',
        'BR',
      ]),
      lockedCells: createLockedCells([
        [0, 0], [0, 1],
        [1, 0], [1, 1],
      ]),
    });

    const tiles = screen.getAllByRole('button');

    for (const tile of tiles) {
      expect(tile.querySelector('.lock-icon')).toBeInTheDocument();
    }
  });

  it('passes puzzleTargetColor to tiles', () => {
    renderGameGrid({
      grid: createGrid([
        'RG',
        'BR',
      ]),
      puzzleTargetColor: TileColor.Blue,
    });

    // Component should render without errors
    const tiles = screen.getAllByRole('button');
    expect(tiles.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('GameGrid - Integration', () => {
  it('handles complex state with locked cells and hints', () => {
    const hintCell: HintResult = {
      row: 1,
      col: 0,
      newColor: TileColor.Blue,
      valid: true,
      connectedCells: [[1, 0], [2, 0]],
    };

    renderGameGrid({
      grid: createGrid([
        'RRR',
        'GGG',
        'GRR',
      ]),
      lockedCells: createLockedCells([[0, 0], [0, 1], [0, 2]]),
      hintCell,
      settings: createSettings({ highlightLargestRegion: true }),
    });

    const tiles = screen.getAllByRole('button');

    // Top row should be locked and highlighted
    expect(tiles[0]).toHaveClass('locked');
    expect(tiles[0]).toHaveClass('highlight-largest-region');
    expect(tiles[1]).toHaveClass('locked');
    expect(tiles[2]).toHaveClass('locked');

    // Middle left should be primary hint
    expect(tiles[3]).toHaveClass('hint-cell');
    expect(tiles[3]).toHaveClass('primary-hint-cell');

    // Bottom left should be connected hint
    expect(tiles[6]).toHaveClass('hint-cell');
    expect(tiles[6]).not.toHaveClass('primary-hint-cell');

    // Other cells should be normal
    expect(tiles[4]).not.toHaveClass('hint-cell');
    expect(tiles[4]).not.toHaveClass('locked');
  });
});
