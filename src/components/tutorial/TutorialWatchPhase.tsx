/**
 * TutorialWatchPhase Component
 *
 * Interactive guided demo matching the iOS experience.
 * Two sub-phases: PreIntro (completed grid) and StartingBoard (interactive 4-move demo).
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { TileColor } from '../../types';
import { floodFill, findLargestRegion } from '../../utils/gameLogic';
import TutorialGrid from './TutorialGrid';
import TutorialInstructionCard from './TutorialInstructionCard';
import TutorialDemoColorPicker from './TutorialDemoColorPicker';
import AnimatedHand from './AnimatedHand';
import {
  useTutorialContext,
  WatchStepState
} from '../../contexts/TutorialContext';
import { StartingBoardPhase } from '../../contexts/tutorialTypes';
import {
  TUTORIAL_TARGET_COLOR,
  TUTORIAL_GRID_SIZE,
  createFreshGrid,
  WATCH_DEMO_MOVES,
  INSTRUCTION_CARDS,
  PREINTRO_INSTRUCTION,
  PREINTRO_HINT
} from '../../contexts/tutorialConfig';
import {
  TILE_SPIN_DURATION,
  TILE_STAGGER_DELAY,
  TILE_RELOCK_DELAY,
  TILE_LOCK_FADE_DURATION,
  DEMO_RESULT_DELAY,
  DEMO_RESULT_SHOW_MOVE1,
  DEMO_RESULT_SHOW_MOVE2,
  DEMO_RESULT_SHOW_MOVE3
} from '../../utils/animationTimings';

interface TutorialWatchPhaseProps {
  /** Function to get CSS color value */
  getColorCSS: (color: TileColor) => string;
}

const GRID_SIZE = 220;
const TILE_GAP = 8;
const GRID_SHELL_PADDING = 8;

/** Hand offset fractions relative to tile size per move index */
const HAND_OFFSETS_BY_MOVE: Record<number, { x: number; y: number }> = {
  0: { x: 0.5, y: 1.18 },
  1: { x: 0.5, y: 1.18 },
  2: { x: 0.5, y: 1.18 },
  3: { x: 0.5, y: 1.18 }
};

/** Map waiting phases to move indices (result phases map to the NEXT move) */
const WAITING_PHASE_TO_MOVE: Partial<Record<StartingBoardPhase, number>> = {
  [StartingBoardPhase.WaitingForTileTap]: 0,
  [StartingBoardPhase.ResultShown]: 1,
  [StartingBoardPhase.WaitingForPurpleTap]: 1,
  [StartingBoardPhase.PurpleResultShown]: 2,
  [StartingBoardPhase.WaitingForBlueTap]: 2,
  [StartingBoardPhase.BlueResultShown]: 3,
  [StartingBoardPhase.WaitingForYellowTap]: 3
};

/** Phases where the user can tap on grid tiles */
const INTERACTIVE_PHASES = new Set<StartingBoardPhase>([
  StartingBoardPhase.WaitingForTileTap,
  StartingBoardPhase.ResultShown,
  StartingBoardPhase.WaitingForPurpleTap,
  StartingBoardPhase.PurpleResultShown,
  StartingBoardPhase.WaitingForBlueTap,
  StartingBoardPhase.BlueResultShown,
  StartingBoardPhase.WaitingForYellowTap
]);

/** Phases where the picker is open */
const PICKER_PHASES = new Set<StartingBoardPhase>([
  StartingBoardPhase.PickerOpen,
  StartingBoardPhase.PurplePickerOpen,
  StartingBoardPhase.BluePickerOpen,
  StartingBoardPhase.YellowPickerOpen
]);


/** Result phase to auto-advance delay mapping */
const RESULT_PHASE_DELAYS: Partial<Record<StartingBoardPhase, number>> = {
  [StartingBoardPhase.ResultShown]: DEMO_RESULT_SHOW_MOVE1,
  [StartingBoardPhase.PurpleResultShown]: DEMO_RESULT_SHOW_MOVE2,
  [StartingBoardPhase.BlueResultShown]: DEMO_RESULT_SHOW_MOVE3
};

