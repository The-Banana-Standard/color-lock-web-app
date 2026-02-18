/**
 * TutorialTile Component
 *
 * A single tile in the tutorial grid with support for:
 * - Lock icon display
 * - Highlight animation (for watch phase targeting)
 * - Selection state (for try phase)
 * - Color transitions
 */

import React from 'react';
import { TileColor } from '../../types';
import { MinimalWhiteLock } from '../icons';

interface TutorialTileProps {
  /** The color of the tile */
  color: TileColor;
  /** Row index in the grid */
  row: number;
  /** Column index in the grid */
  col: number;
  /** Whether this tile is locked (part of largest region) */
  isLocked: boolean;
  /** Whether this tile is highlighted (watch phase target) */
  isHighlighted: boolean;
  /** Whether this tile is selected (try phase) */
  isSelected: boolean;
  /** Click handler */
  onClick?: (row: number, col: number) => void;
  /** Function to get CSS color value */
  getColorCSS: (color: TileColor) => string;
  /** Whether the tile is interactive */
  interactive?: boolean;
  /** Size of the tile in pixels */
  size?: number;
  /** Color used for highlight border */
  highlightColor?: string;
  /** Whether this tile should play the spin animation */
  isSpinning?: boolean;
  /** Stagger delay for the spin (ms) */
  spinDelay?: number;
}

const TutorialTile: React.FC<TutorialTileProps> = ({
  color,
  row,
  col,
  isLocked,
  isHighlighted,
  isSelected,
  onClick,
  getColorCSS,
  interactive = true,
  size = 62,
  highlightColor,
  isSpinning = false,
  spinDelay = 0
}) => {
  const handleClick = () => {
    if (interactive && onClick && !isLocked) {
      onClick(row, col);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && interactive && onClick && !isLocked) {
      e.preventDefault();
      onClick(row, col);
    }
  };

  const classes = ['tutorial-tile'];
  if (isLocked) classes.push('tutorial-tile--locked');
  if (isHighlighted) classes.push('tutorial-tile--highlighted');
  if (isSelected) classes.push('tutorial-tile--selected');
  if (!interactive || isLocked) classes.push('tutorial-tile--disabled');
  if (isSpinning) classes.push('tutorial-tile--spinning');

  const style: React.CSSProperties = {
    backgroundColor: getColorCSS(color),
    width: size,
    height: size
  };
  if (highlightColor) {
    (style as React.CSSProperties & Record<string, string>)['--tutorial-highlight-color'] = highlightColor;
  }
  if (isSpinning) {
    (style as React.CSSProperties & Record<string, string>)['--spin-delay'] = `${spinDelay}ms`;
  }

  return (
    <div
      className={classes.join(' ')}
      style={style}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={interactive && !isLocked ? 'button' : undefined}
      tabIndex={interactive && !isLocked ? 0 : -1}
      aria-label={`${color} tile at row ${row + 1}, column ${col + 1}${isLocked ? ', locked' : ''}${isHighlighted ? ', target' : ''}`}
      data-row={row}
      data-col={col}
      data-color={color}
    >
      {isLocked && <MinimalWhiteLock size={Math.floor(size * 0.25)} />}
    </div>
  );
};

export default TutorialTile;
