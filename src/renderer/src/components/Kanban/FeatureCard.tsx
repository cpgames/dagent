import { useState, useEffect } from 'react';
import type { Feature } from '@shared/types';
import './FeatureCard.css';

export type MergeType = 'ai' | 'pr';

interface FeatureCardProps {
  feature: Feature;
  onSelect: (featureId: string) => void;
  onArchive?: (featureId: string) => void;
  onDelete?: (featureId: string) => void;
  onStart?: (featureId: string) => void;
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
 * Merge icon SVG component (git merge - two branches joining)
 */
function MergeIcon(): React.JSX.Element {
  return (
    <svg className="feature-card__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7H6a2 2 0 00-2 2v8a2 2 0 002 2h2"
      />
    </svg>
  );
}

/**
 * FeatureCard - Displays a single feature in the Kanban board.
 * Shows feature name, task progress placeholder, archive button for completed features,
 * merge button with dropdown for completed features, and delete button on hover.
 */
export default function FeatureCard({ feature, onSelect, onArchive, onDelete, onStart, onMerge, isStarting }: FeatureCardProps) {
  const canStart = feature.status === 'not_started' || feature.status === 'needs_attention';
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

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onSelect
    onArchive?.(feature.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onSelect
    onDelete?.(feature.id);
  };

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onSelect
    if (!isStarting) {
      onStart?.(feature.id);
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
          {/* Start button - shown on hover for not_started/needs_attention features */}
          {canStart && onStart && (
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

      {/* Merge and Archive buttons - only shown for completed features */}
      {feature.status === 'completed' && (onMerge || onArchive) && (
        <div className="feature-card__footer">
          {/* Merge button with dropdown */}
          {onMerge && (
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
          )}
          {/* Archive button */}
          {onArchive && (
            <button
              className="feature-card__archive-btn"
              onClick={handleArchive}
              aria-label={`Archive ${feature.name}`}
            >
              Archive
            </button>
          )}
        </div>
      )}
    </div>
  );
}
