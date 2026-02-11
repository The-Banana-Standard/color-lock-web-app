/**
 * Animation Timing Constants
 *
 * Centralized timing values for tutorial animations.
 * Matches iOS AnimationTimings.swift for consistency.
 */

// ===========================================
// MICRO ANIMATIONS (< 200ms)
// ===========================================

/** Duration for hand tap down animation */
export const HAND_TAP_DOWN_DURATION = 150;

/** Duration for quick UI feedback */
export const MICRO_FEEDBACK_DURATION = 100;

// ===========================================
// STANDARD ANIMATIONS (200-400ms)
// ===========================================

/** Duration for hand tap spring back */
export const HAND_TAP_SPRING_DURATION = 300;

/** Duration for tile color change transition */
export const COLOR_CHANGE_DURATION = 300;

/** Duration for modal/overlay transitions */
export const MODAL_TRANSITION_DURATION = 300;

/** Duration for fade in/out effects */
export const FADE_DURATION = 200;

// ===========================================
// STEP DELAYS (500ms+)
// ===========================================

/** Delay before advancing to next step in watch phase */
export const STEP_ADVANCE_DELAY = 500;

/** Delay to show lock icon after move */
export const LOCK_DISPLAY_DELAY = 600;

/** Duration for score count-up animation */
export const SCORE_COUNTUP_DURATION = 600;

/** Delay between auto-play moves in watch phase */
export const REPLAY_MOVE_DELAY = 1500;

/** Delay after solving before advancing */
export const SOLVE_ADVANCE_DELAY = 1000;

// ===========================================
// COMPUTED DURATIONS
// ===========================================

/** Total duration for a single tap animation (down + spring) */
export const TOTAL_TAP_DURATION = HAND_TAP_DOWN_DURATION + HAND_TAP_SPRING_DURATION;

/** Duration for each move in auto-play sequence */
export const AUTO_PLAY_MOVE_DURATION = REPLAY_MOVE_DELAY;

// ===========================================
// CSS TIMING STRINGS
// ===========================================

/** CSS timing for standard easing */
export const EASE_DEFAULT = 'ease-in-out';

/** CSS timing for spring-like easing */
export const EASE_SPRING = 'cubic-bezier(0.68, -0.55, 0.265, 1.55)';

/** CSS timing for smooth out easing */
export const EASE_OUT = 'ease-out';

// ===========================================
// REDUCED MOTION
// ===========================================

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get duration adjusted for reduced motion preference
 */
export function getAdjustedDuration(duration: number): number {
  return prefersReducedMotion() ? 0 : duration;
}

/**
 * Get delay adjusted for reduced motion preference
 */
export function getAdjustedDelay(delay: number): number {
  return prefersReducedMotion() ? Math.min(delay, 100) : delay;
}
