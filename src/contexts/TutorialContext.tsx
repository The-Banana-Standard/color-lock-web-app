/**
 * Tutorial Context
 *
 * Manages the "Watch -> Try -> Ready" tutorial flow using useReducer.
 * Provides state and actions for all tutorial phases and user interactions.
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  ReactNode
} from 'react';
import { TileColor } from '../types';
import { floodFill, findLargestRegion, isBoardUnified } from '../utils/gameLogic';
import {
  TutorialPhase,
  WatchStepState,
  StartingBoardPhase,
  TutorialState,
  TutorialAction,
  TutorialContextValue,
  GridPosition
} from './tutorialTypes';
import {
  createFreshGrid,
  createFreshTryGrid,
  createCompletedGrid,
  createAllLockedCells,
  getTryPuzzleConfig,
  TUTORIAL_OPTIMAL_SOLUTION,
  TUTORIAL_TARGET_COLOR,
  TUTORIAL_SOFT_FAIL_THRESHOLD,
  TUTORIAL_TRY_LOSS_LOCK_THRESHOLD,
  WATCH_DEMO_MOVES
} from './tutorialConfig';

// ===========================================
// CONSTANTS
// ===========================================

const TUTORIAL_COMPLETED_KEY = 'colorlock_tutorial_completed';

// ===========================================
// HELPERS
// ===========================================

/** Map a picker phase to its move index in WATCH_DEMO_MOVES */
function getMoveIndexForPickerPhase(phase: StartingBoardPhase): number {
  switch (phase) {
    case StartingBoardPhase.PickerOpen: return 0;
    case StartingBoardPhase.PurplePickerOpen: return 1;
    case StartingBoardPhase.BluePickerOpen: return 2;
    case StartingBoardPhase.YellowPickerOpen: return 3;
    default: return -1;
  }
}

// ===========================================
// INITIAL STATE
// ===========================================

function getInitialState(): TutorialState {
  const hasCompletedBefore =
    typeof window !== 'undefined' &&
    localStorage.getItem(TUTORIAL_COMPLETED_KEY) === 'true';

  // PreIntro shows the completed grid (all red, all locked)
  const completedGrid = createCompletedGrid();
  const allLocked = createAllLockedCells();
  const firstTryGrid = createFreshTryGrid(0);

  return {
    phase: TutorialPhase.Watch,
    watchStep: WatchStepState.PreIntro,
    demoGrid: completedGrid,
    interactiveGrid: firstTryGrid,
    currentTryPuzzleIndex: 0,
    demoLockedCells: allLocked,
    lockedCells: new Set<string>(),
    userMoveCount: 0,
    isSolved: false,
    isTryLost: false,
    isAutoPlaying: false,
    showSkipConfirmation: false,
    showColorPicker: false,
    selectedTile: null,
    showSoftFailWarning: false,
    isOpen: false,
    hasCompletedBefore,
    startingBoardPhase: StartingBoardPhase.Transitioning,
    showDemoPicker: false,
    isTransitioningToStartingBoard: false,
    showPostTransitionHeader: false
  };
}

// ===========================================
// REDUCER
// ===========================================

