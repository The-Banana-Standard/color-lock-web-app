import React, { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { TileColor } from '../types';
import { useTutorialContext } from '../contexts/TutorialContext';

interface LostGameModalProps {
  isOpen: boolean;
  targetColor: TileColor | null;
  lockedColor: TileColor | null;
  getColorCSS: (color: TileColor) => string;
  onClose: () => void;
  onTryAgain: () => void;
}

const LostGameModal: React.FC<LostGameModalProps> = ({
  isOpen,
  targetColor,
  lockedColor,
  getColorCSS,
  onClose,
  onTryAgain
}) => {
  const { isTutorialMode, nextStep } = useTutorialContext();
  const modalRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);
  
  // Handle the continue button in tutorial mode
  const handleContinue = () => {
    onClose();
    if (isTutorialMode) {
      nextStep();
    } else {
      onTryAgain();
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay lost-game-modal">
      <div className="modal-content" ref={modalRef}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faTimes} />
        </button>
        <div className="modal-body">
          <h2 className="lost-game-title">Oh no!</h2>
          <p className="lost-game-text">
            You locked <span style={{
              color: lockedColor ? getColorCSS(lockedColor) : '#000000',
              fontWeight: 'bold'
            }}>{lockedColor}</span> — that's half the board!
          </p>
          <p className="lost-game-text">
            No group can grow larger to unlock it, so <span style={{
              color: targetColor ? getColorCSS(targetColor) : '#000000',
              fontWeight: 'bold'
            }}>{targetColor}</span> can't be locked.
          </p>
          <div className="modal-buttons">
            <button className="lost-game-button" onClick={handleContinue}>
              {isTutorialMode ? "Continue" : "Try Again"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LostGameModal; 