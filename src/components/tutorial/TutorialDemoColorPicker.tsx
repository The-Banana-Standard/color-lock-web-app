/**
 * TutorialDemoColorPicker Component
 *
 * A floating color picker for the watch phase interactive demo.
 * Displays all 6 color bubbles with the target color highlighted.
 */

import React from 'react';
import { TileColor, allColors } from '../../types';
import AnimatedHand from './AnimatedHand';

interface TutorialDemoColorPickerProps {
  /** The color that should be highlighted as the target */
  highlightedColor: TileColor;
  /** Callback when a color is selected */
  onColorSelect: (color: TileColor) => void;
  /** Function to get CSS color value */
  getColorCSS: (color: TileColor) => string;
  /** Whether to show the animated hand on the highlighted color */
  showHand?: boolean;
}

const TutorialDemoColorPicker: React.FC<TutorialDemoColorPickerProps> = ({
  highlightedColor,
  onColorSelect,
  getColorCSS,
  showHand = false
}) => {
  return (
    <div className="tutorial-demo-picker" role="group" aria-label="Color picker">
      <div className="tutorial-demo-picker__label">Color Picker</div>
      <div className="tutorial-demo-picker__bubbles">
        {allColors.map((color) => {
          const isHighlighted = color === highlightedColor;
          const classes = ['tutorial-demo-picker__bubble'];
          if (isHighlighted) classes.push('tutorial-demo-picker__bubble--highlighted');

          return (
            <button
              key={color}
              className={classes.join(' ')}
              style={{ backgroundColor: getColorCSS(color) }}
              onClick={() => onColorSelect(color)}
              aria-label={`Select ${color}${isHighlighted ? ' (recommended)' : ''}`}
              data-color={color}
            >
              {isHighlighted && showHand && (
                <AnimatedHand
                  visible={true}
                  isTapping={false}
                  x={22}
                  y={52}
                  size={36}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="tutorial-demo-picker__sublabel">(Demo)</div>
    </div>
  );
};

export default TutorialDemoColorPicker;
