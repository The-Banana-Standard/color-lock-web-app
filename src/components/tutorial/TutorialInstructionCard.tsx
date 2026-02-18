/**
 * TutorialInstructionCard Component
 *
 * A color-coded instruction card for the watch phase.
 * Always renders in the DOM for layout stability; toggles visibility via opacity.
 */

import React from 'react';

interface TutorialInstructionCardProps {
  /** Instruction text to display */
  text: string;
  /** CSS color for the card's background tint and border */
  color: string;
  /** Whether the card is visible */
  visible: boolean;
}

/**
 * Convert a hex color to rgba with given alpha.
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const TutorialInstructionCard: React.FC<TutorialInstructionCardProps> = ({
  text,
  color,
  visible
}) => {
  const classes = ['tutorial-instruction-card'];
  if (!visible) classes.push('tutorial-instruction-card--hidden');

  return (
    <div
      className={classes.join(' ')}
      style={{
        '--card-bg-color': hexToRgba(color, 0.15),
        '--card-border-color': hexToRgba(color, 0.6)
      } as React.CSSProperties}
      aria-hidden={!visible}
    >
      {text}
    </div>
  );
};

export default TutorialInstructionCard;
