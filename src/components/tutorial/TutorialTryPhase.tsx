/**
 * TutorialTryPhase Component
 *
 * Interactive phase where the user completes a sequence of 3 tutorial puzzles.
 */

import React, { useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLightbulb, faRotateLeft } from '@fortawesome/free-solid-svg-icons';
import { TileColor } from '../../types';
import TutorialGrid from './TutorialGrid';
import TutorialColorPicker from './TutorialColorPicker';
import {
  useTutorialContext
} from '../../contexts/TutorialContext';
import {
  TRY_PHASE_MESSAGES,
  TUTORIAL_TRY_PUZZLES,
  TUTORIAL_TRY_PUZZLE_COUNT,
  getTryPuzzleConfig
} from '../../contexts/tutorialConfig';
import { SOLVE_ADVANCE_DELAY } from '../../utils/animationTimings';

interface TutorialTryPhaseProps {
  /** Function to get CSS color value */
  getColorCSS: (color: TileColor) => string;
}

const TutorialTryPhase: React.FC<TutorialTryPhaseProps> = ({ getColorCSS }) => {
  const {
    state,
    selectTile,
    deselectTile,
    applyColor,
    nextTryPuzzle,
    resetCurrentTryPuzzle,
    startReadyPhase,
    closeTutorial,
    showSkipConfirmation
  } = useTutorialContext();

  const {
    interactiveGrid,
    lockedCells,
    selectedTile,
    showColorPicker,
    userMoveCount,
    isSolved,
    isTryLost,
    currentTryPuzzleIndex,
    hasCompletedBefore
  } = state;
  const currentPuzzle = getTryPuzzleConfig(currentTryPuzzleIndex);
  const isLastPuzzle = currentTryPuzzleIndex >= TUTORIAL_TRY_PUZZLE_COUNT - 1;
  const targetColorNameLower = currentPuzzle.targetColor.toLowerCase();
  const targetColorNameTitle =
    currentPuzzle.targetColor.charAt(0).toUpperCase() + currentPuzzle.targetColor.slice(1);
  const showWarning = useMemo(() => {
    if (isSolved || isTryLost || userMoveCount === 0) return false;

    const colorCounts: Record<string, number> = {};
    for (const row of interactiveGrid) {
      for (const color of row) {
        if (color && color !== currentPuzzle.targetColor) {
          colorCounts[color] = (colorCounts[color] || 0) + 1;
        }
      }
    }

    return Object.values(colorCounts).some(count => count >= 4);
  }, [
    isSolved,
    isTryLost,
    userMoveCount,
    interactiveGrid,
    currentPuzzle.targetColor
  ]);

  // Auto-advance through 3 try puzzles, then go to ready phase.
  useEffect(() => {
    if (!isSolved || isTryLost) {
      return;
    }

    const timer = setTimeout(() => {
      if (isLastPuzzle) {
        startReadyPhase();
      } else {
        nextTryPuzzle();
      }
    }, SOLVE_ADVANCE_DELAY);

    return () => clearTimeout(timer);
  }, [isSolved, isTryLost, isLastPuzzle, startReadyPhase, nextTryPuzzle]);

  // Handle tile click
  const handleTileClick = (row: number, col: number) => {
    if (isSolved || isTryLost) return;
    selectTile({ row, col });
  };

  // Handle color selection
  const handleColorSelect = (color: TileColor) => {
    applyColor(color);
  };

  // Handle color picker cancel
  const handleColorPickerCancel = () => {
    deselectTile();
  };

  const handleSkipTutorial = () => {
    if (hasCompletedBefore) {
      closeTutorial();
      return;
    }
    showSkipConfirmation();
  };

  const handleResetPuzzle = () => {
    resetCurrentTryPuzzle();
  };

  // Get current color of selected tile for the picker
  const currentTileColor = selectedTile
    ? interactiveGrid[selectedTile.row][selectedTile.col]
    : TileColor.Red;

  return (
    <div className="tutorial-try-phase">
      <div className="tutorial-phase-header tutorial-phase-header--try">
        <h2 className="tutorial-phase-title">{TRY_PHASE_MESSAGES.title}</h2>
      </div>

      <div className="tutorial-try-metadata tutorial-try-metadata--compact">
        <div className="tutorial-try-meta-row">
          <span className="tutorial-try-meta-label tutorial-try-meta-label--compact">Target:</span>
          <span
            className="tutorial-target-color tutorial-target-color--dot tutorial-target-color--small"
            style={{ backgroundColor: getColorCSS(currentPuzzle.targetColor) }}
            aria-hidden="true"
          />
          <span className="tutorial-target-value tutorial-target-value--compact">{targetColorNameTitle}</span>
        </div>
        <div className="tutorial-try-meta-row">
          <span className="tutorial-try-meta-label tutorial-try-meta-label--compact">Goal:</span>
          <span className="tutorial-try-goal-value tutorial-try-goal-value--compact">{currentPuzzle.goalMoves}</span>
          <span className="tutorial-try-goal-unit tutorial-try-goal-unit--compact">moves</span>
        </div>
      </div>

      {userMoveCount === 0 && !showColorPicker && (
        <div className="tutorial-try-note">
          Our bot sets a goal for each puzzle. Try solving in {currentPuzzle.goalMoves} moves or less!
        </div>
      )}

      {(isSolved || showWarning) && (
        <div className={`tutorial-try-status ${isSolved ? 'tutorial-try-status--solved' : 'tutorial-try-status--warning'}`}>
          {isSolved ? (
            <p className="tutorial-try-status-solved">Solved!</p>
          ) : (
            <>
              <p className="tutorial-try-status-title">
                <FontAwesomeIcon icon={faLightbulb} />
                <span>Careful!</span>
              </p>
              <p className="tutorial-try-status-message">
                Locking more than half the board in non-{targetColorNameLower} is a loss.
              </p>
            </>
          )}
        </div>
      )}

      <div className="tutorial-try-puzzles-indicator">
        <div className="tutorial-try-puzzles-label">Tutorial Puzzles</div>
        <div className="tutorial-try-puzzles-dots" aria-hidden="true">
          {TUTORIAL_TRY_PUZZLES.map((puzzle, index) => (
            <span
              key={puzzle.id}
              className={`tutorial-try-puzzle-dot ${index === currentTryPuzzleIndex ? 'tutorial-try-puzzle-dot--active' : ''}`}
              style={{ backgroundColor: puzzle.indicatorColor }}
            />
          ))}
        </div>
      </div>

      <div className="tutorial-grid-container tutorial-grid-container--try">
        <div className="tutorial-watch-grid-shell">
          <TutorialGrid
            grid={interactiveGrid}
            lockedCells={lockedCells}
            selectedTile={selectedTile}
            onTileClick={handleTileClick}
            getColorCSS={getColorCSS}
            interactive={!isSolved && !isTryLost}
          />
        </div>
      </div>

      <div className="tutorial-try-moves">
        <div className="tutorial-try-moves-value">{userMoveCount}</div>
        <div className="tutorial-try-moves-label">Moves</div>
      </div>

      <div className="tutorial-try-footer">
        <button className="tutorial-try-footer-button" onClick={handleResetPuzzle}>
          <FontAwesomeIcon icon={faRotateLeft} />
          <span>Reset</span>
        </button>

        <button className="tutorial-try-footer-button tutorial-try-footer-button--skip" onClick={handleSkipTutorial}>
          Skip
        </button>
      </div>

      <TutorialColorPicker
        isOpen={showColorPicker && !isTryLost}
        currentColor={currentTileColor}
        onSelect={handleColorSelect}
        onCancel={handleColorPickerCancel}
        getColorCSS={getColorCSS}
      />

      {isTryLost && (
        <div
          className="tutorial-try-loss-backdrop"
          role="dialog"
          aria-label="Puzzle Lost"
          aria-modal="true"
        >
          <div className="tutorial-try-loss-modal">
            <h3 className="tutorial-try-loss-title">Puzzle Lost</h3>
            <p className="tutorial-try-loss-message">Too many wrong-color tiles locked.</p>

            <div className="tutorial-try-loss-target-row">
              <span>Target:</span>
              <span
                className="tutorial-target-color tutorial-target-color--dot"
                style={{ backgroundColor: getColorCSS(currentPuzzle.targetColor) }}
                aria-hidden="true"
              />
              <span>{targetColorNameTitle}</span>
            </div>

            <button
              className="tutorial-button tutorial-button--primary tutorial-try-loss-button"
              onClick={handleResetPuzzle}
            >
              <FontAwesomeIcon icon={faRotateLeft} />
              <span>Try Again</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TutorialTryPhase;
