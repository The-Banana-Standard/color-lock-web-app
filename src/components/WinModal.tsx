import React, { useState, useEffect } from 'react';
import ReactConfetti from 'react-confetti';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShare } from '@fortawesome/free-solid-svg-icons';
import { DailyPuzzle, TileColor } from '../types';
import { useGameContext } from '../contexts/GameContext';
import { useTutorialContext } from '../contexts/TutorialContext';
import { dateKeyForToday } from '../utils/dateUtils';
import { defaultStats } from '../types/stats';

interface WinModalProps {
  puzzle: DailyPuzzle;
  onTryAgain: () => void;
  onClose: () => void;
  getColorCSS: (color: TileColor) => string;
  generateShareText: () => string;
  setShowWinModal: (show: boolean) => void;
  onChangeDifficulty?: (difficulty: 'easy' | 'medium' | 'hard') => void;
}

// App promotion section component
const AppPromoSection = () => (
  <div className="app-promo">
    <p className="promo-text">Play on the go!</p>
    <div className="app-store-badges">
      <a href="https://apps.apple.com/us/app/color-lock-daily-puzzle/id6740288143"
         target="_blank" rel="noopener noreferrer">
        <img src="/images/app-store-badge.svg" alt="Download on App Store" />
      </a>
      <a href="https://play.google.com/store/apps/details?id=com.thebananastandard.colorlock"
         target="_blank" rel="noopener noreferrer">
        <img src="/images/google-play-badge.svg" alt="Get it on Google Play" />
      </a>
    </div>
  </div>
);

