/**
 * TutorialReadyPhase Component
 *
 * Final phase showing the user is ready to play.
 * Offers options to play the real puzzle or replay the tutorial.
 */

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar } from '@fortawesome/free-solid-svg-icons';
import { TileColor } from '../../types';
import GradientTitle from '../GradientTitle';
import { useTutorialContext } from '../../contexts/TutorialContext';
import { READY_PHASE_MESSAGES } from '../../contexts/tutorialConfig';

interface TutorialReadyPhaseProps {
  /** Function to get CSS color value */
  getColorCSS: (color: TileColor) => string;
}

const TutorialReadyPhase: React.FC<TutorialReadyPhaseProps> = ({ getColorCSS }) => {
  const { completeTutorial, resetForReplay } = useTutorialContext();

  const handlePlayNow = () => {
    completeTutorial();
  };

  const handleTryAgain = () => {
    resetForReplay();
  };

  return (
    <div className="tutorial-ready-phase">
      <div className="tutorial-ready-content">
        <div className="tutorial-ready-logo" aria-hidden="true">
          <GradientTitle fontSize="3.5rem" />
        </div>

        <div className="tutorial-ready-badge" aria-hidden="true">
          <FontAwesomeIcon icon={faStar} />
        </div>

        <div className="tutorial-phase-header tutorial-phase-header--ready">
          <h2 className="tutorial-phase-title">{READY_PHASE_MESSAGES.title}</h2>
          <p className="tutorial-phase-message">{READY_PHASE_MESSAGES.message}</p>
        </div>
      </div>

      <div className="tutorial-phase-actions tutorial-phase-actions--stacked tutorial-phase-actions--ready">
        <button
          className="tutorial-button tutorial-button--primary"
          onClick={handlePlayNow}
        >
          {READY_PHASE_MESSAGES.buttonText}
        </button>

        <button
          className="tutorial-ready-secondary-link"
          onClick={handleTryAgain}
        >
          Practice Again
        </button>
      </div>
    </div>
  );
};

export default TutorialReadyPhase;
