/**
 * AnimatedHand Component
 *
 * Displays an animated hand pointer that points at target tiles or picker bubbles.
 * Fades out in place, repositions while hidden, then fades in at the new location.
 */

import React, { useRef, useEffect, useState } from 'react';

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

const FADE_DURATION = 200; // matches CSS opacity transition

const AnimatedHand: React.FC<AnimatedHandProps> = ({
  visible,
  isTapping,
  x,
  y,
  size = 42
}) => {
  // Track the rendered position separately so we can freeze it during fade-out
  const [renderPos, setRenderPos] = useState({ x, y });
  const [isHidden, setIsHidden] = useState(!visible);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (visible) {
      // Becoming visible: snap to new position instantly (while still hidden), then fade in
      clearTimeout(fadeTimerRef.current);
      setRenderPos({ x, y });
      // Use a microtask to ensure the position update renders before removing hidden class
      requestAnimationFrame(() => {
        setIsHidden(false);
      });
    } else {
      // Becoming hidden: fade out at current position, don't move
      setIsHidden(true);
      // After fade completes, snap position so it's ready for next fade-in
      fadeTimerRef.current = setTimeout(() => {
        setRenderPos({ x, y });
      }, FADE_DURATION);
    }

    return () => clearTimeout(fadeTimerRef.current);
  }, [visible, x, y]);

  // While visible, track position changes normally
  useEffect(() => {
    if (visible) {
      setRenderPos({ x, y });
    }
  }, [visible, x, y]);

  const classes = ['animated-hand'];
  if (isTapping) classes.push('animated-hand--tapping');
  if (isHidden) classes.push('animated-hand--hidden');

  return (
    <div
      className={classes.join(' ')}
      style={{
        left: renderPos.x,
        top: renderPos.y,
        fontSize: size
      }}
      aria-hidden="true"
    >
      <span className="animated-hand__emoji">{String.fromCodePoint(0x1f446)}</span>
    </div>
  );
};

export default AnimatedHand;
