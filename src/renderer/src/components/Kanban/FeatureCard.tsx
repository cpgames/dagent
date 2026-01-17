import { useState, useEffect } from 'react';
import type { Feature } from '@shared/types';
import './FeatureCard.css';

export type MergeType = 'ai' | 'pr';

interface FeatureCardProps {
  feature: Feature;
  onSelect: (featureId: string) => void;
  onDelete?: (featureId: string) => void;
  onStart?: (featureId: string) => void;
  onStop?: (featureId: string) => void;
  onMerge?: (featureId: string, mergeType: MergeType) => void;
  isStarting?: boolean;
}

/**
 * Trash icon SVG component
 */
function TrashIcon(): React.JSX.Element {
  return (
    <svg
      className="feature-card__icon"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

/**
 * Play icon SVG component for Start button
 */
function PlayIcon(): React.JSX.Element {
  return (
    <svg
      className="feature-card__icon"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M5 3l14 9-14 9V3z" />
    </svg>
  );
}

/**
 * Spinner icon for loading state
 */
function SpinnerIcon(): React.JSX.Element {
  return (
    <svg
      className="feature-card__icon animate-spin"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/**
 * Stop icon SVG component (square)
 */
function StopIcon(): React.JSX.Element {
  return (
    <svg
      className="feature-card__icon"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <rect x="6" y="6" width="12" height="12" />
    </svg>
  );
}

/**
 * Merge icon SVG component (git merge - two branches joining)
 */
function MergeIcon(): React.JSX.Element {
  return (
    <svg className="feature-card__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="5" cy="6" r="3" strokeWidth="2" />
      <circle cx="19" cy="18" r="3" strokeWidth="2" />
      <circle cx="5" cy="18" r="3" strokeWidth="2" />
      <path d="M5 9v6" strokeWidth="2" strokeLinecap="round" />
      <path d="M19 15c0-3.314-2.686-6-6-6H5" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * FeatureCard - Displays a single feature in the Kanban board.
 * Shows feature name, task progress placeholder,
 * merge button with dropdown for completed features, and delete button on hover.
 */
export default function FeatureCard({ feature, onSelect, onDelete, onStart, onStop, onMerge, isStarting }: FeatureCardProps) {
  const showStart = feature.status === 'backlog';
  const showStop = feature.status === 'in_progress';
  const [showMergeDropdown, setShowMergeDropdown] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showMergeDropdown) return;
    const handleClickOutside = () => setShowMergeDropdown(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMergeDropdown]);

  const handleClick = () => {
    onSelect(feature.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onSelect
    onDelete?.(feature.id);
  };

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onSelect
    if (!isStarting) {
      // First update status to in_progress, then start execution
      try {
        const updateResult = await window.electronAPI.feature.updateStatus(feature.id, 'in_progress');
        if (updateResult.success) {
          onStart?.(feature.id);
        } else {
          console.error('Failed to update feature status:', updateResult.error);
        }
      } catch (error) {
        console.error('Error updating feature status:', error);
      }
    }
  };

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onSelect
    try {
      // First stop execution, then update status back to backlog
      onStop?.(feature.id);
      const updateResult = await window.electronAPI.feature.updateStatus(feature.id, 'backlog');
      if (!updateResult.success) {
        console.error('Failed to update feature status:', updateResult.error);
      }
    } catch (error) {
      console.error('Error updating feature status:', error);
    }
  };

  const handleMergeClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onSelect
    setShowMergeDropdown(!showMergeDropdown);
  };

  const handleMergeOption = (e: React.MouseEvent, mergeType: MergeType) => {
    e.stopPropagation(); // Prevent triggering onSelect
    onMerge?.(feature.id, mergeType);
    setShowMergeDropdown(false);
  };

  const cardClasses = `feature-card feature-card--${feature.status}`;
  const startBtnClasses = `feature-card__action-btn feature-card__action-btn--start${isStarting ? ' feature-card__action-btn--loading' : ''}`;

  return (
    <div
      className={cardClasses}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      <div className="feature-card__header">
        <h3 className="feature-card__title" title={feature.name}>
          {feature.name}
        </h3>

        <div className="feature-card__actions">
          {/* Start button - shown on hover for backlog features only */}
          {showStart && onStart && (
            <button
              className={startBtnClasses}
              onClick={handleStart}
              disabled={isStarting}
              aria-label={`Start ${feature.name}`}
              title={isStarting ? 'Starting...' : 'Start execution'}
            >
              {isStarting ? <SpinnerIcon /> : <PlayIcon />}
            </button>
          )}

          {/* Stop button - shown on hover for in_progress features only */}
          {showStop && onStop && (
            <button
              className="feature-card__action-btn feature-card__action-btn--stop"
              onClick={handleStop}
              aria-label={`Stop ${feature.name}`}
              title="Stop execution"
            >
              <StopIcon />
            </button>
          )}

          {/* Delete button - shown on hover for all features */}
          {onDelete && (
            <button
              className="feature-card__action-btn feature-card__action-btn--delete"
              onClick={handleDelete}
              aria-label={`Delete ${feature.name}`}
              title="Delete feature"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>

      {/* Merge button - only shown for completed features */}
      {feature.status === 'completed' && onMerge && (
        <div className="feature-card__footer">
          {/* Merge button with dropdown */}
          <div className="relative">
            <button
              className="feature-card__merge-btn"
              onClick={handleMergeClick}
              aria-label={`Merge ${feature.name}`}
            >
              <MergeIcon />
              Merge
            </button>
            {/* Dropdown menu */}
            {showMergeDropdown && (
              <div className="feature-card__dropdown">
                <button
                  className="feature-card__dropdown-item"
                  onClick={(e) => handleMergeOption(e, 'ai')}
                >
                  AI Merge
                </button>
                <button
                  className="feature-card__dropdown-item"
                  onClick={(e) => handleMergeOption(e, 'pr')}
                >
                  Create PR
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