/** Result phase to next waiting phase mapping */
const RESULT_TO_NEXT_WAITING: Partial<Record<StartingBoardPhase, StartingBoardPhase>> = {
  [StartingBoardPhase.ResultShown]: StartingBoardPhase.WaitingForPurpleTap,
  [StartingBoardPhase.PurpleResultShown]: StartingBoardPhase.WaitingForBlueTap,
  [StartingBoardPhase.BlueResultShown]: StartingBoardPhase.WaitingForYellowTap
};

const TutorialWatchPhase: React.FC<TutorialWatchPhaseProps> = ({ getColorCSS }) => {
  const {
    state,
    handleDemoTileTap,
    handleDemoPickerSelect,
    startTryPhase,
    closeTutorial,
    showSkipConfirmation,
    setWatchStep,
    setStartingBoardPhase,
    setTransitioningToStartingBoard,
    setPostTransitionHeader,
    updateDemoGrid
  } = useTutorialContext();

  const {
    watchStep,
    startingBoardPhase,
    demoGrid,
    demoLockedCells,
    showDemoPicker,
    isTransitioningToStartingBoard,
    showPostTransitionHeader,
    hasCompletedBefore
  } = state;

  // Ref to track active timeouts for cleanup
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  const isPreIntro = watchStep === WatchStepState.PreIntro;
  const isStartingBoard = watchStep === WatchStepState.StartingBoard;
  const isPuzzleCompleted = startingBoardPhase === StartingBoardPhase.PuzzleCompleted;
  const isInteractivePhase = INTERACTIVE_PHASES.has(startingBoardPhase);
  const isPickerPhase = PICKER_PHASES.has(startingBoardPhase);

  // =============================================
  // TRANSITION SEQUENCE: PreIntro -> StartingBoard
  // =============================================
  useEffect(() => {
    if (watchStep !== WatchStepState.StartingBoard) return;
    if (startingBoardPhase !== StartingBoardPhase.Transitioning) return;

    let aborted = false;
    const localTimers: ReturnType<typeof setTimeout>[] = [];
    const delay = (ms: number) => new Promise<void>((resolve) => {
      const t = setTimeout(() => { if (!aborted) resolve(); }, ms);
      localTimers.push(t);
      timersRef.current.push(t);
    });

    const runTransition = async () => {
      // 1. Set the grid to the starting state with no locks
      const startingGrid = createFreshGrid();
      updateDemoGrid(startingGrid, new Set<string>());

      // 2. Brief delay then trigger tile spin CSS
      await delay(50);
      if (aborted) return;
      setTransitioningToStartingBoard(true);

      // 3. Wait for spin to complete
      const maxDiagonal = (TUTORIAL_GRID_SIZE - 1) * 2; // 4 for 3x3
      const spinWait = maxDiagonal * TILE_STAGGER_DELAY + TILE_SPIN_DURATION + TILE_RELOCK_DELAY;
      await delay(spinWait);
      if (aborted) return;

      // 4. Show locks on largest region
      const lockedCells = findLargestRegion(startingGrid);
      updateDemoGrid(startingGrid, lockedCells);

      // 5. Wait for lock fade-in
      await delay(TILE_LOCK_FADE_DURATION);
      if (aborted) return;

      // 6. Show post-transition header
      setPostTransitionHeader(true);

      // 7. Brief pause
      await delay(500);
      if (aborted) return;

      // 8. End transition, start interactive phase
      setTransitioningToStartingBoard(false);
      setStartingBoardPhase(StartingBoardPhase.WaitingForTileTap);
    };

    runTransition();

    return () => {
      aborted = true;
      localTimers.forEach(clearTimeout);
    };
  }, [watchStep, startingBoardPhase, updateDemoGrid, setTransitioningToStartingBoard, setPostTransitionHeader, setStartingBoardPhase]);

  // =============================================
  // RESULT PHASE AUTO-ADVANCE
  // =============================================
  useEffect(() => {
    const advanceDelay = RESULT_PHASE_DELAYS[startingBoardPhase];
    const nextPhase = RESULT_TO_NEXT_WAITING[startingBoardPhase];

    if (advanceDelay === undefined || nextPhase === undefined) return;

    let aborted = false;
    const localTimers: ReturnType<typeof setTimeout>[] = [];
    const delay = (ms: number) => new Promise<void>((resolve) => {
      const t = setTimeout(() => { if (!aborted) resolve(); }, ms);
      localTimers.push(t);
      timersRef.current.push(t);
    });

    const runResultSequence = async () => {
      // 1. After short delay, update locks to current largest region
      await delay(DEMO_RESULT_DELAY);
      if (aborted) return;

      const newLocked = findLargestRegion(demoGrid);
      updateDemoGrid(demoGrid.map(r => [...r]), newLocked);

      // 2. Wait the result show duration, then advance
      await delay(advanceDelay - DEMO_RESULT_DELAY);
      if (aborted) return;

      setStartingBoardPhase(nextPhase);
    };

    runResultSequence();

    return () => {
      aborted = true;
      localTimers.forEach(clearTimeout);
    };
  }, [startingBoardPhase, demoGrid, updateDemoGrid, setStartingBoardPhase]);

  // =============================================
  // PUZZLE COMPLETED: lock all cells after delay
  // =============================================
  useEffect(() => {
    if (startingBoardPhase !== StartingBoardPhase.PuzzleCompleted) return;

    let aborted = false;
    const t = setTimeout(() => {
      if (aborted) return;
      // All cells are already locked by the reducer for PuzzleCompleted
      // Just update locks to show the final state
      const allCells = new Set<string>();
      for (let r = 0; r < TUTORIAL_GRID_SIZE; r++) {
        for (let c = 0; c < TUTORIAL_GRID_SIZE; c++) {
          allCells.add(`${r},${c}`);
        }
      }
      updateDemoGrid(demoGrid.map(r => [...r]), allCells);
    }, DEMO_RESULT_DELAY);
    timersRef.current.push(t);

    return () => {
      aborted = true;
      clearTimeout(t);
    };
  }, [startingBoardPhase, demoGrid, updateDemoGrid]);

  // =============================================
  // COMPUTED VALUES
  // =============================================

  /** Get highlighted cells for the current waiting phase */
  const highlightedCells = useMemo(() => {
    const moveIndex = WAITING_PHASE_TO_MOVE[startingBoardPhase];
    if (moveIndex === undefined) return new Set<string>();

    const move = WATCH_DEMO_MOVES[moveIndex];
    if (!move) return new Set<string>();

    const sourceColor = demoGrid[move.tapRow]?.[move.tapCol];
    if (!sourceColor) return new Set<string>();

    const [rowIndices, colIndices] = floodFill(demoGrid, move.tapRow, move.tapCol, sourceColor);
    const cells = new Set<string>();
    for (let i = 0; i < rowIndices.length; i++) {
      cells.add(`${rowIndices[i]},${colIndices[i]}`);
    }
    return cells;
  }, [startingBoardPhase, demoGrid]);

  /** Get highlight color for the current waiting phase (the target color of the move) */
  const highlightColor = useMemo(() => {
    const moveIndex = WAITING_PHASE_TO_MOVE[startingBoardPhase];
    if (moveIndex === undefined) return undefined;
    const move = WATCH_DEMO_MOVES[moveIndex];
    return move ? getColorCSS(move.targetColor) : undefined;
  }, [startingBoardPhase, getColorCSS]);

  /** Compute hand position on grid */
  const gridHandPosition = useMemo(() => {
    const moveIndex = WAITING_PHASE_TO_MOVE[startingBoardPhase];
    if (moveIndex === undefined) return null;

    const move = WATCH_DEMO_MOVES[moveIndex];
    if (!move) return null;

    const tileSize = Math.floor((GRID_SIZE - (TUTORIAL_GRID_SIZE - 1) * TILE_GAP) / TUTORIAL_GRID_SIZE);
    const tileLeft = move.tapCol * (tileSize + TILE_GAP);
    const tileTop = move.tapRow * (tileSize + TILE_GAP);
    const handOffset = HAND_OFFSETS_BY_MOVE[moveIndex] ?? { x: 0.5, y: 0.9 };

    return {
      x: GRID_SHELL_PADDING + tileLeft + tileSize * handOffset.x,
      y: GRID_SHELL_PADDING + tileTop + tileSize * handOffset.y
    };
  }, [startingBoardPhase]);

  /** Get the picker's highlighted color for the current picker phase */
  const pickerHighlightColor = useMemo(() => {
    if (!isPickerPhase) return TileColor.Red;
    // Find which move we're on based on the current picker phase
    const phaseToMove: Partial<Record<StartingBoardPhase, number>> = {
      [StartingBoardPhase.PickerOpen]: 0,
      [StartingBoardPhase.PurplePickerOpen]: 1,
      [StartingBoardPhase.BluePickerOpen]: 2,
      [StartingBoardPhase.YellowPickerOpen]: 3
    };
    const moveIndex = phaseToMove[startingBoardPhase];
    if (moveIndex === undefined) return TileColor.Red;
    const move = WATCH_DEMO_MOVES[moveIndex];
    return move ? move.targetColor : TileColor.Red;
  }, [startingBoardPhase, isPickerPhase]);

  // =============================================
  // EVENT HANDLERS
  // =============================================

  const handlePrimaryAction = useCallback(() => {
    if (isPreIntro) {
      // Reset puzzle: transition to StartingBoard
      setWatchStep(WatchStepState.StartingBoard);
      setStartingBoardPhase(StartingBoardPhase.Transitioning);
    } else if (isPuzzleCompleted) {
      startTryPhase();
    }
  }, [isPreIntro, isPuzzleCompleted, setWatchStep, setStartingBoardPhase, startTryPhase]);

  const handleSkipTutorial = useCallback(() => {
    if (hasCompletedBefore) {
      closeTutorial();
      return;
    }
    showSkipConfirmation();
  }, [hasCompletedBefore, closeTutorial, showSkipConfirmation]);

  const handleTileClick = useCallback((row: number, col: number) => {
    if (!isInteractivePhase) return;
    handleDemoTileTap(row, col);
  }, [isInteractivePhase, handleDemoTileTap]);

  const handlePickerSelect = useCallback((color: TileColor) => {
    handleDemoPickerSelect(color);
  }, [handleDemoPickerSelect]);

  // =============================================
  // DERIVED STATE
  // =============================================

  const targetLabel = TUTORIAL_TARGET_COLOR.charAt(0).toUpperCase() + TUTORIAL_TARGET_COLOR.slice(1);

  const showGridHand = isStartingBoard && isInteractivePhase && gridHandPosition !== null;
  const showPickerHand = isStartingBoard && isPickerPhase;

  // Button text and visibility
  const showButton = isPreIntro || isPuzzleCompleted;
  const buttonText = isPuzzleCompleted ? 'Try Tutorial Puzzles' : 'Reset Puzzle';
  const isButtonDisabled = isTransitioningToStartingBoard ||
    (isStartingBoard && !isPuzzleCompleted && !isPreIntro);

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="tutorial-watch-phase">
      {/* Header: crossfades between titles */}
      <div className="tutorial-watch-header">
        <h2
          className="tutorial-watch-header__title"
          style={{ opacity: isPreIntro && !isTransitioningToStartingBoard ? 1 : 0 }}
        >
          How To Win?
        </h2>
        <h2
          className="tutorial-watch-header__title"
          style={{ opacity: isStartingBoard && !isPuzzleCompleted && showPostTransitionHeader ? 1 : 0 }}
        >
          Learn Color Lock
        </h2>
        <h2
          className="tutorial-watch-header__title"
          style={{ opacity: isPuzzleCompleted ? 1 : 0 }}
        >
          Puzzle Solved!
        </h2>
      </div>

      {/* Instruction card zone */}
      <div className="tutorial-watch-instruction-zone">
        {/* PreIntro card */}
        <TutorialInstructionCard
          text={PREINTRO_INSTRUCTION.text}
          color={PREINTRO_INSTRUCTION.color}
          visible={isPreIntro && !isTransitioningToStartingBoard}
        />
        {/* StartingBoard phase cards */}
        {Object.entries(INSTRUCTION_CARDS).map(([phase, config]) => (
          <TutorialInstructionCard
            key={phase}
            text={config.text}
            color={config.color}
            visible={isStartingBoard && startingBoardPhase === phase}
          />
        ))}
      </div>

      {/* Target color indicator */}
      <div
        className="tutorial-target-indicator tutorial-target-indicator--watch"
        style={{ opacity: isPuzzleCompleted ? 0 : 1, transition: 'opacity 0.3s ease' }}
      >
        <span className="tutorial-target-label">Target:</span>
        <span
          className="tutorial-target-color tutorial-target-color--dot"
          style={{ backgroundColor: getColorCSS(TUTORIAL_TARGET_COLOR) }}
          aria-hidden="true"
        />
        <span className="tutorial-target-value">{targetLabel}</span>
      </div>

      {/* Grid + hand + picker zone */}
      <div className="tutorial-watch-grid-zone">
        <div className="tutorial-watch-grid-shell">
          <TutorialGrid
            grid={demoGrid}
            lockedCells={demoLockedCells}
            highlightedCells={highlightedCells}
            highlightColor={highlightColor}
            getColorCSS={getColorCSS}
            interactive={isInteractivePhase}
            onTileClick={handleTileClick}
            gridSize={GRID_SIZE}
            isTransitioning={isTransitioningToStartingBoard}
          />
          <AnimatedHand
            visible={showGridHand}
            isTapping={false}
            x={gridHandPosition?.x ?? 0}
            y={gridHandPosition?.y ?? 0}
          />
        </div>

        {/* Demo picker (below grid) — always rendered during StartingBoard to reserve space */}
        <div
          className="tutorial-watch-picker-container"
          style={{
            position: 'relative',
            opacity: showDemoPicker ? 1 : 0,
            pointerEvents: showDemoPicker ? 'auto' : 'none',
            transition: 'opacity 0.3s ease'
          }}
        >
          <TutorialDemoColorPicker
            highlightedColor={pickerHighlightColor}
            onColorSelect={handlePickerSelect}
            getColorCSS={getColorCSS}
            showHand={showPickerHand}
          />
        </div>
      </div>

      {/* Hint text (preIntro only) */}
      <div
        className="tutorial-watch-hint-container"
        style={{
          opacity: isPreIntro && !isTransitioningToStartingBoard ? 1 : 0,
          visibility: isPreIntro && !isTransitioningToStartingBoard ? 'visible' : 'hidden',
          transition: 'opacity 0.3s ease, visibility 0.3s ease',
          pointerEvents: isPreIntro ? 'auto' : 'none'
        }}
      >
        <p className="tutorial-watch-hint">{PREINTRO_HINT}</p>
      </div>

      {/* Action button — always rendered to reserve space for consistent height */}
      <div
        className="tutorial-phase-actions tutorial-phase-actions--watch"
        style={{
          opacity: showButton ? 1 : 0,
          visibility: showButton ? 'visible' : 'hidden',
          pointerEvents: showButton ? 'auto' : 'none',
          transition: 'opacity 0.3s ease, visibility 0.3s ease'
        }}
      >
        <button
          className="tutorial-button tutorial-button--primary tutorial-watch-primary-button"
          onClick={handlePrimaryAction}
          disabled={isButtonDisabled || !showButton}
        >
          {buttonText}
        </button>
      </div>

      {/* Skip button */}
      <button className="tutorial-skip-link" onClick={handleSkipTutorial}>
        Skip Tutorial
      </button>
    </div>
  );
};

export default TutorialWatchPhase;
