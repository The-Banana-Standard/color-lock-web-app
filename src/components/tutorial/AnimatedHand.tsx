/**
 * AnimatedHand Component
 *
 * Displays an animated hand pointer that taps on target tiles during the watch phase.
 */

import React from 'react';

interface AnimatedHandProps {
  /** Whether the hand is visible */
  visible: boolean;
  /** Whether the hand should animate a tap */
  isTapping: boolean;
  /** X position relative to the grid (percentage or px) */
  x: number;
  /** Y position relative to the grid (percentage or px) */
  y: number;
  /** Size of the hand icon */
  size?: number;
}

const AnimatedHand: React.FC<AnimatedHandProps> = ({
  visible,
  isTapping,
  x,
  y,
  size = 42
}) => {
  if (!visible) {
    return null;
  }

  const classes = ['animated-hand'];
  if (isTapping) classes.push('animated-hand--tapping');

  return (
    <div
      className={classes.join(' ')}
      style={{
        left: x,
        top: y,
        fontSize: size
      }}
      aria-hidden="true"
    >
      <span className="animated-hand__emoji">{String.fromCodePoint(0x1f446)}</span>
    </div>
  );
};

export default AnimatedHand;