function tutorialReducer(state: TutorialState, action: TutorialAction): TutorialState {
  switch (action.type) {
    case 'OPEN_TUTORIAL':
      return {
        ...getInitialState(),
        isOpen: true,
        hasCompletedBefore: state.hasCompletedBefore
      };

    case 'CLOSE_TUTORIAL':
      return {
        ...state,
        isOpen: false,
        isAutoPlaying: false
      };

    case 'START_WATCH_PHASE': {
      const completedGrid = createCompletedGrid();
      const allLocked = createAllLockedCells();
      return {
        ...state,
        phase: TutorialPhase.Watch,
        watchStep: WatchStepState.PreIntro,
        demoGrid: completedGrid,
        demoLockedCells: allLocked,
        isAutoPlaying: false,
        startingBoardPhase: StartingBoardPhase.Transitioning,
        showDemoPicker: false,
        isTransitioningToStartingBoard: false,
        showPostTransitionHeader: false
      };
    }

    case 'SET_WATCH_STEP':
      return {
        ...state,
        watchStep: action.step
      };

    case 'SET_STARTING_BOARD_PHASE':
      return {
        ...state,
        startingBoardPhase: action.phase
      };

    case 'HANDLE_DEMO_TILE_TAP': {
      const { row, col } = action;
      const { startingBoardPhase, demoGrid } = state;

      // Map result phases to their next waiting phase so taps work during results too
      const RESULT_TO_WAITING: Partial<Record<StartingBoardPhase, StartingBoardPhase>> = {
        [StartingBoardPhase.ResultShown]: StartingBoardPhase.WaitingForPurpleTap,
        [StartingBoardPhase.PurpleResultShown]: StartingBoardPhase.WaitingForBlueTap,
        [StartingBoardPhase.BlueResultShown]: StartingBoardPhase.WaitingForYellowTap
      };

      // Resolve the effective phase (result phases act like their next waiting phase)
      const effectivePhase = RESULT_TO_WAITING[startingBoardPhase] ?? startingBoardPhase;

      // Find which move corresponds to the effective waiting phase
      const move = WATCH_DEMO_MOVES.find(m => m.waitingPhase === effectivePhase);
      if (!move) return state;

      // Validate tap is on the correct tile/region
      if (effectivePhase === StartingBoardPhase.WaitingForTileTap) {
        // Move 1: only accept tap at [1,2] (green tile)
        if (row !== 1 || col !== 2) return state;
      } else if (effectivePhase === StartingBoardPhase.WaitingForPurpleTap) {
        // Move 2: only accept tap at [2,0] (purple tile)
        if (row !== 2 || col !== 0) return state;
      } else if (effectivePhase === StartingBoardPhase.WaitingForBlueTap) {
        // Move 3: accept tap on any blue tile in the region
        const sourceColor = demoGrid[move.tapRow]?.[move.tapCol];
        if (demoGrid[row]?.[col] !== sourceColor) return state;
      } else if (effectivePhase === StartingBoardPhase.WaitingForYellowTap) {
        // Move 4: accept tap on any yellow tile in the region
        const sourceColor = demoGrid[move.tapRow]?.[move.tapCol];
        if (demoGrid[row]?.[col] !== sourceColor) return state;
      } else {
        return state;
      }

      return {
        ...state,
        startingBoardPhase: move.pickerPhase,
        showDemoPicker: true
      };
    }

    case 'HANDLE_DEMO_PICKER_SELECT': {
      const { color } = action;
      const { startingBoardPhase, demoGrid } = state;

      // Find the move index from the current picker phase
      const moveIndex = getMoveIndexForPickerPhase(startingBoardPhase);
      if (moveIndex < 0) return state;

      const move = WATCH_DEMO_MOVES[moveIndex];
      if (!move) return state;

      // Validate the color matches the expected target
      if (color !== move.targetColor) return state;

      // Apply flood fill
      const sourceColor = demoGrid[move.tapRow][move.tapCol];
      const [rowIndices, colIndices] = floodFill(demoGrid, move.tapRow, move.tapCol, sourceColor);

      // Build new grid
      const newGrid = demoGrid.map(r => [...r]);
      for (let i = 0; i < rowIndices.length; i++) {
        newGrid[rowIndices[i]][colIndices[i]] = color;
      }

      // For PuzzleCompleted (last move), also lock all cells
      const isLastMove = move.resultPhase === StartingBoardPhase.PuzzleCompleted;

      return {
        ...state,
        demoGrid: newGrid,
        demoLockedCells: isLastMove ? createAllLockedCells() : state.demoLockedCells,
        showDemoPicker: false,
        startingBoardPhase: move.resultPhase
      };
    }

    case 'SET_DEMO_PICKER_VISIBLE':
      return {
        ...state,
        showDemoPicker: action.visible
      };

    case 'SET_TRANSITIONING_TO_STARTING_BOARD':
      return {
        ...state,
        isTransitioningToStartingBoard: action.transitioning
      };

    case 'SET_POST_TRANSITION_HEADER':
      return {
        ...state,
        showPostTransitionHeader: action.visible
      };

    case 'RESET_WATCH_PHASE': {
      const completedGrid = createCompletedGrid();
      const allLocked = createAllLockedCells();
      return {
        ...state,
        watchStep: WatchStepState.PreIntro,
        demoGrid: completedGrid,
        demoLockedCells: allLocked,
        startingBoardPhase: StartingBoardPhase.Transitioning,
        showDemoPicker: false,
        isTransitioningToStartingBoard: false,
        showPostTransitionHeader: false
      };
    }

    case 'START_TRY_PHASE': {
      const freshGrid = createFreshTryGrid(0);
      const initialLockedCells = findLargestRegion(freshGrid);
      return {
        ...state,
        phase: TutorialPhase.Try,
        interactiveGrid: freshGrid,
        lockedCells: initialLockedCells,
        currentTryPuzzleIndex: 0,
        userMoveCount: 0,
        isSolved: false,
        isTryLost: false,
        showColorPicker: false,
        selectedTile: null,
        showSoftFailWarning: false
      };
    }

    case 'NEXT_TRY_PUZZLE': {
      const nextIndex = state.currentTryPuzzleIndex + 1;
      const nextGrid = createFreshTryGrid(nextIndex);
      return {
        ...state,
        interactiveGrid: nextGrid,
        lockedCells: findLargestRegion(nextGrid),
        currentTryPuzzleIndex: nextIndex,
        userMoveCount: 0,
        isSolved: false,
        isTryLost: false,
        showColorPicker: false,
        selectedTile: null,
        showSoftFailWarning: false
      };
    }

    case 'RESET_CURRENT_TRY_PUZZLE': {
      const freshGrid = createFreshTryGrid(state.currentTryPuzzleIndex);
      return {
        ...state,
        interactiveGrid: freshGrid,
        lockedCells: findLargestRegion(freshGrid),
        userMoveCount: 0,
        isSolved: false,
        isTryLost: false,
        showColorPicker: false,
        selectedTile: null,
        showSoftFailWarning: false
      };
    }

    case 'SELECT_TILE': {
      if (state.isTryLost) {
        return state;
      }

      const { row, col } = action.position;
      const cellKey = `${row},${col}`;

      // Cannot select locked cells
      if (state.lockedCells.has(cellKey)) {
        return state;
      }

      return {
        ...state,
        selectedTile: action.position,
        showColorPicker: true
      };
    }

    case 'DESELECT_TILE':
      return {
        ...state,
        selectedTile: null,
        showColorPicker: false
      };

    case 'APPLY_COLOR': {
      if (!state.selectedTile) {
        return state;
      }

      const { row, col } = state.selectedTile;
      const currentColor = state.interactiveGrid[row][col];

      // Cannot change to same color
      if (currentColor === action.color) {
        return state;
      }

      // Apply flood fill to change connected tiles
      const [rowIndices, colIndices] = floodFill(
        state.interactiveGrid,
        row,
        col,
        currentColor
      );

      // Create new grid with color change
      const newGrid = state.interactiveGrid.map((r) => [...r]);
      for (let i = 0; i < rowIndices.length; i++) {
        newGrid[rowIndices[i]][colIndices[i]] = action.color;
      }

      // Find new locked region
      const newLockedCells = findLargestRegion(newGrid);

      // Check if solved
      const currentTryPuzzle = getTryPuzzleConfig(state.currentTryPuzzleIndex);
      const solved =
        isBoardUnified(newGrid) && newGrid[0][0] === currentTryPuzzle.targetColor;

      // Loss condition:
      // If the locked region reaches threshold size while locked color is not the target color.
      let isTryLost = false;
      const firstLockedCell = newLockedCells.values().next().value;
      if (!solved && typeof firstLockedCell === 'string') {
        const [rowStr, colStr] = firstLockedCell.split(',');
        const lRow = Number.parseInt(rowStr, 10);
        const lCol = Number.parseInt(colStr, 10);
        const lockedColor = newGrid[lRow]?.[lCol];

        isTryLost =
          Boolean(lockedColor) &&
          lockedColor !== currentTryPuzzle.targetColor &&
          newLockedCells.size >= TUTORIAL_TRY_LOSS_LOCK_THRESHOLD;
      }

      // Update move count and check for soft fail
      const newMoveCount = state.userMoveCount + 1;
      const shouldShowWarning =
        newMoveCount >= TUTORIAL_SOFT_FAIL_THRESHOLD && !state.showSoftFailWarning;

      return {
        ...state,
        interactiveGrid: newGrid,
        lockedCells: newLockedCells,
        userMoveCount: newMoveCount,
        isSolved: solved,
        isTryLost,
        selectedTile: null,
        showColorPicker: false,
        showSoftFailWarning: shouldShowWarning ? true : state.showSoftFailWarning
      };
    }

    case 'START_READY_PHASE':
      return {
        ...state,
        phase: TutorialPhase.Ready
      };

    case 'COMPLETE_TUTORIAL':
      // Mark as completed in localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(TUTORIAL_COMPLETED_KEY, 'true');
      }
      return {
        ...state,
        phase: TutorialPhase.Complete,
        isOpen: false,
        hasCompletedBefore: true
      };

    case 'RESET_FOR_REPLAY': {
      const freshGrid = createFreshTryGrid(0);
      const initialLockedCells = findLargestRegion(freshGrid);
      return {
        ...state,
        phase: TutorialPhase.Try,
        interactiveGrid: freshGrid,
        lockedCells: initialLockedCells,
        currentTryPuzzleIndex: 0,
        userMoveCount: 0,
        isSolved: false,
        isTryLost: false,
        showColorPicker: false,
        selectedTile: null,
        showSoftFailWarning: false
      };
    }

    case 'UPDATE_DEMO_GRID':
      return {
        ...state,
        demoGrid: action.grid,
        demoLockedCells: action.lockedCells
      };

    case 'UPDATE_INTERACTIVE_GRID':
      return {
        ...state,
        interactiveGrid: action.grid,
        lockedCells: action.lockedCells
      };

    case 'SET_AUTO_PLAYING':
      return {
        ...state,
        isAutoPlaying: action.isAutoPlaying
      };

    case 'SHOW_SKIP_CONFIRMATION':
      return {
        ...state,
        showSkipConfirmation: true
      };

    case 'HIDE_SKIP_CONFIRMATION':
      return {
        ...state,
        showSkipConfirmation: false
      };

    case 'SHOW_SOFT_FAIL_WARNING':
      return {
        ...state,
        showSoftFailWarning: true
      };

    case 'HIDE_SOFT_FAIL_WARNING':
      return {
        ...state,
        showSoftFailWarning: false
      };

    case 'SET_SOLVED':
      return {
        ...state,
        isSolved: true
      };

    default:
      return state;
  }
}