const WinModal: React.FC<WinModalProps> = ({
  puzzle,
  onTryAgain,
  onClose,
  getColorCSS,
  generateShareText,
  setShowWinModal,
  onChangeDifficulty
}) => {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [windowDimensions, setWindowDimensions] = useState<{width: number, height: number}>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [confettiActive, setConfettiActive] = useState<boolean>(true);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [displayedScore, setDisplayedScore] = useState<number>(0);

  // Get tutorial context
  const { isTutorialMode, endTutorial } = useTutorialContext();

  // Get game context to access stats and settings for win modal
  const { gameStats, winModalStats, settings, finalizeBestScore } = useGameContext();

  // Get sound setting
  const soundEnabled = settings?.enableSoundEffects || false;

  // Use defaultStats if gameStats is somehow null/undefined
  const currentStats = gameStats || defaultStats;

  // Score comparison values
  const userScore = puzzle.userMovesUsed;
  const botScore = puzzle.algoScore;
  const dailyBest = winModalStats?.dailyBestScore;
  const effectiveBest = dailyBest ?? botScore;
  const beatBot = userScore <= botScore;

  // Get today's date key for hints tracking
  const todayKey = dateKeyForToday();

  // Play celebration sound once
  useEffect(() => {
    if (soundEnabled) {
      const audio = new Audio('/sounds/win-celebration.mp3');
      audio.volume = 0.5;
      audio.play().catch(err => console.warn('Could not play sound:', err));
    }
    
    // Setup window resize listener for confetti
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    
    // Stop confetti after some time
    const timer = setTimeout(() => {
      setConfettiActive(false);
    }, 5000);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [soundEnabled]);

  // Timer countdown effect
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      const secs = Math.floor(diff / 1000);
      const hrs = Math.floor(secs / 3600);
      const mins = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setTimeLeft(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Animate score count-up effect
  useEffect(() => {
    if (userScore <= 0) {
      setDisplayedScore(userScore);
      return;
    }

    // Start from 0 and count up to userScore
    setDisplayedScore(0);

    // Calculate delay per increment (total animation ~1.2 seconds)
    const totalDuration = 1200;
    const delay = Math.max(50, totalDuration / userScore);

    let current = 0;
    const timer = setInterval(() => {
      current += 1;
      setDisplayedScore(current);

      if (current >= userScore) {
        clearInterval(timer);
      }
    }, delay);

    return () => clearInterval(timer);
  }, [userScore]);

  // Format the date for the share text
  const formatDate = () => {
    const now = new Date();
    return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
  };
  
  // Helper to convert tile colors to emoji
  const getTileEmoji = (color: TileColor): string => {
    switch (color) {
      case 'red': return '🟥';
      case 'blue': return '🟦';
      case 'green': return '🟩';
      case 'yellow': return '🟨';
      case 'purple': return '🟪';
      case 'orange': return '🟧';
      default: return '⬜';
    }
  };
  
  // Get hints used for today
  const hintsUsedToday = currentStats.hintUsageByDay?.[todayKey] || 0;
  const hintsText = hintsUsedToday > 0 
    ? `Hints Used: ${hintsUsedToday}` 
    : `No hints used! 🧠`;
  
  // Generate properly formatted share text
  const getFormattedShareText = () => {
    // Get the emoji representation directly from the puzzle's starting grid
    const boardRows = puzzle.startingGrid.map(row => 
      row.map(color => getTileEmoji(color)).join("")
    ).join("\n");
    
    // Get difficulty level from settings
    const difficultyLevel = settings?.difficultyLevel || 'medium';
    const difficultyText = difficultyLevel.charAt(0).toUpperCase() + difficultyLevel.slice(1);
    
    // Create formatted text that matches the required format
    return `Color Lock - ${formatDate()}
Target: ${getTileEmoji(puzzle.targetColor)}
Difficulty: ${difficultyText}
${hintsText}

Score: ${puzzle.userMovesUsed} moves${beatBot ? ' 🏅' : ''}

Today's Board:
${boardRows}`;
  };
  
  // Get the properly formatted share text
  const formattedShareText = getFormattedShareText();
  const shareTitle = `Color Lock - Daily Puzzle`;

  // Unified share handler - uses Web Share API with clipboard fallback
  const handleShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: formattedShareText,
        });
        return;
      } catch (err) {
        // User cancelled or error - fall through to clipboard
      }
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(formattedShareText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = formattedShareText;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (e) {
        console.error('Could not copy text:', e);
      }
      document.body.removeChild(textArea);
    }
  };

  // Determine user tile color based on performance
  const getUserTileColor = () => {
    if (!beatBot) {
      return 'red'; // Lost to bot
    }
    // Beat or matched bot - check against effective best
    if (userScore <= effectiveBest) {
      return 'blue'; // Low score (new or tied)
    } else {
      return 'green'; // Beat bot but not low score
    }
  };

  // Check if user set a NEW low score (number should be gold)
  const isNewLowScore = beatBot && userScore < effectiveBest;

  // Check if user achieved the low score (tied or new)
  const isLowScore = beatBot && userScore <= effectiveBest;

  // Get difficulty from user settings
  const puzzleDifficulty = settings?.difficultyLevel || 'medium';

  // App promo shows when user achieves low score on medium or hard difficulty
  const showAppPromo = isLowScore && (puzzleDifficulty === 'medium' || puzzleDifficulty === 'hard');

  const getNextDifficulty = (): { level: 'easy' | 'medium' | 'hard'; label: string } | null => {
    if (puzzleDifficulty === 'easy') return { level: 'medium', label: 'Medium' };
    if (puzzleDifficulty === 'medium') return { level: 'hard', label: 'Hard' };
    return null; // No next level for hard
  };
  const nextDifficulty = getNextDifficulty();

  // Handle trying next difficulty
  const handleTryNextDifficulty = () => {
    if (nextDifficulty && onChangeDifficulty) {
      // Update best score before changing difficulty
      finalizeBestScore();
      onChangeDifficulty(nextDifficulty.level);
      onClose();
    }
  };

  // Get motivational message based on score
  const getMotivationalMessage = () => {
    const diff = userScore - botScore;

    // Didn't beat bot
    if (userScore > botScore) {
      return `So close! Only ${diff} fewer moves to tie the bot.`;
    }

    // Beat or matched bot - check against effective best
    if (userScore < effectiveBest) {
      return "Amazing, you set a new best score for the day!";
    } else if (userScore === effectiveBest) {
      return "Impressive, you tied today's best score!";
    } else {
      // Beat bot but not the best yet
      if (userScore < botScore) {
        return `You beat the bot! Can you match the best score of ${effectiveBest}?`;
      } else {
        return `You tied the bot! Can you match the best score of ${effectiveBest}?`;
      }
    }
  };

  const userTileColor = getUserTileColor();

  // Determine best score tile color
  // Blue by default, green if user tied or beat it (because user tile will be blue)
  const getBestTileColor = () => {
    if (isLowScore) return 'green'; // User achieved low score, so best tile turns green
    return 'blue'; // Default blue
  };
  const bestTileColor = getBestTileColor();

  // Handle try again button
  const handleTryAgainOrContinue = () => {
    if (isTutorialMode) {
      // In tutorial mode, end the tutorial
      endTutorial();
      onClose();
    } else {
      // In regular mode, just try again
      onTryAgain();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {confettiActive && (
        <ReactConfetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          recycle={false}
          numberOfPieces={350}
          gravity={0.15}
          initialVelocityY={20}
          colors={['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']}
        />
      )}

      <div className="win-modal win-modal-animated" onClick={(e) => e.stopPropagation()}>
        {/* Score Hero Section */}
        <div className={`score-hero ${beatBot ? 'beat-bot' : 'needs-improvement'}`}>
          <div className="score-comparison">
            {/* User's score - standalone row */}
            <div className="score-row-user">
              <div className="score-tile-container">
                <span className="tile-label text-label-large">Your Score</span>
                <div className={`score-tile-large ${userTileColor}`}>
                  <span className={`tile-number ${isNewLowScore ? 'gold-number' : ''}`}>{displayedScore}</span>
                </div>
              </div>
            </div>

            {/* Bot and Best scores - comparison row */}
            <div className="score-row-comparison">
              {/* Bot's goal tile */}
              <div className="score-tile-container">
                <span className="tile-label text-label">Bot</span>
                <div className={`score-tile-large ${beatBot ? 'red' : 'green'}`}>
                  <span className="tile-number">{botScore}</span>
                </div>
              </div>

              {/* Best score tile - always show, uses bot score when no daily best */}
              <div className="score-tile-container">
                <span className="tile-label text-label">{isNewLowScore ? 'Old Best' : 'Best'}</span>
                <div className={`score-tile-large ${bestTileColor}`}>
                  <span className="tile-number">{effectiveBest}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="motivational-text">{getMotivationalMessage()}</p>

        {/* Action Buttons - Different layout based on beat-bot state */}
        {beatBot ? (
          // User beat/matched the bot
          <div className="win-actions-primary">
            {/* Always show two buttons side by side when user beats bot */}
            <div className="dual-action-buttons">
              <button className="action-button-secondary" onClick={handleTryAgainOrContinue}>
                {isTutorialMode ? "Play Today's Puzzle" : "Try Again"}
              </button>
              {nextDifficulty && (
                <button className="action-button-primary" onClick={handleTryNextDifficulty}>
                  Play {nextDifficulty.label}
                </button>
              )}
            </div>
            {/* Small share button below */}
            <button className="share-link" onClick={handleShare}>
              <FontAwesomeIcon icon={faShare} /> Share
              {copySuccess && <span className="copy-toast">Copied!</span>}
            </button>
          </div>
        ) : (
          // User didn't beat bot - emphasize try again
          <div className="win-actions-primary">
            <button className="try-again-prominent" onClick={handleTryAgainOrContinue}>
              {isTutorialMode ? "Play Today's Puzzle" : "Try Again"}
            </button>
            <div className="secondary-links">
              <button className="close-link" onClick={onClose}>Close</button>
              <span className="link-separator">•</span>
              <button className="share-link" onClick={handleShare}>
                Share
                {copySuccess && <span className="copy-toast">Copied!</span>}
              </button>
            </div>
          </div>
        )}

        {/* Conditional Footer - Timer only when beat bot */}
        {beatBot && !isTutorialMode && (
          <div className="conditional-footer">
            <div className="next-puzzle-timer">
              <p>New puzzle in:</p>
              <div className="timer">
                {timeLeft.split(':').map((unit, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <span className="time-separator">:</span>}
                    <span className="time-unit">{unit}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
            {showAppPromo && <AppPromoSection />}
          </div>
        )}
      </div>
    </div>
  );
};

export default WinModal; 