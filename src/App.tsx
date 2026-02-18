import React, { useState, useEffect, createContext, useContext, useRef, Suspense } from 'react';
import './scss/main.scss';
import ReactConfetti from 'react-confetti';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHome, faGear, faTrophy, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

// Types
import { AppSettings, DifficultyLevel } from './types/settings';
import { TileColor } from './types';

// Core components (loaded immediately)
import GameGrid from './components/GameGrid';
import { GameHeader, GameFooter } from './components/GameControls';
import SignUpButton from './components/SignUpButton';
import HamburgerMenu from './components/HamburgerMenu';

// Lazy-loaded components (loaded on demand)
const ColorPickerModal = React.lazy(() => import('./components/ColorPickerModal'));
const WinModal = React.lazy(() => import('./components/WinModal'));
const SettingsModal = React.lazy(() => import('./components/SettingsModal'));
const StatsModal = React.lazy(() => import('./components/StatsModal'));
const AutocompleteModal = React.lazy(() => import('./components/AutocompleteModal'));
const BotSolutionModal = React.lazy(() => import('./components/BotSolutionModal'));
const LostGameModal = React.lazy(() => import('./components/LostGameModal'));
const LandingScreen = React.lazy(() => import('./components/LandingScreen'));
const UsageStatsScreen = React.lazy(() => import('./components/UsageStatsScreen'));
const DeleteAccountPage = React.lazy(() => import('./components/DeleteAccountPage'));

// New Tutorial Modal
const TutorialModal = React.lazy(() => import('./components/tutorial/TutorialModal'));

// Utils
import { generateShareText } from './utils/shareUtils';
import { getLockedColorCSS } from './utils/colorUtils';

// Context
import { GameProvider, useGameContext } from './contexts/GameContext';
import { TutorialProvider, useTutorialContext } from './contexts/TutorialContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataCacheProvider, useDataCache } from './contexts/DataCacheContext';

// Create a context for navigating between screens
type ScreenType = 'landing' | 'game' | 'usageStats' | 'deleteAccount';

