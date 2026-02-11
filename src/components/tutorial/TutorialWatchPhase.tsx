/**
 * TutorialWatchPhase Component
 *
 * Displays the watch phase of the tutorial where users manually step through
 * the 4-move optimal solution with Start/Next.
 */

import React, { useCallback, useMemo } from 'react';
import { TileColor } from '../../types';
import { floodFill, findLargestRegion } from '../../utils/gameLogic';
import TutorialGrid from './TutorialGrid';
import AnimatedHand from './AnimatedHand';
import {
  useTutorialContext,
  WatchStepState,
  TUTORIAL_OPTIMAL_SOLUTION,
  TUTORIAL_TARGET_COLOR,
  createFreshGrid
} from '../../contexts/TutorialContext';
import {
  WATCH_PHASE_MESSAGES,
  getWatchStepMessageKey,
  getMoveIndexForWatchStep,
  isHighlightStep,
  TUTORIAL_GRID_SIZE
} from '../../contexts/tutorialConfig';

interface TutorialWatchPhaseProps {
  /** Function to get CSS color value */
  getColorCSS: (color: TileColor) => string;
}

const GRID_SIZE = 220;
const TILE_GAP = 8;
const GRID_SHELL_PADDING = 8;

const HAND_OFFSETS_BY_MOVE: Record<number, { x: number; y: number }> = {
  // Fractions are relative to the target tile size.
  0: { x: 0.36, y: 1.04 },
  1: { x: 1.06, y: 0.72 },
  2: { x: 0.42, y: 0.74 },
  3: { x: 1.02, y: 0.58 }
};

function getAppliedMoveCount(step: WatchStepState): number {
  if (step === WatchStepState.Move1) return 0;
  if (step === WatchStepState.Move2) return 1;
  if (step === WatchStepState.Move3) return 2;
  if (step === WatchStepState.Move4) return 3;
  if (step === WatchStepState.Win) return 4;
  return 0;
}

function getProgressCount(step: WatchStepState): number {
  if (step === WatchStepState.Intro) return 0;
  if (step === WatchStepState.Win) return TUTORIAL_OPTIMAL_SOLUTION.length;
  const moveIndex = getMoveIndexForWatchStep(step);
  return moveIndex >= 0 ? moveIndex + 1 : 0;
}

