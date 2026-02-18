import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faTrophy, faInfoCircle, faHome, faBolt } from '@fortawesome/free-solid-svg-icons';
import { TileColor, DailyPuzzle } from '../types';
import { AppSettings, DifficultyLevel } from '../types/settings';
import { useTutorialContext } from '../contexts/TutorialContext';
import HamburgerMenu from './HamburgerMenu';
import SignUpButton from './SignUpButton';
import GradientTitle from './GradientTitle';

// Updated GameHeader Props to include menu state/handlers
interface GameHeaderProps {
  puzzle: DailyPuzzle;
  settings: AppSettings;
  getColorCSS: (color: TileColor) => string;
  onBotSolutionClick: () => void;
  showHintButton?: boolean;
  isAutoSolving?: boolean;
  // Hamburger Menu Props
  isMenuOpen?: boolean;
  toggleMenu?: () => void;
  isGuest?: boolean;
  onHomeClick?: () => void;
  onSettingsClick?: () => void;
  onStatsClick?: () => void;
  onInfoClick?: () => void;
  // Add callback for difficulty change
  onDifficultyChange?: (difficulty: DifficultyLevel) => void;
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  puzzle,
  settings = {} as AppSettings,
  getColorCSS,
  onBotSolutionClick,
  showHintButton = true,
  isAutoSolving = false,
  // Destructure menu props with defaults
  isMenuOpen = false,
  toggleMenu = () => {},
  isGuest = false,
  onHomeClick = () => {},
  onSettingsClick = () => {},
  onStatsClick = () => {},
  onInfoClick = () => {},
  // Destructure difficulty change callback
  onDifficultyChange = () => {}
}) => {
  // Tutorial context - check if tutorial is open (don't show difficulty selector during tutorial)
  const { state: tutorialState } = useTutorialContext();
  const isTutorialOpen = tutorialState.isOpen;

  // Use the difficulty level from settings with a fallback to prevent errors
  const currentDifficulty = settings?.difficultyLevel || DifficultyLevel.Medium;

  return (
    <div className="top-card">
      {/* Hamburger Menu Wrapper (Mobile Only) */}
      <div className="hamburger-wrapper mobile-only-hamburger">
        <HamburgerMenu isOpen={isMenuOpen} onToggle={toggleMenu}>
          {/* Pass actions directly to menu items */}
          <button className="hamburger-menu-item" onClick={onHomeClick}>
            <FontAwesomeIcon icon={faHome} /> Home
          </button>
          <button className="hamburger-menu-item" onClick={onSettingsClick}>
            <FontAwesomeIcon icon={faGear} /> Settings
          </button>
          <button className="hamburger-menu-item" onClick={onStatsClick}>
            <FontAwesomeIcon icon={faTrophy} /> Stats
          </button>
          <button className="hamburger-menu-item" onClick={onInfoClick}>
            <FontAwesomeIcon icon={faInfoCircle} /> Tutorial
          </button>
          {showHintButton && (
            <button
              className="hamburger-menu-item"
              onClick={onBotSolutionClick}
              disabled={isAutoSolving}
            >
              <FontAwesomeIcon icon={faBolt} /> {isAutoSolving ? 'Solving...' : 'Bot Solution'}
            </button>
          )}
          {isGuest && (
            <div className="hamburger-menu-item-signup">
              {/* Pass toggleMenu to onClose if needed */}
              <SignUpButton onClose={toggleMenu} />
            </div>
          )}
        </HamburgerMenu>
      </div>

      {/* Top Card Content */}
      <div className="top-card-content">
        <h1>
          <GradientTitle fontSize="3.5rem" />
        </h1>
        <div className="target-row">
          <span>Target:</span>
          <div
            className="target-circle"
            style={{ backgroundColor: puzzle.targetColor ? getColorCSS(puzzle.targetColor) : '#ffffff' }}
          />
        </div>
        <div className="goal-row">
          <span>Goal: {puzzle.algoScore}</span>
          <span>Moves: {puzzle.userMovesUsed}</span>
        </div>
        {/* Difficulty Switcher - same style as landing screen */}
        {!isTutorialOpen && (
          <div className="difficulty-switcher game-difficulty-switcher">
            <button
              className={`difficulty-option easy ${currentDifficulty === DifficultyLevel.Easy ? 'active' : ''}`}
              onClick={() => onDifficultyChange(DifficultyLevel.Easy)}
            >
              Easy
            </button>
            <button
              className={`difficulty-option medium ${currentDifficulty === DifficultyLevel.Medium ? 'active' : ''}`}
              onClick={() => onDifficultyChange(DifficultyLevel.Medium)}
            >
              Medium
            </button>
            <button
              className={`difficulty-option hard ${currentDifficulty === DifficultyLevel.Hard ? 'active' : ''}`}
              onClick={() => onDifficultyChange(DifficultyLevel.Hard)}
            >
              Hard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface GameFooterProps {
  puzzle: DailyPuzzle;
  settings: AppSettings;
  getLockedColorCSS: () => string;
  getLockedRegionSize: () => number;
  onTryAgain: () => void;
}

export const GameFooter: React.FC<GameFooterProps> = ({
  puzzle,
  settings,
  getLockedColorCSS,
  getLockedRegionSize,
  onTryAgain
}) => {
  return (
    <div className="controls-container">
      <div className="controls-inner">
        {/* Locked region indicator with updated styling */}
        {settings.showLockedRegionCounter && (
          <div className="locked-region-counter">
            <span className="locked-label game-title-font">Locked Squares:</span>
            <span 
              className="locked-count"
              style={{ 
                color: getLockedColorCSS(),
                textShadow: '-0.5px -0.5px 0 #000, 0.5px -0.5px 0 #000, -0.5px 0.5px 0 #000, 0.5px 0.5px 0 #000',
                fontSize: '22px'
              }}
            >
              {getLockedRegionSize()}
            </span>
          </div>
        )}
        
        {/* Try Again button */}
        <button
          className="try-again-button"
          onClick={onTryAgain}
        >
          Try Again
        </button>
      </div>
    </div>
  );
};

// Updated GameControls Props to include menu props
interface GameControlsProps {
  puzzle: DailyPuzzle;
  settings: AppSettings;
  getColorCSS: (color: TileColor) => string;
  getLockedColorCSS: () => string;
  getLockedRegionSize: () => number;
  onTryAgain: () => void;
  onHintClick: () => void;
  // Add menu props if GameControls is the direct parent managing state
  isMenuOpen?: boolean;
  toggleMenu?: () => void;
  isGuest?: boolean;
  onHomeClick?: () => void;
  onSettingsClick?: () => void;
  onStatsClick?: () => void;
  onInfoClick?: () => void;
  // Add difficulty change handler
  onDifficultyChange?: (difficulty: DifficultyLevel) => void;
}

const GameControls: React.FC<GameControlsProps> = (props) => {
  return (
    <>
      <GameHeader 
        puzzle={props.puzzle}
        settings={props.settings}
        getColorCSS={props.getColorCSS}
        onBotSolutionClick={props.onHintClick}
        showHintButton={true}
        isMenuOpen={props.isMenuOpen}
        toggleMenu={props.toggleMenu}
        isGuest={props.isGuest}
        onHomeClick={props.onHomeClick}
        onSettingsClick={props.onSettingsClick}
        onStatsClick={props.onStatsClick}
        onInfoClick={props.onInfoClick}
        onDifficultyChange={props.onDifficultyChange}
      />
      <GameFooter
        puzzle={props.puzzle}
        settings={props.settings}
        getLockedColorCSS={props.getLockedColorCSS}
        getLockedRegionSize={props.getLockedRegionSize}
        onTryAgain={props.onTryAgain}
      />
    </>
  );
};

export default GameControls; 