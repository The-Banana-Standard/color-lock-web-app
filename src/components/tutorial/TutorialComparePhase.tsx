/**
 * TutorialComparePhase Component
 *
 * Shows the user's score compared to the optimal solution.
 * Provides congratulatory or encouraging messaging based on performance.
 */

import React, { useEffect, useState } from 'react';
import { TileColor } from '../../types';
import {
  useTutorialContext,
  TUTORIAL_OPTIMAL_MOVES
} from '../../contexts/TutorialContext';
import { getCompareMessage } from '../../contexts/tutorialConfig';
import { SCORE_COUNTUP_DURATION } from '../../utils/animationTimings';

interface TutorialComparePhaseProps {
  /** Function to get CSS color value */
  getColorCSS: (color: TileColor) => string;
}

const TutorialComparePhase: React.FC<TutorialComparePhaseProps> = ({ getColorCSS }) => {
  const { state, startReadyPhase } = useTutorialContext();
  const { userMoveCount } = state;

  // Animated count-up for scores
  const [displayedUserScore, setDisplayedUserScore] = useState(0);
  const [displayedOptimalScore, setDisplayedOptimalScore] = useState(0);

  // Count-up animation
  useEffect(() => {
    const steps = 20;
    const userStep = userMoveCount / steps;
    const optimalStep = TUTORIAL_OPTIMAL_MOVES / steps;
    const interval = SCORE_COUNTUP_DURATION / steps;

    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      setDisplayedUserScore(Math.min(Math.round(userStep * currentStep), userMoveCount));
      setDisplayedOptimalScore(Math.min(Math.round(optimalStep * currentStep), TUTORIAL_OPTIMAL_MOVES));

      if (currentStep >= steps) {
        clearInterval(timer);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [userMoveCount]);

  // Get performance message
  const message = getCompareMessage(userMoveCount);

  // Calculate performance indicator
  const getPerformanceClass = () => {
    if (userMoveCount === TUTORIAL_OPTIMAL_MOVES) return 'tutorial-compare--perfect';
    if (userMoveCount <= TUTORIAL_OPTIMAL_MOVES + 2) return 'tutorial-compare--good';
    return 'tutorial-compare--practice';
  };

  const handleContinue = () => {
    startReadyPhase();
  };

  return (
    <div className={`tutorial-compare-phase ${getPerformanceClass()}`}>
      {/* Header */}
      <div className="tutorial-phase-header">
        <h2 className="tutorial-phase-title">{message.title}</h2>
        <p className="tutorial-phase-message">{message.message}</p>
      </div>

      {/* Score comparison */}
      <div className="tutorial-score-comparison">
        <div className="tutorial-score-card tutorial-score-card--user">
          <div className="tutorial-score-value">{displayedUserScore}</div>
          <div className="tutorial-score-label">Your Moves</div>
        </div>

        <div className="tutorial-score-divider">vs</div>

        <div className="tutorial-score-card tutorial-score-card--optimal">
          <div className="tutorial-score-value">{displayedOptimalScore}</div>
          <div className="tutorial-score-label">Optimal</div>
        </div>
      </div>

      {/* Performance badge */}
      {userMoveCount === TUTORIAL_OPTIMAL_MOVES && (
        <div className="tutorial-badge tutorial-badge--perfect">
          Perfect Score!
        </div>
      )}

      {/* Action button */}
      <div className="tutorial-phase-actions">
        <button
          className="tutorial-button tutorial-button--primary"
          onClick={handleContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default TutorialComparePhase;