const TutorialWatchPhase: React.FC<TutorialWatchPhaseProps> = ({ getColorCSS }) => {
  const {
    state,
    advanceWatchStep,
    startTryPhase,
    closeTutorial,
    showSkipConfirmation
  } = useTutorialContext();

  const { watchStep, hasCompletedBefore } = state;

  // Get current message
  const messageKey = getWatchStepMessageKey(watchStep);
  const currentMessage = WATCH_PHASE_MESSAGES[messageKey];

  // Apply a move to the grid
  const applyMove = useCallback(
    (grid: TileColor[][], move: typeof TUTORIAL_OPTIMAL_SOLUTION[0]) => {
      const sourceColor = grid[move.row][move.col];
      const [rowIndices, colIndices] = floodFill(grid, move.row, move.col, sourceColor);
      const newGrid = grid.map(r => [...r]);

      for (let i = 0; i < rowIndices.length; i++) {
        newGrid[rowIndices[i]][colIndices[i]] = move.targetColor;
      }

      return newGrid;
    },
    []
  );

  const appliedMoveCount = getAppliedMoveCount(watchStep);
  const moveIndex = getMoveIndexForWatchStep(watchStep);
  const currentMove = isHighlightStep(watchStep) && moveIndex >= 0
    ? TUTORIAL_OPTIMAL_SOLUTION[moveIndex]
    : null;

  const { currentGrid, currentLockedCells } = useMemo(() => {
    let nextGrid = createFreshGrid();
    for (let i = 0; i < appliedMoveCount; i++) {
      nextGrid = applyMove(nextGrid, TUTORIAL_OPTIMAL_SOLUTION[i]);
    }

    return {
      currentGrid: nextGrid,
      currentLockedCells: findLargestRegion(nextGrid)
    };
  }, [appliedMoveCount, applyMove]);

  const highlightedCells = useMemo(() => {
    if (!currentMove) {
      return new Set<string>();
    }

    const sourceColor = currentGrid[currentMove.row]?.[currentMove.col];
    if (!sourceColor) {
      return new Set<string>();
    }

    const [rowIndices, colIndices] = floodFill(
      currentGrid,
      currentMove.row,
      currentMove.col,
      sourceColor
    );

    const cells = new Set<string>();
    for (let i = 0; i < rowIndices.length; i++) {
      cells.add(`${rowIndices[i]},${colIndices[i]}`);
    }

    return cells;
  }, [currentGrid, currentMove]);

  const handPosition = useMemo(() => {
    if (!currentMove || moveIndex < 0) {
      return null;
    }

    const tileSize = Math.floor((GRID_SIZE - (TUTORIAL_GRID_SIZE - 1) * TILE_GAP) / TUTORIAL_GRID_SIZE);
    const tileLeft = currentMove.col * (tileSize + TILE_GAP);
    const tileTop = currentMove.row * (tileSize + TILE_GAP);
    const handOffset = HAND_OFFSETS_BY_MOVE[moveIndex] ?? { x: 0.5, y: 0.9 };

    return {
      x: GRID_SHELL_PADDING + tileLeft + tileSize * handOffset.x,
      y: GRID_SHELL_PADDING + tileTop + tileSize * handOffset.y
    };
  }, [currentMove, moveIndex]);

  const progressCount = getProgressCount(watchStep);
  const targetLabel =
    TUTORIAL_TARGET_COLOR.charAt(0).toUpperCase() + TUTORIAL_TARGET_COLOR.slice(1);
  const messageLines = currentMessage.message.split('\n');
  const highlightedColor =
    currentMove && isHighlightStep(watchStep)
      ? getColorCSS(currentMove.targetColor)
      : undefined;

  const moveCounter = useMemo(() => {
    if (watchStep === WatchStepState.Intro) {
      return null;
    }

    if (watchStep === WatchStepState.Win) {
      return `Move ${TUTORIAL_OPTIMAL_SOLUTION.length} of ${TUTORIAL_OPTIMAL_SOLUTION.length}`;
    }

    if (moveIndex >= 0) {
      return `Move ${moveIndex + 1} of ${TUTORIAL_OPTIMAL_SOLUTION.length}`;
    }

    return null;
  }, [watchStep, moveIndex]);

  const primaryButtonText = currentMessage.buttonText ?? 'Next';

  const handlePrimaryAction = () => {
    if (watchStep === WatchStepState.Win) {
      startTryPhase();
      return;
    }

    advanceWatchStep();
  };

  const handleSkipTutorial = () => {
    if (hasCompletedBefore) {
      closeTutorial();
      return;
    }

    showSkipConfirmation();
  };

  const showHand = Boolean(handPosition && isHighlightStep(watchStep));
  const showCopy = watchStep !== WatchStepState.Win;

  return (
    <div className="tutorial-watch-phase">
      <div className="tutorial-phase-header tutorial-phase-header--watch">
        <h2 className="tutorial-phase-title">{currentMessage.title}</h2>
      </div>

      <div className="tutorial-target-indicator tutorial-target-indicator--watch">
        <span className="tutorial-target-label">Target:</span>
        <span
          className="tutorial-target-color tutorial-target-color--dot"
          style={{ backgroundColor: getColorCSS(TUTORIAL_TARGET_COLOR) }}
          aria-hidden="true"
        />
        <span className="tutorial-target-value">{targetLabel}</span>
      </div>

      <div className="tutorial-grid-container tutorial-grid-container--watch">
        <div className="tutorial-watch-grid-shell">
          <TutorialGrid
            grid={currentGrid}
            lockedCells={currentLockedCells}
            highlightedCells={highlightedCells}
            highlightColor={highlightedColor}
            getColorCSS={getColorCSS}
            interactive={false}
            gridSize={GRID_SIZE}
          />
          <AnimatedHand
            visible={showHand}
            isTapping={false}
            x={handPosition?.x ?? 0}
            y={handPosition?.y ?? 0}
          />
        </div>
      </div>

      {moveCounter && <div className="tutorial-move-counter">{moveCounter}</div>}

      <div className="tutorial-watch-progress" aria-hidden="true">
        {Array.from({ length: TUTORIAL_OPTIMAL_SOLUTION.length }).map((_, index) => (
          <span
            key={`watch-progress-${index}`}
            className={`tutorial-watch-progress-dot ${index < progressCount ? 'tutorial-watch-progress-dot--active' : ''}`}
          />
        ))}
      </div>

      <div className="tutorial-watch-copy">
        {messageLines.map((line, index) => (
          <p
            key={`watch-copy-${index}`}
            className={`tutorial-watch-copy-line ${showCopy ? '' : 'tutorial-watch-copy-line--win'}`}
          >
            {line}
          </p>
        ))}
      </div>

      <div className="tutorial-phase-actions tutorial-phase-actions--watch">
        <button
          className="tutorial-button tutorial-button--primary tutorial-watch-primary-button"
          onClick={handlePrimaryAction}
        >
          {primaryButtonText}
        </button>
      </div>

      <button className="tutorial-skip-link" onClick={handleSkipTutorial}>
        Skip Tutorial
      </button>
    </div>
  );
};

export default TutorialWatchPhase;