// ===========================================
// CONTEXT
// ===========================================

const TutorialContext = createContext<TutorialContextValue | undefined>(undefined);

// ===========================================
// PROVIDER
// ===========================================

interface TutorialProviderProps {
  children: ReactNode;
}

export const TutorialProvider: React.FC<TutorialProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(tutorialReducer, undefined, getInitialState);

  // Tutorial modal controls
  const openTutorial = useCallback(() => {
    dispatch({ type: 'OPEN_TUTORIAL' });
  }, []);

  const closeTutorial = useCallback(() => {
    dispatch({ type: 'CLOSE_TUTORIAL' });
  }, []);

  // Phase navigation
  const startWatchPhase = useCallback(() => {
    dispatch({ type: 'START_WATCH_PHASE' });
  }, []);

  const startTryPhase = useCallback(() => {
    dispatch({ type: 'START_TRY_PHASE' });
  }, []);

  const nextTryPuzzle = useCallback(() => {
    dispatch({ type: 'NEXT_TRY_PUZZLE' });
  }, []);

  const resetCurrentTryPuzzle = useCallback(() => {
    dispatch({ type: 'RESET_CURRENT_TRY_PUZZLE' });
  }, []);

  const startReadyPhase = useCallback(() => {
    dispatch({ type: 'START_READY_PHASE' });
  }, []);

  const completeTutorial = useCallback(() => {
    dispatch({ type: 'COMPLETE_TUTORIAL' });
  }, []);

  const resetForReplay = useCallback(() => {
    dispatch({ type: 'RESET_FOR_REPLAY' });
  }, []);

  // User interaction
  const selectTile = useCallback((position: GridPosition) => {
    dispatch({ type: 'SELECT_TILE', position });
  }, []);

  const deselectTile = useCallback(() => {
    dispatch({ type: 'DESELECT_TILE' });
  }, []);

  const applyColor = useCallback((color: TileColor) => {
    dispatch({ type: 'APPLY_COLOR', color });
  }, []);

  // Auto-play control
  const setAutoPlaying = useCallback((isAutoPlaying: boolean) => {
    dispatch({ type: 'SET_AUTO_PLAYING', isAutoPlaying });
  }, []);

  // Skip confirmation
  const showSkipConfirmation = useCallback(() => {
    dispatch({ type: 'SHOW_SKIP_CONFIRMATION' });
  }, []);

  const hideSkipConfirmation = useCallback(() => {
    dispatch({ type: 'HIDE_SKIP_CONFIRMATION' });
  }, []);

  const confirmSkip = useCallback(() => {
    dispatch({ type: 'HIDE_SKIP_CONFIRMATION' });
    dispatch({ type: 'COMPLETE_TUTORIAL' });
  }, []);

  // Soft fail warning
  const hideSoftFailWarning = useCallback(() => {
    dispatch({ type: 'HIDE_SOFT_FAIL_WARNING' });
  }, []);

  // Helper getters
  const getCurrentMoveIndex = useCallback((): number => {
    return -1; // No longer used for old step-through
  }, []);

  const isWatchPhaseComplete = useCallback((): boolean => {
    return state.startingBoardPhase === StartingBoardPhase.PuzzleCompleted;
  }, [state.startingBoardPhase]);

  // Interactive watch demo
  const handleDemoTileTap = useCallback((row: number, col: number) => {
    dispatch({ type: 'HANDLE_DEMO_TILE_TAP', row, col });
  }, []);

  const handleDemoPickerSelect = useCallback((color: TileColor) => {
    dispatch({ type: 'HANDLE_DEMO_PICKER_SELECT', color });
  }, []);

  const resetWatchPhase = useCallback(() => {
    dispatch({ type: 'RESET_WATCH_PHASE' });
  }, []);

  const setStartingBoardPhase = useCallback((phase: StartingBoardPhase) => {
    dispatch({ type: 'SET_STARTING_BOARD_PHASE', phase });
  }, []);

  const setTransitioningToStartingBoard = useCallback((transitioning: boolean) => {
    dispatch({ type: 'SET_TRANSITIONING_TO_STARTING_BOARD', transitioning });
  }, []);

  const setPostTransitionHeader = useCallback((visible: boolean) => {
    dispatch({ type: 'SET_POST_TRANSITION_HEADER', visible });
  }, []);

  const updateDemoGrid = useCallback((grid: TileColor[][], lockedCells: Set<string>) => {
    dispatch({ type: 'UPDATE_DEMO_GRID', grid, lockedCells });
  }, []);

  const setWatchStep = useCallback((step: WatchStepState) => {
    dispatch({ type: 'SET_WATCH_STEP', step });
  }, []);

  const contextValue: TutorialContextValue = {
    state,
    openTutorial,
    closeTutorial,
    startWatchPhase,
    startTryPhase,
    nextTryPuzzle,
    resetCurrentTryPuzzle,
    startReadyPhase,
    completeTutorial,
    resetForReplay,
    selectTile,
    deselectTile,
    applyColor,
    setAutoPlaying,
    showSkipConfirmation,
    hideSkipConfirmation,
    confirmSkip,
    hideSoftFailWarning,
    getCurrentMoveIndex,
    isWatchPhaseComplete,
    handleDemoTileTap,
    handleDemoPickerSelect,
    resetWatchPhase,
    setStartingBoardPhase,
    setTransitioningToStartingBoard,
    setPostTransitionHeader,
    updateDemoGrid,
    setWatchStep
  };

  return (
    <TutorialContext.Provider value={contextValue}>{children}</TutorialContext.Provider>
  );
};

// ===========================================
// HOOK
// ===========================================

export const useTutorialContext = (): TutorialContextValue => {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error('useTutorialContext must be used within a TutorialProvider');
  }
  return context;
};

// Re-export types and config for convenience
export { TutorialPhase, WatchStepState, StartingBoardPhase } from './tutorialTypes';
export type { TutorialState, GridPosition } from './tutorialTypes';
export {
  TUTORIAL_OPTIMAL_MOVES,
  TUTORIAL_TARGET_COLOR,
  TUTORIAL_OPTIMAL_SOLUTION,
  TUTORIAL_TRY_PUZZLES,
  TUTORIAL_TRY_PUZZLE_COUNT,
  TUTORIAL_GRID_SIZE,
  createFreshGrid,
  getTryPuzzleConfig
} from './tutorialConfig';