interface NavigationContextType {
  showLandingPage: boolean;
  setShowLandingPage: (show: boolean) => void;
  currentScreen: ScreenType;
  navigateToScreen: (screen: ScreenType) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

// Extend CSSProperties to include our custom properties
declare module 'react' {
  interface CSSProperties {
    '--current-color'?: string;
    '--target-color'?: string;
  }
}

// Create settings context
export const SettingsContext = createContext<AppSettings | null>(null);

const GameContainer = () => {
  const { showLandingPage, setShowLandingPage } = useNavigation();

  const {
    puzzle,
    settings,
    loading,
    error,
    handleTileClick,
    handleColorSelect,
    closeColorPicker,
    handleTryAgain,
    resetLostState,
    handleSettingsChange,
    getColorCSSWithSettings,
    getLockedRegionSize,
    getLockedColorCSSWithSettings,
    hintCell,
    showColorPicker,
    selectedTile,
    showWinModal,
    showSettings,
    showStats,
    gameStats,
    setShowSettings,
    setShowStats,
    setShowWinModal,
    shareGameStats,
    showAutocompleteModal,
    setShowAutocompleteModal,
    handleAutoComplete,
    handleBotSolutionClick,
    handleBotSolutionConfirm,
    handleCancelAutoSolution,
    isAutoSolving,
    isCreatingGuestAccount,
    showBotSolutionModal,
    setShowBotSolutionModal,
    isLoadingStats
  } = useGameContext();

  // Tutorial context - new API
  const { state: tutorialState, openTutorial } = useTutorialContext();

  // Auto-show tutorial for first-time users
  useEffect(() => {
    const hasCompleted = localStorage.getItem('colorlock_tutorial_completed') === 'true';
    const hasLaunched = localStorage.getItem('colorlock_has_launched') === 'true';

    if (!hasLaunched) {
      localStorage.setItem('colorlock_has_launched', 'true');
      if (!hasCompleted) {
        // Small delay to let the game UI render first
        const timer = setTimeout(() => {
          openTutorial();
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [openTutorial]);

  // Auth context
  const { isGuest } = useAuth();

  // Hamburger Menu State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const handleMenuItemClick = (action: () => void) => {
    action();
    setIsMenuOpen(false);
  };

  const [windowDimensions, setWindowDimensions] = useState<{width: number, height: number}>({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const [confettiActive, setConfettiActive] = useState<boolean>(false);

  // Update window dimensions for confetti
  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Show confetti when the game is solved
  useEffect(() => {
    if (!puzzle?.isSolved) return;
    setConfettiActive(true);
    const timer = setTimeout(() => setConfettiActive(false), 5000);
    return () => clearTimeout(timer);
  }, [puzzle?.isSolved]);

  // Handle home navigation - modify to use context
  const handleHomeClick = () => {
    setShowLandingPage(true);
  };

  // Define button action handlers
  const handleSettingsClickAction = () => setShowSettings(true);
  const handleStatsClickAction = () => setShowStats(true);
  const handleInfoClickAction = () => openTutorial();

  // Define the handler function for difficulty changes from GameHeader
  const handleDifficultyChangeFromHeader = (newDifficulty: DifficultyLevel) => {
    // Create the new settings object by merging the new difficulty
    // with the existing settings.
    const newSettings: AppSettings = {
      ...settings, // Spread the current settings
      difficultyLevel: newDifficulty, // Update the difficulty level
    };
    // Call the context's update function
    handleSettingsChange(newSettings);
  };

  // Show loading indicator while fetching puzzle data
  if (loading || !puzzle) {
    return (
      <div className="simple-loading-container">
        <div className="spinner"></div>
        {/* Optional: <p>Loading Puzzle...</p> */}
      </div>
    );
  }

  // Determine additional container classes based on settings
  const containerClasses = ['container', 'app-fade-in'];
  if (settings.highContrastMode) {
    containerClasses.push('high-contrast-mode');
  }
  if (!settings.enableAnimations) {
    containerClasses.push('no-animations');
  }

  return (
    <div className={containerClasses.join(' ')}>
      {/* Absolutely Positioned Side Buttons */}
      {/* Desktop Signup Button (Top Left) */}
      {isGuest && (
        <div className="side-button-container top-left desktop-only-signup">
          <SignUpButton />
        </div>
      )}

      {/* Desktop Icon Buttons (Top Right) */}
      <div className="side-button-container top-right desktop-only-icons">
        <button className="icon-button icon-button--coral" onClick={handleHomeClick} aria-label="Home">
          <FontAwesomeIcon icon={faHome} />
        </button>
        <button className="icon-button icon-button--blue" onClick={handleSettingsClickAction} aria-label="Settings">
          <FontAwesomeIcon icon={faGear} />
        </button>
        <button className="icon-button icon-button--green" onClick={handleStatsClickAction} aria-label="Statistics">
          <FontAwesomeIcon icon={faTrophy} />
        </button>
        <button className="icon-button icon-button--pink" onClick={handleInfoClickAction} aria-label="Tutorial">
          <FontAwesomeIcon icon={faInfoCircle} />
        </button>
      </div>

      {/* Main Game Content Wrapper */}
      <div className="main-game-content">
        {/* Confetti for win celebration */}
        {confettiActive && (
          <ReactConfetti
            width={windowDimensions.width}
            height={windowDimensions.height}
            recycle={false}
            numberOfPieces={500}
          />
        )}

        {/* Game Header - updated with hamburger menu props */}
        <GameHeader
          puzzle={puzzle}
          settings={settings}
          getColorCSS={getColorCSSWithSettings}
          onBotSolutionClick={handleBotSolutionClick}
          showHintButton={true}
          isAutoSolving={isAutoSolving}
          // Add hamburger menu props
          isMenuOpen={isMenuOpen}
          toggleMenu={toggleMenu}
          isGuest={isGuest}
          onHomeClick={() => handleMenuItemClick(handleHomeClick)}
          onSettingsClick={() => handleMenuItemClick(handleSettingsClickAction)}
          onStatsClick={() => handleMenuItemClick(handleStatsClickAction)}
          onInfoClick={() => handleMenuItemClick(handleInfoClickAction)}
          // Pass the difficulty change handler
          onDifficultyChange={handleDifficultyChangeFromHeader}
        />

        {/* Game Grid */}
        <div className="grid-container" style={{ position: 'relative' }}>
          <GameGrid
            grid={puzzle.grid}
            lockedCells={puzzle.lockedCells}
            hintCell={hintCell}
            settings={settings}
            onTileClick={handleTileClick}
            getColorCSS={getColorCSSWithSettings}
            puzzleTargetColor={puzzle.targetColor}
          />

          {/* Guest auth loading overlay */}
          {isCreatingGuestAccount && (
            <div className="guest-auth-loading-overlay" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true"></div>
              <p>Setting up your game...</p>
            </div>
          )}
        </div>

        {/* Game Footer */}
        <GameFooter
          puzzle={puzzle}
          settings={settings}
          getLockedColorCSS={getLockedColorCSSWithSettings}
          getLockedRegionSize={getLockedRegionSize}
          onTryAgain={handleTryAgain}
        />
      </div>

      {/* Modals - keep these at the bottom of the container */}
      <Suspense fallback={null}>
        {/* New Tutorial Modal */}
        {tutorialState.isOpen && (
          <TutorialModal getColorCSS={getColorCSSWithSettings} />
        )}

        {/* Color Picker Modal */}
        {showColorPicker && selectedTile && (
          <ColorPickerModal
            onSelect={handleColorSelect}
            onCancel={closeColorPicker}
            getColorCSS={getColorCSSWithSettings}
            currentColor={puzzle.grid[selectedTile.row][selectedTile.col]}
          />
        )}

        {/* Autocomplete Modal */}
        {showAutocompleteModal && puzzle && (
          <AutocompleteModal
            isOpen={showAutocompleteModal}
            onClose={() => setShowAutocompleteModal(false)}
            onAutoComplete={handleAutoComplete}
            targetColor={puzzle.targetColor}
            getColorCSS={getColorCSSWithSettings}
          />
        )}

        {/* Bot Solution Modal */}
        {showBotSolutionModal && puzzle && (
          <BotSolutionModal
            isOpen={showBotSolutionModal}
            onClose={() => setShowBotSolutionModal(false)}
            onConfirm={handleBotSolutionConfirm}
            targetColor={puzzle.targetColor}
            getColorCSS={getColorCSSWithSettings}
          />
        )}

        {/* Lost Game Modal */}
        {puzzle.isLost && (
          <LostGameModal
            isOpen={puzzle.isLost}
            targetColor={puzzle.targetColor}
            lockedColor={(() => {
              if (puzzle.lockedCells.size === 0) return null;
              const cellKey = puzzle.lockedCells.values().next().value;
              if (typeof cellKey !== 'string') return null;
              const [rowStr, colStr] = cellKey.split(',');
              const row = parseInt(rowStr, 10);
              const col = parseInt(colStr, 10);
              if (isNaN(row) || isNaN(col)) return null;
              return puzzle.grid[row]?.[col] ?? null;
            })()}
            getColorCSS={getColorCSSWithSettings}
            onClose={resetLostState}
            onTryAgain={handleTryAgain}
          />
        )}

        {/* Win Modal */}
        {showWinModal && (
          <WinModal
            puzzle={puzzle}
            onTryAgain={handleTryAgain}
            onClose={() => setShowWinModal(false)}
            getColorCSS={getColorCSSWithSettings}
            generateShareText={() => generateShareText(puzzle)}
            setShowWinModal={setShowWinModal}
            onChangeDifficulty={handleDifficultyChangeFromHeader}
          />
        )}

        {/* Settings Modal */}
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={settings}
          onSettingsChange={handleSettingsChange}
        />

        {/* Stats Modal */}
        <StatsModal
          isOpen={showStats}
          onClose={() => setShowStats(false)}
          stats={gameStats}
          onShareStats={shareGameStats}
          isLoading={isLoadingStats}
        />
      </Suspense>

      {/* Error display */}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  // Check URL path for direct navigation (e.g., /stats, /delete-account)
  const getInitialScreen = (): ScreenType => {
    const path = window.location.pathname.toLowerCase();
    if (path === '/stats' || path === '/stats/') {
      return 'usageStats';
    }
    if (path === '/delete-account' || path === '/delete-account/') {
      return 'deleteAccount';
    }
    return 'landing';
  };

  const initialScreen = getInitialScreen();
  const [showLandingPage, setShowLandingPage] = useState(initialScreen === 'landing');
  const [currentScreen, setCurrentScreen] = useState<ScreenType>(initialScreen);

  const navigateToScreen = (screen: ScreenType) => {
    setCurrentScreen(screen);
    setShowLandingPage(screen === 'landing');
    // Update URL without page reload
    let newPath = '/';
    if (screen === 'usageStats') newPath = '/stats';
    else if (screen === 'deleteAccount') newPath = '/delete-account';
    window.history.pushState({}, '', newPath);
  };

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const screen = getInitialScreen();
      setCurrentScreen(screen);
      setShowLandingPage(screen === 'landing');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <NavigationContext.Provider value={{
      showLandingPage,
      setShowLandingPage,
      currentScreen,
      navigateToScreen
    }}>
      <AuthProvider>
        <DataCacheProvider>
          <AuthenticatedApp />
        </DataCacheProvider>
      </AuthProvider>
    </NavigationContext.Provider>
  );
};

const AuthenticatedApp: React.FC = () => {
  const { isAuthenticated, isLoading, currentUser, isUnauthenticatedBrowsing } = useAuth();
  const { showLandingPage, currentScreen } = useNavigation();
  const { fetchAndCacheData, isInitialFetchDone } = useDataCache();
  const fetchInitiated = useRef(false);

  useEffect(() => {
    // Fetch data for both authenticated AND unauthenticated users
    // Public data (puzzles, daily stats, leaderboard) can be fetched without auth
    if (!isLoading && !fetchInitiated.current && !isInitialFetchDone) {
        console.log("AuthenticatedApp: Ready, initiating data fetch...", { isAuthenticated, isUnauthenticatedBrowsing });
        fetchInitiated.current = true;
        fetchAndCacheData(currentUser); // currentUser may be null for unauthenticated users
    }
  }, [isLoading, fetchAndCacheData, currentUser, isInitialFetchDone, isAuthenticated, isUnauthenticatedBrowsing]);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="logo-animation">
          <img src="/tbs_logo.png" alt="The Banana Standard" className="loading-logo" />
        </div>
      </div>
    );
  }

  // Handle delete account page - accessible even if not authenticated
  if (currentScreen === 'deleteAccount') {
    return <Suspense fallback={null}><DeleteAccountPage /></Suspense>;
  }

  // Allow game access for both authenticated users AND unauthenticated browsers
  if (isAuthenticated || isUnauthenticatedBrowsing) {
    // Handle navigation based on currentScreen
    if (currentScreen === 'usageStats') {
      return <Suspense fallback={null}><UsageStatsScreen /></Suspense>;
    } else if (showLandingPage) {
      return <Suspense fallback={null}><LandingScreen /></Suspense>;
    } else {
      return (
        <GameProvider>
          <TutorialProvider>
            <GameContainer />
          </TutorialProvider>
        </GameProvider>
      );
    }
  }

  return <Suspense fallback={null}><LandingScreen /></Suspense>;
};

export default App;
