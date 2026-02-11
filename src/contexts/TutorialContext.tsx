/**
 * Tutorial Context
 *
 * Manages the "Watch -> Try -> Compare -> Ready" tutorial flow using useReducer.
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
  TutorialState,
  TutorialAction,
  TutorialContextValue,
  GridPosition
} from './tutorialTypes';
import {
  createFreshGrid,
  createFreshTryGrid,
  getTryPuzzleConfig,
  TUTORIAL_OPTIMAL_SOLUTION,
  TUTORIAL_TARGET_COLOR,
  TUTORIAL_SOFT_FAIL_THRESHOLD,
  TUTORIAL_TRY_LOSS_LOCK_THRESHOLD
} from './tutorialConfig';

// ===========================================
// CONSTANTS
// ===========================================

const TUTORIAL_COMPLETED_KEY = 'colorlock_tutorial_completed';

// ===========================================
// INITIAL STATE
// ===========================================

function getInitialState(): TutorialState {
  const hasCompletedBefore =
    typeof window !== 'undefined' &&
    localStorage.getItem(TUTORIAL_COMPLETED_KEY) === 'true';

  const freshGrid = createFreshGrid();
  const firstTryGrid = createFreshTryGrid(0);
  const initialDemoLockedCells = findLargestRegion(freshGrid);

  return {
    phase: TutorialPhase.Watch,
    watchStep: WatchStepState.Intro,
    demoGrid: freshGrid,
    interactiveGrid: firstTryGrid,
    currentTryPuzzleIndex: 0,
    demoLockedCells: initialDemoLockedCells,
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
    hasCompletedBefore
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

    case 'START_WATCH_PHASE':
      return {
        ...state,
        phase: TutorialPhase.Watch,
        watchStep: WatchStepState.Intro,
        demoGrid: createFreshGrid(),
        demoLockedCells: findLargestRegion(createFreshGrid()),
        isAutoPlaying: false
      };

    case 'ADVANCE_WATCH_STEP': {
      const nextStep = state.watchStep + 1;
      if (nextStep > WatchStepState.Win) {
        return state;
      }
      return {
        ...state,
        watchStep: nextStep as WatchStepState
      };
    }

    case 'SET_WATCH_STEP':
      return {
        ...state,
        watchStep: action.step
      };

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
        const row = Number.parseInt(rowStr, 10);
        const col = Number.parseInt(colStr, 10);
        const lockedColor = newGrid[row]?.[col];

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

    case 'START_COMPARE_PHASE':
      return {
        ...state,
        phase: TutorialPhase.Compare
      };

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

  const advanceWatchStep = useCallback(() => {
    dispatch({ type: 'ADVANCE_WATCH_STEP' });
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

  const startComparePhase = useCallback(() => {
    dispatch({ type: 'START_COMPARE_PHASE' });
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
    const { watchStep } = state;
    if (watchStep === WatchStepState.Move1) return 0;
    if (watchStep === WatchStepState.Move2) return 1;
    if (watchStep === WatchStepState.Move3) return 2;
    if (watchStep === WatchStepState.Move4 || watchStep === WatchStepState.Win) return 3;
    return -1;
  }, [state]);

  const isWatchPhaseComplete = useCallback((): boolean => {
    return state.watchStep === WatchStepState.Win;
  }, [state.watchStep]);

  const contextValue: TutorialContextValue = {
    state,
    openTutorial,
    closeTutorial,
    startWatchPhase,
    advanceWatchStep,
    startTryPhase,
    nextTryPuzzle,
    resetCurrentTryPuzzle,
    startComparePhase,
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
    isWatchPhaseComplete
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
export { TutorialPhase, WatchStepState } from './tutorialTypes';
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
