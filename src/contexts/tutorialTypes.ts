/**
 * Tutorial Types and Interfaces
 *
 * Defines the state machine enums and data model for the "Watch -> Try -> Compare -> Ready" tutorial flow.
 */

import { TileColor } from '../types';

// ===========================================
// ENUMS
// ===========================================

/**
 * Main tutorial phases that correspond to the overall user journey
 */
export enum TutorialPhase {
  Watch = 'watch',
  Try = 'try',
  Compare = 'compare',
  Ready = 'ready',
  Complete = 'complete'
}

/**
 * Watch phase sub-states for the 4-move demo sequence.
 * The user advances each step manually with Start/Next.
 */
export enum WatchStepState {
  Intro = 0,
  Move1 = 1,
  Move2 = 2,
  Move3 = 3,
  Move4 = 4,
  Win = 5
}

// ===========================================
// INTERFACES
// ===========================================

/**
 * Position on the grid
 */
export interface GridPosition {
  row: number;
  col: number;
}

/**
 * A tutorial move with color information
 */
export interface TutorialMove {
  row: number;
  col: number;
  fromColor: TileColor;
  targetColor: TileColor;
}

/**
 * Main tutorial state managed by useReducer
 */
export interface TutorialState {
  /** Current phase of the tutorial */
  phase: TutorialPhase;

  /** Current step within the watch phase */
  watchStep: WatchStepState;

  /** Grid state for the demo in watch phase */
  demoGrid: TileColor[][];

  /** Grid state for user interaction in try phase */
  interactiveGrid: TileColor[][];

  /** Current practice puzzle index in try phase */
  currentTryPuzzleIndex: number;

  /** Locked cells in the demo grid (watch phase) */
  demoLockedCells: Set<string>;

  /** Locked cells in the interactive grid (try phase) */
  lockedCells: Set<string>;

  /** Number of moves the user has made in try phase */
  userMoveCount: number;

  /** Whether the user has solved the puzzle in try phase */
  isSolved: boolean;

  /** Whether the user has lost the current try puzzle */
  isTryLost: boolean;

  /** Whether the demo is auto-playing */
  isAutoPlaying: boolean;

  /** Whether to show the skip confirmation dialog */
  showSkipConfirmation: boolean;

  /** Whether the color picker is visible */
  showColorPicker: boolean;

  /** Currently selected tile for color picking */
  selectedTile: GridPosition | null;

  /** Whether to show soft-fail warning after too many moves */
  showSoftFailWarning: boolean;

  /** Whether the tutorial modal is open */
  isOpen: boolean;

  /** Whether user has completed tutorial before */
  hasCompletedBefore: boolean;
}

/**
 * Action types for the tutorial reducer
 */
export type TutorialAction =
  | { type: 'OPEN_TUTORIAL' }
  | { type: 'CLOSE_TUTORIAL' }
  | { type: 'START_WATCH_PHASE' }
  | { type: 'ADVANCE_WATCH_STEP' }
  | { type: 'SET_WATCH_STEP'; step: WatchStepState }
  | { type: 'START_TRY_PHASE' }
  | { type: 'NEXT_TRY_PUZZLE' }
  | { type: 'RESET_CURRENT_TRY_PUZZLE' }
  | { type: 'SELECT_TILE'; position: GridPosition }
  | { type: 'DESELECT_TILE' }
  | { type: 'APPLY_COLOR'; color: TileColor }
  | { type: 'START_COMPARE_PHASE' }
  | { type: 'START_READY_PHASE' }
  | { type: 'COMPLETE_TUTORIAL' }
  | { type: 'RESET_FOR_REPLAY' }
  | { type: 'UPDATE_DEMO_GRID'; grid: TileColor[][]; lockedCells: Set<string> }
  | { type: 'UPDATE_INTERACTIVE_GRID'; grid: TileColor[][]; lockedCells: Set<string> }
  | { type: 'SET_AUTO_PLAYING'; isAutoPlaying: boolean }
  | { type: 'SHOW_SKIP_CONFIRMATION' }
  | { type: 'HIDE_SKIP_CONFIRMATION' }
  | { type: 'SHOW_SOFT_FAIL_WARNING' }
  | { type: 'HIDE_SOFT_FAIL_WARNING' }
  | { type: 'SET_SOLVED' };

/**
 * Context value provided to consumers
 */
export interface TutorialContextValue {
  // State
  state: TutorialState;

  // Tutorial modal controls
  openTutorial: () => void;
  closeTutorial: () => void;

  // Phase navigation
  startWatchPhase: () => void;
  advanceWatchStep: () => void;
  startTryPhase: () => void;
  nextTryPuzzle: () => void;
  resetCurrentTryPuzzle: () => void;
  startComparePhase: () => void;
  startReadyPhase: () => void;
  completeTutorial: () => void;
  resetForReplay: () => void;

  // User interaction
  selectTile: (position: GridPosition) => void;
  deselectTile: () => void;
  applyColor: (color: TileColor) => void;

  // Auto-play control
  setAutoPlaying: (isAutoPlaying: boolean) => void;

  // Skip confirmation
  showSkipConfirmation: () => void;
  hideSkipConfirmation: () => void;
  confirmSkip: () => void;

  // Soft fail warning
  hideSoftFailWarning: () => void;

  // Helper getters
  getCurrentMoveIndex: () => number;
  isWatchPhaseComplete: () => boolean;
}
