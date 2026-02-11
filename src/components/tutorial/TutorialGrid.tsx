/**
 * TutorialGrid Component
 *
 * A 3x3 grid display for the tutorial puzzle.
 * Supports both watch phase (demo) and try phase (interactive) modes.
 */

import React from 'react';
import { TileColor } from '../../types';
import TutorialTile from './TutorialTile';
import { TUTORIAL_GRID_SIZE } from '../../contexts/tutorialConfig';

interface TutorialGridProps {
  /** The grid state to display */
  grid: TileColor[][];
  /** Set of locked cell keys ("row,col" format) */
  lockedCells: Set<string>;
  /** Position of highlighted tile (legacy single-cell watch highlight) */
  highlightedTile?: { row: number; col: number } | null;
  /** Set of highlighted cell keys ("row,col" format) */
  highlightedCells?: Set<string>;
  /** Color used for highlighted region border */
  highlightColor?: string;
  /** Position of selected tile (try phase) */
  selectedTile?: { row: number; col: number } | null;
  /** Click handler for tiles */
  onTileClick?: (row: number, col: number) => void;
  /** Function to get CSS color value */
  getColorCSS: (color: TileColor) => string;
  /** Whether tiles are interactive */
  interactive?: boolean;
  /** Total grid size in pixels (default 220px) */
  gridSize?: number;
}

const TutorialGrid: React.FC<TutorialGridProps> = ({
  grid,
  lockedCells,
  highlightedTile,
  highlightedCells,
  highlightColor,
  selectedTile,
  onTileClick,
  getColorCSS,
  interactive = true,
  gridSize = 220
}) => {
  // Calculate tile size based on grid size
  const gap = 8; // Gap between tiles
  const totalGaps = (TUTORIAL_GRID_SIZE - 1) * gap;
  const tileSize = Math.floor((gridSize - totalGaps) / TUTORIAL_GRID_SIZE);
  const gridStyle: React.CSSProperties & Record<string, string> = {
    width: `${gridSize}px`,
    height: `${gridSize}px`,
    '--tutorial-grid-gap': `${gap}px`
  };

  return (
    <div
      className="tutorial-grid"
      style={gridStyle}
      role="grid"
      aria-label="Tutorial puzzle grid"
    >
      {grid.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="tutorial-grid__row"
          role="row"
        >
          {row.map((color, colIndex) => {
            const cellKey = `${rowIndex},${colIndex}`;
            const isLocked = lockedCells.has(cellKey);
            const isHighlighted =
              highlightedCells?.has(cellKey) ||
              (highlightedTile?.row === rowIndex && highlightedTile?.col === colIndex);
            const isSelected =
              selectedTile?.row === rowIndex && selectedTile?.col === colIndex;

            return (
              <TutorialTile
                key={cellKey}
                color={color}
                row={rowIndex}
                col={colIndex}
                isLocked={isLocked}
                isHighlighted={isHighlighted}
                isSelected={isSelected}
                onClick={onTileClick}
                getColorCSS={getColorCSS}
                interactive={interactive}
                size={tileSize}
                highlightColor={highlightColor}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default TutorialGrid;
