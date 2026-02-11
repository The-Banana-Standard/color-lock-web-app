/**
 * TutorialColorPicker Component
 *
 * A bottom sheet color picker for the tutorial try phase.
 * Displays all available colors as selectable bubbles.
 */

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { TileColor, allColors } from '../../types';
import { tileColorToName } from '../../utils/shareUtils';

interface TutorialColorPickerProps {
  /** Whether the picker is visible */
  isOpen: boolean;
  /** Currently selected tile's color */
  currentColor: TileColor;
  /** Handler when a color is selected */
  onSelect: (color: TileColor) => void;
  /** Handler when picker is cancelled/closed */
  onCancel: () => void;
  /** Function to get CSS color value */
  getColorCSS: (color: TileColor) => string;
}

const TutorialColorPicker: React.FC<TutorialColorPickerProps> = ({
  isOpen,
  currentColor,
  onSelect,
  onCancel,
  getColorCSS
}) => {
  if (!isOpen) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="tutorial-color-picker-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-label="Select a color"
      aria-modal="true"
    >
      <div className="tutorial-color-picker">
        <div className="tutorial-color-picker__bubbles">
          {allColors.map((color) => {
            const isCurrentColor = color === currentColor;
            const colorName = tileColorToName(color);

            return (
              <div key={color} className="tutorial-color-picker__item">
                <button
                  className={`tutorial-color-picker__bubble ${isCurrentColor ? 'tutorial-color-picker__bubble--current' : ''}`}
                  style={{ backgroundColor: getColorCSS(color) }}
                  onClick={() => !isCurrentColor && onSelect(color)}
                  disabled={isCurrentColor}
                  aria-label={`${isCurrentColor ? 'Current color: ' : 'Select '}${colorName}`}
                >
                  {isCurrentColor && (
                    <FontAwesomeIcon
                      icon={faCheck}
                      className="tutorial-color-picker__check"
                    />
                  )}
                </button>
                <span className="tutorial-color-picker__label">{colorName}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TutorialColorPicker;
