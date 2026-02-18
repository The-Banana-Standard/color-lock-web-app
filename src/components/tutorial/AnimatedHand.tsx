/**
 * AnimatedHand Component
 *
 * Displays an animated hand pointer that points at target tiles or picker bubbles.
 * Always renders (opacity toggle) to allow smooth CSS transitions.
 */

import React from 'react';

interface AnimatedHandProps {
  /** Whether the hand is visible */
  visible: boolean;
  /** Whether the hand should animate a tap */
  isTapping: boolean;
  /** X position relative to the parent container */
  x: number;
  /** Y position relative to the parent container */
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
  const classes = ['animated-hand'];
  if (isTapping) classes.push('animated-hand--tapping');
  if (!visible) classes.push('animated-hand--hidden');

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
