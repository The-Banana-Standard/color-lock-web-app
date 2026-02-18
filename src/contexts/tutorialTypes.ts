/**
 * Tutorial Types and Interfaces
 *
 * Defines the state machine enums and data model for the "Watch -> Try -> Ready" tutorial flow.
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
  Ready = 'ready',
  Complete = 'complete'
}

/**
 * Watch phase top-level sub-states.
 * PreIntro shows the completed puzzle; StartingBoard is the interactive guided demo.
 */
export enum WatchStepState {
  PreIntro = 'preIntro',
  StartingBoard = 'startingBoard'
}

/**
 * Sub-phases within the StartingBoard interactive demo.
 *
 * Phase names reference iOS color names for cross-platform parity.
 * The web grid has different colors at those positions -- the names are
 * just identifiers, not descriptions of what the user sees.
 *
 * Move 1: Tap purple tile at [2,0] -> change to blue
 * Move 2: Tap green tile at [1,2] -> change to yellow ("WaitingForPurpleTap" in iOS naming)
 * Move 3: Tap blue tile at [1,0] -> change to red ("WaitingForBlueTap")
 * Move 4: Tap yellow tile at [0,0] -> change to red ("WaitingForYellowTap")
 */
export enum StartingBoardPhase {
  Transitioning = 'transitioning',
  WaitingForTileTap = 'waitingForTileTap',
  PickerOpen = 'pickerOpen',
  ResultShown = 'resultShown',
  WaitingForPurpleTap = 'waitingForPurpleTap',
  PurplePickerOpen = 'purplePickerOpen',
  PurpleResultShown = 'purpleResultShown',
  WaitingForBlueTap = 'waitingForBlueTap',
  BluePickerOpen = 'bluePickerOpen',
  BlueResultShown = 'blueResultShown',
  WaitingForYellowTap = 'waitingForYellowTap',
  YellowPickerOpen = 'yellowPickerOpen',
  PuzzleCompleted = 'puzzleCompleted'
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

  /** Sub-phase within StartingBoard interactive demo */
  startingBoardPhase: StartingBoardPhase;

  /** Whether the demo color picker is visible */
  showDemoPicker: boolean;

  /** Whether the tile spin transition is active */
  isTransitioningToStartingBoard: boolean;

  /** Whether the post-transition header should be visible */
  showPostTransitionHeader: boolean;
}

/**
 * Action types for the tutorial reducer
 */
export type TutorialAction =
  | { type: 'OPEN_TUTORIAL' }
  | { type: 'CLOSE_TUTORIAL' }
  | { type: 'START_WATCH_PHASE' }
  | { type: 'SET_WATCH_STEP'; step: WatchStepState }
  | { type: 'START_TRY_PHASE' }
  | { type: 'NEXT_TRY_PUZZLE' }
  | { type: 'RESET_CURRENT_TRY_PUZZLE' }
  | { type: 'SELECT_TILE'; position: GridPosition }
  | { type: 'DESELECT_TILE' }
  | { type: 'APPLY_COLOR'; color: TileColor }
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
  | { type: 'SET_SOLVED' }
  | { type: 'SET_STARTING_BOARD_PHASE'; phase: StartingBoardPhase }
  | { type: 'HANDLE_DEMO_TILE_TAP'; row: number; col: number }
  | { type: 'HANDLE_DEMO_PICKER_SELECT'; color: TileColor }
  | { type: 'SET_DEMO_PICKER_VISIBLE'; visible: boolean }
  | { type: 'SET_TRANSITIONING_TO_STARTING_BOARD'; transitioning: boolean }
  | { type: 'SET_POST_TRANSITION_HEADER'; visible: boolean }
  | { type: 'RESET_WATCH_PHASE' };

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
  startTryPhase: () => void;
  nextTryPuzzle: () => void;
  resetCurrentTryPuzzle: () => void;
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

  // Interactive watch demo
  handleDemoTileTap: (row: number, col: number) => void;
  handleDemoPickerSelect: (color: TileColor) => void;
  resetWatchPhase: () => void;
  setStartingBoardPhase: (phase: StartingBoardPhase) => void;
  setTransitioningToStartingBoard: (transitioning: boolean) => void;
  setPostTransitionHeader: (visible: boolean) => void;
  updateDemoGrid: (grid: TileColor[][], lockedCells: Set<string>) => void;
  setWatchStep: (step: WatchStepState) => void;
}
