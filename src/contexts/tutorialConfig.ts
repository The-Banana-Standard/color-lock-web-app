/**
 * Tutorial Configuration
 *
 * Contains the 3x3 puzzle data, optimal solution, and phase messages.
 * This matches the iOS TutorialPuzzle.swift implementation.
 */

import { TileColor } from '../types';
import { TutorialMove, WatchStepState } from './tutorialTypes';

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
 * This is a 3x3 grid matching the iOS implementation.
 *
 * Visual representation:
 *   [Red]    [Red]    [Yellow]
 *   [Blue]   [Yellow] [Green]
 *   [Purple] [Blue]   [Yellow]
 */
export const TUTORIAL_STARTING_GRID: TileColor[][] = [
  [TileColor.Red, TileColor.Red, TileColor.Yellow],
  [TileColor.Blue, TileColor.Yellow, TileColor.Green],
  [TileColor.Purple, TileColor.Blue, TileColor.Yellow]
];

/**
 * Optimal solution to solve the puzzle in 4 moves.
 * Each move targets a tile and changes it to connect with adjacent regions.
 *
 * Move 1: Purple (2,0) -> Blue (connects the blues)
 * Move 2: Green (1,2) -> Yellow (connects the yellows)
 * Move 3: Blue (1,0) -> Red (blues become red)
 * Move 4: Yellow (0,2) -> Red (yellows become red)
 */
export const TUTORIAL_OPTIMAL_SOLUTION: TutorialMove[] = [
  { row: 2, col: 0, fromColor: TileColor.Purple, targetColor: TileColor.Blue },
  { row: 1, col: 2, fromColor: TileColor.Green, targetColor: TileColor.Yellow },
  { row: 1, col: 0, fromColor: TileColor.Blue, targetColor: TileColor.Red },
  { row: 0, col: 2, fromColor: TileColor.Yellow, targetColor: TileColor.Red }
];

export interface TutorialTryPuzzleConfig {
  id: string;
  targetColor: TileColor;
  goalMoves: number;
  startingGrid: TileColor[][];
  indicatorColor: string;
}

export const TUTORIAL_TRY_PUZZLES: TutorialTryPuzzleConfig[] = [
  {
    id: 'tutorial-puzzle-1',
    targetColor: TileColor.Red,
    goalMoves: 4,
    startingGrid: [
      [TileColor.Red, TileColor.Red, TileColor.Yellow],
      [TileColor.Blue, TileColor.Yellow, TileColor.Green],
      [TileColor.Purple, TileColor.Blue, TileColor.Yellow]
    ],
    indicatorColor: '#cf7e98'
  },
  {
    id: 'tutorial-puzzle-2',
    targetColor: TileColor.Blue,
    goalMoves: 5,
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
    goalMoves: 6,
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

export const WATCH_PHASE_MESSAGES: Record<string, PhaseMessage> = {
  intro: {
    title: 'Watch How It Works',
    message: 'Click start to solve this puzzle',
    buttonText: 'Start'
  },
  move1: {
    title: 'Watch How It Works',
    message: 'Click Next to change purple to blue.\nThis connects 3 blues together.',
    buttonText: 'Next'
  },
  move2: {
    title: 'Watch How It Works',
    message: 'Blue is now the largest region - it locks!\nClick Next to change green to yellow.',
    buttonText: 'Next'
  },
  move3: {
    title: 'Watch How It Works',
    message: 'Click Next to change blue to red.\nWe are building towards the target color.',
    buttonText: 'Next'
  },
  move4: {
    title: 'Watch How It Works',
    message: 'Click Next to change yellow to red.\nThe final move locks the whole board as the target color!',
    buttonText: 'Next'
  },
  win: {
    title: 'Watch How It Works',
    message: 'Solved in just 4 moves!',
    buttonText: 'Now You Try!'
  }
};

export const TRY_PHASE_MESSAGES: PhaseMessage = {
  title: 'Now You Try!',
  message: 'Click a tile to change its color'
};

export const COMPARE_PHASE_MESSAGES = {
  optimal: {
    title: 'Perfect!',
    message: 'You solved it in the optimal number of moves!'
  },
  good: {
    title: 'Great Job!',
    message: (userMoves: number) => `You solved it in ${userMoves} moves. The optimal is ${TUTORIAL_OPTIMAL_MOVES}.`
  },
  needsPractice: {
    title: 'Keep Practicing!',
    message: (userMoves: number) => `You used ${userMoves} moves. Try to get closer to ${TUTORIAL_OPTIMAL_MOVES}!`
  }
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
 * Get the message key for the current watch step
 */
export function getWatchStepMessageKey(step: WatchStepState): string {
  if (step === WatchStepState.Intro) return 'intro';
  if (step === WatchStepState.Win) return 'win';

  if (step === WatchStepState.Move1) return 'move1';
  if (step === WatchStepState.Move2) return 'move2';
  if (step === WatchStepState.Move3) return 'move3';
  if (step === WatchStepState.Move4) return 'move4';

  return 'intro';
}

/**
 * Get the move index (0-3) for the current watch step
 */
export function getMoveIndexForWatchStep(step: WatchStepState): number {
  if (step === WatchStepState.Move1) return 0;
  if (step === WatchStepState.Move2) return 1;
  if (step === WatchStepState.Move3) return 2;
  if (step === WatchStepState.Move4 || step === WatchStepState.Win) return 3;
  return -1;
}

/**
 * Check if the current step is a highlight step (hand should be visible)
 */
export function isHighlightStep(step: WatchStepState): boolean {
  return [
    WatchStepState.Move1,
    WatchStepState.Move2,
    WatchStepState.Move3,
    WatchStepState.Move4
  ].includes(step);
}

/**
 * Check if the current step is a tap step (hand should animate tap)
 */
export function isTapStep(step: WatchStepState): boolean {
  return false;
}

/**
 * Check if the current step is a lock step (show lock animation)
 */
export function isLockStep(step: WatchStepState): boolean {
  return false;
}

/**
 * Get compare phase message based on user performance
 */
export function getCompareMessage(userMoves: number): PhaseMessage {
  if (userMoves === TUTORIAL_OPTIMAL_MOVES) {
    return COMPARE_PHASE_MESSAGES.optimal;
  } else if (userMoves <= TUTORIAL_OPTIMAL_MOVES + 2) {
    return {
      title: COMPARE_PHASE_MESSAGES.good.title,
      message: COMPARE_PHASE_MESSAGES.good.message(userMoves)
    };
  } else {
    return {
      title: COMPARE_PHASE_MESSAGES.needsPractice.title,
      message: COMPARE_PHASE_MESSAGES.needsPractice.message(userMoves)
    };
  }
}

/**
 * Create a deep copy of the starting grid
 */
export function createFreshGrid(): TileColor[][] {
  return TUTORIAL_STARTING_GRID.map(row => [...row]);
}

export function getTryPuzzleConfig(index: number): TutorialTryPuzzleConfig {
  const clampedIndex = Math.max(0, Math.min(index, TUTORIAL_TRY_PUZZLES.length - 1));
  return TUTORIAL_TRY_PUZZLES[clampedIndex];
}

export function createFreshTryGrid(index: number): TileColor[][] {
  return getTryPuzzleConfig(index).startingGrid.map(row => [...row]);
}
