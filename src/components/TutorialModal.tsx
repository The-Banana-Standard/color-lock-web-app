import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { useTutorialContext, TutorialStep } from '../contexts/TutorialContext';
import { useModalClickOutside } from '../utils/modalUtils';

/**
 * Props for the TutorialModal component
 */
interface TutorialModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Function to call when the modal is closed */
  onClose: () => void;
  /** Type of modal to display - intro shows the initial tutorial prompt, step shows tutorial instructions */
  type?: 'intro' | 'step';
}

/**
 * Helper function to colorize color names in text
 * @param text The text to process
 * @returns React nodes with colored spans for color names
 */
const colorizeText = (text: string): React.ReactNode => {
  const colorNames = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white', 'black'];
  const colorPattern = new RegExp(`\\b(${colorNames.join('|')})\\b`, 'gi');

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = colorPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const colorName = match[1].toLowerCase();
    parts.push(
      <span key={match.index} className={`tutorial-color-text tutorial-color-${colorName}`}>
        {match[0]}
      </span>
    );
    lastIndex = colorPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
};

/**
 * Helper function to render text with line breaks
 * @param text The text to process
 * @returns React nodes with proper line breaks
 */
const renderTextWithLineBreaks = (text: string | React.ReactNode): React.ReactNode => {
  if (typeof text !== 'string') {
    return text;
  }
  
  return text.split('\n').map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </React.Fragment>
  ));
};

/**
 * Modal component that displays tutorial information
 * 
 * This component has two modes:
 * 1. 'intro' - Shows an initial prompt asking if the user wants to start the tutorial
 * 2. 'step' - Shows instructions for the current tutorial step
 */
const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose, type = 'intro' }) => {
  const { 
    startTutorial, 
    nextStep, 
    currentStep, 
    getCurrentStepConfig,
    showColorPicker,
    endTutorial,
    demonstrationMessage
  } = useTutorialContext();
  
  // Calculate the total number of steps in the tutorial
  const totalSteps = Object.keys(TutorialStep).length / 2; // Divide by 2 because enum creates both key->value and value->key mappings
  
  // Get the current step number (starting from 1 for user-friendly display)
  const currentStepNumber = currentStep + 1;
  
  // Use the custom hook for handling click outside
  const modalRef = useModalClickOutside(onClose, isOpen);
  
  // If the modal is not open, don't render anything
  if (!isOpen) return null;
  
  // If this is a tutorial step modal, use the current step config
  if (type === 'step') {
    const { title, message } = getCurrentStepConfig();
    
    // Determine if we should show a continue button based on step
    const shouldShowContinueButton = ![
      TutorialStep.FIRST_MOVE_SELECTION,
      TutorialStep.COLOR_SELECTION,
      TutorialStep.SOLUTION_DEMONSTRATION
    ].includes(currentStep);
    
    // Position at the top when color picker is visible
    const positionClass = showColorPicker ? 'tutorial-step-modal-top' : 'tutorial-step-modal-bottom';
    
    // Add special styling for COLOR_SELECTION step to draw attention to it
    const stepSpecificClass = currentStep === TutorialStep.COLOR_SELECTION ? 'tutorial-color-selection-step' : '';
    
    // Handle continue button click
    const handleContinueClick = () => {
      if (currentStep === TutorialStep.WINNING_COMPLETION) {
        endTutorial();
      } else {
        nextStep();
      }
    };
    
    // Choose which message to display - use the dynamic message during solution demonstration
    const displayMessage = currentStep === TutorialStep.SOLUTION_DEMONSTRATION && demonstrationMessage 
      ? demonstrationMessage
      : message;
    
    return (
      <div className={`tutorial-step-modal ${positionClass} ${stepSpecificClass}`}>
        <div className="tutorial-step-content" ref={modalRef}>
          <div className="tutorial-step-header">
            <h3 className="tutorial-step-title">{title}</h3>
            <span className="tutorial-step-counter">Step {currentStepNumber} of {totalSteps}</span>
          </div>
          <p className="tutorial-step-message">
            {colorizeText(displayMessage)}
          </p>
          
          {shouldShowContinueButton && (
            <button 
              className="tutorial-continue-button"
              onClick={handleContinueClick}
            >
              {currentStep === TutorialStep.WINNING_COMPLETION ? "Play Today's Puzzle" : "Continue"}
            </button>
          )}
        </div>
      </div>
    );
  }
  
  // Default intro modal asking if user wants to start tutorial
  return (
    <div className="modal-overlay">
      <div className="modal-content" ref={modalRef}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faTimes} />
        </button>
        <div className="modal-body">
          <h2 className="tutorial-modal-title">Color Lock Tutorial</h2>
          <p>Would you like to see the Color Lock Tutorial?</p>
          <p className="tutorial-steps-info">This tutorial will take you through an example game</p>
          <div className="modal-buttons">
            <button 
              className="inverse-share-button"
              onClick={onClose}
            >
              No
            </button>
            <button 
              className="share-button"
              onClick={() => {
                startTutorial();
                onClose();
              }}
            >
              Yes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialModal; 