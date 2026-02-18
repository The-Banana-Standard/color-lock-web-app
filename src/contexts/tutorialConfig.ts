/**
 * Tutorial Configuration
 *
 * Contains the 3x3 puzzle data, optimal solution, watch demo move definitions,
 * instruction card content, and try puzzle configs.
 */

import { TileColor } from '../types';
import { TutorialMove, StartingBoardPhase } from './tutorialTypes';

// ===========================================
// PUZZLE CONFIGURATION
// ===========================================

/** Grid size for the tutorial puzzle */
export const TUTORIAL_GRID_SIZE = 3;

/** Target color that all tiles must become to win */
export const TUTORIAL_TARGET_COLOR: TileColor = TileColor.Red;

/** Optimal number of moves to solve the puzzle */
export const TUTORIAL_OPTIMAL_MOVES = 4;

/** Soft fail warning threshold (show hint after this many moves) */
export const TUTORIAL_SOFT_FAIL_THRESHOLD = 10;

/** Loss threshold for tutorial try puzzles */
export const TUTORIAL_TRY_LOSS_LOCK_THRESHOLD = 5;

/**
 * Starting grid configuration for the tutorial puzzle.
 * This is a 3x3 grid matching the web implementation.
 *
 * Visual representation:
 *   [Yellow] [Yellow] [Red]
 *   [Blue]   [Red]    [Green]
 *   [Purple] [Blue]   [Red]
 */
export const TUTORIAL_STARTING_GRID: TileColor[][] = [
  [TileColor.Yellow, TileColor.Yellow, TileColor.Red],
  [TileColor.Blue, TileColor.Red, TileColor.Green],
  [TileColor.Purple, TileColor.Blue, TileColor.Red]
];

/**
 * Optimal solution to solve the puzzle in 4 moves.
 * Each move targets a tile and changes it to connect with adjacent regions.
 *
 * Move 1: Green (1,2) -> Red (connects with adjacent reds, creating group of 4)
 * Move 2: Purple (2,0) -> Blue (connects the blues)
 * Move 3: Blue (1,0) -> Red (blues become red)
 * Move 4: Yellow (0,0) -> Red (yellows become red)
 */
export const TUTORIAL_OPTIMAL_SOLUTION: TutorialMove[] = [
  { row: 1, col: 2, fromColor: TileColor.Green, targetColor: TileColor.Red },
  { row: 2, col: 0, fromColor: TileColor.Purple, targetColor: TileColor.Blue },
  { row: 1, col: 0, fromColor: TileColor.Blue, targetColor: TileColor.Red },
  { row: 0, col: 0, fromColor: TileColor.Yellow, targetColor: TileColor.Red }
];

// ===========================================
// WATCH DEMO MOVE DEFINITIONS
// ===========================================

export interface WatchDemoMove {
  /** Tile the user taps */
  tapRow: number;
  tapCol: number;
  /** Color to select in picker */
  targetColor: TileColor;
  /** Which StartingBoardPhase the tap triggers from */
  waitingPhase: StartingBoardPhase;
  /** Which StartingBoardPhase the picker opens to */
  pickerPhase: StartingBoardPhase;
  /** Which StartingBoardPhase shows the result */
  resultPhase: StartingBoardPhase;
}

/**
 * The 4 hardcoded moves for the interactive watch demo.
 * Specific to the web's puzzle 0 grid.
 *
 * The 4 hardcoded moves for the interactive watch demo.
 *
 * - Move 1: Tap green tile at [1,2] -> change to red (creates group of 4 reds)
 * - Move 2: Tap purple tile at [2,0] -> change to blue (connects the blues)
 * - Move 3: Tap blue tile at [1,0] -> change to red (blues become red)
 * - Move 4: Tap yellow tile at [0,0] -> change to red (yellows become red)
 */
export const WATCH_DEMO_MOVES: WatchDemoMove[] = [
  {
    tapRow: 1, tapCol: 2,
    targetColor: TileColor.Red,
    waitingPhase: StartingBoardPhase.WaitingForTileTap,
    pickerPhase: StartingBoardPhase.PickerOpen,
    resultPhase: StartingBoardPhase.ResultShown
  },
  {
    tapRow: 2, tapCol: 0,
    targetColor: TileColor.Blue,
    waitingPhase: StartingBoardPhase.WaitingForPurpleTap,
    pickerPhase: StartingBoardPhase.PurplePickerOpen,
    resultPhase: StartingBoardPhase.PurpleResultShown
  },
  {
    tapRow: 1, tapCol: 0,
    targetColor: TileColor.Red,
    waitingPhase: StartingBoardPhase.WaitingForBlueTap,
    pickerPhase: StartingBoardPhase.BluePickerOpen,
    resultPhase: StartingBoardPhase.BlueResultShown
  },
  {
    tapRow: 0, tapCol: 0,
    targetColor: TileColor.Red,
    waitingPhase: StartingBoardPhase.WaitingForYellowTap,
    pickerPhase: StartingBoardPhase.YellowPickerOpen,
    resultPhase: StartingBoardPhase.PuzzleCompleted
  }
];

// ===========================================
// INSTRUCTION CARD CONFIGURATION
// ===========================================

export interface InstructionCardConfig {
  text: string;
  color: string; // CSS color for card background/border
}

