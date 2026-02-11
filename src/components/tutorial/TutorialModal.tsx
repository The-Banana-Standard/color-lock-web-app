/**
 * TutorialModal Component
 *
 * Main container for the tutorial experience.
 * Routes to the appropriate phase component based on current state.
 */

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { TileColor } from '../../types';
import {
  useTutorialContext,
  TutorialPhase
} from '../../contexts/TutorialContext';
import TutorialWatchPhase from './TutorialWatchPhase';
import TutorialTryPhase from './TutorialTryPhase';
import TutorialComparePhase from './TutorialComparePhase';
import TutorialReadyPhase from './TutorialReadyPhase';
import SkipConfirmationModal from './SkipConfirmationModal';

interface TutorialModalProps {
  /** Function to get CSS color value */
  getColorCSS: (color: TileColor) => string;
}

const TutorialModal: React.FC<TutorialModalProps> = ({ getColorCSS }) => {
  const {
    state,
    closeTutorial,
    showSkipConfirmation,
    hideSkipConfirmation,
    confirmSkip
  } = useTutorialContext();

  const { isOpen, phase, showSkipConfirmation: isSkipConfirmationOpen, hasCompletedBefore } = state;

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  // Handle close button click
  const handleCloseClick = () => {
    // First-time users get confirmation, returning users can skip immediately
    if (hasCompletedBefore) {
      closeTutorial();
    } else {
      showSkipConfirmation();
    }
  };

  // Handle backdrop click (close on click outside)
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCloseClick();
    }
  };

  // Handle escape key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCloseClick();
    }
  };

  // Render the appropriate phase component
  const renderPhase = () => {
    switch (phase) {
      case TutorialPhase.Watch:
        return <TutorialWatchPhase getColorCSS={getColorCSS} />;
      case TutorialPhase.Try:
        return <TutorialTryPhase getColorCSS={getColorCSS} />;
      case TutorialPhase.Compare:
        return <TutorialComparePhase getColorCSS={getColorCSS} />;
      case TutorialPhase.Ready:
        return <TutorialReadyPhase getColorCSS={getColorCSS} />;
      default:
        return null;
    }
  };

  return (
    <>
      <div
        className="tutorial-modal-backdrop"
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="Tutorial"
        aria-modal="true"
      >
        <div className="tutorial-modal">
          {/* Close button */}
          <button
            className="tutorial-modal-close"
            onClick={handleCloseClick}
            aria-label="Close tutorial"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>

          {/* Phase content */}
          <div className="tutorial-modal-content">
            {renderPhase()}
          </div>
        </div>
      </div>

      {/* Skip confirmation modal */}
      <SkipConfirmationModal
        isOpen={isSkipConfirmationOpen}
        onCancel={hideSkipConfirmation}
        onConfirm={confirmSkip}
      />
    </>
  );
};

export default TutorialModal;
