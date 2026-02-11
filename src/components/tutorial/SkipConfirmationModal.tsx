/**
 * SkipConfirmationModal Component
 *
 * Confirmation dialog shown when first-time users try to skip the tutorial.
 * Returning users (who have completed the tutorial before) can skip without confirmation.
 */

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';

interface SkipConfirmationModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Handler to close the modal (cancel skip) */
  onCancel: () => void;
  /** Handler to confirm skip */
  onConfirm: () => void;
}

const SkipConfirmationModal: React.FC<SkipConfirmationModalProps> = ({
  isOpen,
  onCancel,
  onConfirm
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
      className="skip-confirmation-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-label="Skip tutorial confirmation"
      aria-modal="true"
    >
      <div className="skip-confirmation-modal">
        <button
          className="skip-confirmation-close"
          onClick={onCancel}
          aria-label="Close"
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>

        <h3 className="skip-confirmation-title">Skip Tutorial?</h3>
        <p className="skip-confirmation-message">
          The tutorial will teach you how to play Color Lock. Are you sure you want to skip it?
        </p>

        <div className="skip-confirmation-actions">
          <button
            className="tutorial-button tutorial-button--secondary"
            onClick={onCancel}
          >
            Continue Tutorial
          </button>
          <button
            className="tutorial-button tutorial-button--danger"
            onClick={onConfirm}
          >
            Skip Tutorial
          </button>
        </div>
      </div>
    </div>
  );
};

export default SkipConfirmationModal;