export const INSTRUCTION_CARDS: Partial<Record<StartingBoardPhase, InstructionCardConfig>> = {
  [StartingBoardPhase.WaitingForTileTap]: {
    text: 'Tap the highlighted tile to change its color.',
    color: '#e07766' // coral
  },
  [StartingBoardPhase.PickerOpen]: {
    text: 'Turning this tile red connects it with the surrounding red tiles, creating a new group of 4.',
    color: '#d4a843' // gold
  },
  [StartingBoardPhase.ResultShown]: {
    text: 'As the new largest group, the reds lock. You can\'t change locked tiles until a bigger group forms.',
    color: '#e07766' // coral
  },
  [StartingBoardPhase.WaitingForPurpleTap]: {
    text: 'As the new largest group, the reds lock. You can\'t change locked tiles until a bigger group forms.',
    color: '#e07766' // coral (same card persists)
  },
  [StartingBoardPhase.PurplePickerOpen]: {
    text: 'Creating groups helps you complete puzzles in fewer moves.',
    color: '#c27ba0' // mauve pink
  },
  [StartingBoardPhase.PurpleResultShown]: {
    text: 'Finish this puzzle by changing the two remaining groups to red.',
    color: '#7fa87a' // sage green
  },
  [StartingBoardPhase.WaitingForBlueTap]: {
    text: 'Finish this puzzle by changing the two remaining groups to red.',
    color: '#7fa87a' // sage green
  },
  [StartingBoardPhase.BluePickerOpen]: {
    text: 'Finish this puzzle by changing the two remaining groups to red.',
    color: '#7fa87a'
  },
  [StartingBoardPhase.BlueResultShown]: {
    text: 'Finish this puzzle by changing the two remaining groups to red.',
    color: '#7fa87a'
  },
  [StartingBoardPhase.WaitingForYellowTap]: {
    text: 'Finish this puzzle by changing the two remaining groups to red.',
    color: '#7fa87a'
  },
  [StartingBoardPhase.YellowPickerOpen]: {
    text: 'Finish this puzzle by changing the two remaining groups to red.',
    color: '#7fa87a'
  },
  [StartingBoardPhase.PuzzleCompleted]: {
    text: 'Solved in just 4 moves!',
    color: '#7fa87a' // sage green
  }
};

export const PREINTRO_INSTRUCTION: InstructionCardConfig = {
  text: 'Turn every tile into the target color.',
  color: '#7fa87a' // sage green
};

export const PREINTRO_HINT = 'Click "Reset Puzzle" to see how this puzzle was solved.';

// ===========================================
// TRY PUZZLE CONFIGURATION
// ===========================================

export interface TutorialTryPuzzleConfig {
  id: string;
  targetColor: TileColor;
  goalMoves: number;
  startingGrid: TileColor[][];
  indicatorColor: string;
}

export const TUTORIAL_TRY_PUZZLES: TutorialTryPuzzleConfig[] = [
  {
    id: 'tutorial-puzzle-2',
    targetColor: TileColor.Blue,
    goalMoves: 4,
    startingGrid: [
      [TileColor.Blue, TileColor.Blue, TileColor.Green],
      [TileColor.Blue, TileColor.Purple, TileColor.Orange],
      [TileColor.Blue, TileColor.Orange, TileColor.Green]
    ],
    indicatorColor: '#4ca9ef'
  },
  {
    id: 'tutorial-puzzle-3',
    targetColor: TileColor.Green,
    goalMoves: 4,
    startingGrid: [
      [TileColor.Blue, TileColor.Green, TileColor.Orange],
      [TileColor.Blue, TileColor.Orange, TileColor.Red],
      [TileColor.Green, TileColor.Blue, TileColor.Orange]
    ],
    indicatorColor: '#a6bf59'
  }
];

export const TUTORIAL_TRY_PUZZLE_COUNT = TUTORIAL_TRY_PUZZLES.length;

// ===========================================
// PHASE MESSAGES
// ===========================================

export interface PhaseMessage {
  title: string;
  message: string;
  buttonText?: string;
}

export const TRY_PHASE_MESSAGES: PhaseMessage = {
  title: 'Now You Try!',
  message: 'Click a tile to change its color'
};

export const READY_PHASE_MESSAGES: PhaseMessage = {
  title: "You're Ready!",
  message: 'Now try to beat the daily goal.',
  buttonText: 'Start Playing'
};

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Create a deep copy of the starting grid
 */
export function createFreshGrid(): TileColor[][] {
  return TUTORIAL_STARTING_GRID.map(row => [...row]);
}

/**
 * Create a completed grid (all tiles = target color) for PreIntro display
 */
export function createCompletedGrid(): TileColor[][] {
  return Array.from({ length: TUTORIAL_GRID_SIZE }, () =>
    Array.from({ length: TUTORIAL_GRID_SIZE }, () => TUTORIAL_TARGET_COLOR)
  );
}

/**
 * Create a set of all cell keys for the grid (used for locking all cells)
 */
export function createAllLockedCells(): Set<string> {
  const cells = new Set<string>();
  for (let r = 0; r < TUTORIAL_GRID_SIZE; r++) {
    for (let c = 0; c < TUTORIAL_GRID_SIZE; c++) {
      cells.add(`${r},${c}`);
    }
  }
  return cells;
}

export function getTryPuzzleConfig(index: number): TutorialTryPuzzleConfig {
  const clampedIndex = Math.max(0, Math.min(index, TUTORIAL_TRY_PUZZLES.length - 1));
  return TUTORIAL_TRY_PUZZLES[clampedIndex];
}

export function createFreshTryGrid(index: number): TileColor[][] {
  return getTryPuzzleConfig(index).startingGrid.map(row => [...row]);
}
