import { useState, useEffect } from 'react';
import type { Feature } from '@shared/types';
import { getFeatureManagerName } from '@shared/types/pool';
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
  isAnalyzing?: boolean;
  pendingAnalysisCount?: number;
  worktreeProgress?: string;  // Progress message during worktree creation
  queuePosition?: number;  // Position in pool queue (0 = active, 1+ = waiting)
  poolQueueLength?: number;  // Total items in the pool queue
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
 * Magnifying glass icon for investigating state
 */
function MagnifyingGlassIcon(): React.JSX.Element {
  return (
    <svg
      className="feature-card__status-icon"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="7" strokeWidth="2" />
      <path strokeLinecap="round" strokeWidth="2" d="M21 21l-4.35-4.35" />
    </svg>
  );
}

/**
 * Planning icon (clipboard with checklist) for planning state
 */
function PlanningIcon(): React.JSX.Element {
  return (
    <svg
      className="feature-card__status-icon"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" strokeWidth="2" />
      <path strokeLinecap="round" strokeWidth="2" d="M9 12h6M9 16h4" />
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
export default function FeatureCard({ feature, onSelect, onDelete, onStart, onStop, onMerge, isStarting, isAnalyzing, pendingAnalysisCount, worktreeProgress, queuePosition, poolQueueLength }: FeatureCardProps) {
  // Show Start button for features that are ready to start execution OR not_started (to create worktree)
  const showStart = feature.status === 'ready' || feature.status === 'not_started';
  // Show Stop button for features that are currently executing (developing or verifying)
  const showStop = feature.status === 'developing' || feature.status === 'verifying';
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
      try {
        if (feature.status === 'not_started') {
          // For not_started features: call startWorktreeCreation to create worktree in background
          const result = await window.electronAPI.feature.startWorktreeCreation(feature.id);
          if (!result.success) {
            console.error('Failed to start worktree creation:', result.error);
          }
        } else {
          // For ready features: First update status to developing, then start execution
          const updateResult = await window.electronAPI.feature.updateStatus(feature.id, 'developing');
          if (updateResult.success) {
            onStart?.(feature.id);
          } else {
            console.error('Failed to update feature status:', updateResult.error);
          }
        }
      } catch (error) {
        console.error('Error starting feature:', error);
      }
    }
  };

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onSelect
    try {
      // First stop execution, then update status back to ready
      onStop?.(feature.id);
      const updateResult = await window.electronAPI.feature.updateStatus(feature.id, 'ready');
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

  // Get manager name for color coding (only if feature has been assigned to a manager)
  const managerName = feature.featureManagerId !== undefined
    ? getFeatureManagerName(feature.featureManagerId)
    : null;

  const managerClass = managerName ? ` feature-card--manager-${managerName.toLowerCase()}` : '';
  const cardClasses = `feature-card feature-card--${feature.status}${managerClass}`;
  const startBtnClasses = `feature-card__action-btn feature-card__action-btn--start${isStarting ? ' feature-card__action-btn--loading' : ''}`;

  // Determine status message based on feature state
  const getStatusInfo = (): { message: string; showSpinner: boolean; icon?: React.JSX.Element } | null => {
    if (feature.status === 'planning') {
      return { message: 'Planning...', showSpinner: true, icon: <PlanningIcon /> };
    }
    if (isAnalyzing) {
      return { message: 'Analyzing...', showSpinner: true };
    }
    if (feature.status === 'developing') {
      // Show different messages based on what's happening
      if (pendingAnalysisCount && pendingAnalysisCount > 0) {
        return { message: `${pendingAnalysisCount} task${pendingAnalysisCount > 1 ? 's' : ''} need analysis`, showSpinner: false };
      }
      return { message: 'Developing...', showSpinner: true };
    }
    if (feature.status === 'verifying') {
      return { message: 'Verifying...', showSpinner: true };
    }
    if (feature.status === 'ready_for_planning') {
      return { message: 'Ready to plan - click Plan', showSpinner: false, icon: <PlanningIcon /> };
    }
    if (feature.status === 'investigating') {
      // Show question icon if there are uncertainties (needs clarification)
      return { message: 'Investigating...', showSpinner: false, icon: <MagnifyingGlassIcon /> };
    }
    if (feature.status === 'creating_worktree') {
      // Show queue position if waiting in queue
      const pos = feature.queuePosition || queuePosition;
      if (pos && pos > 0) {
        return { message: `Waiting in queue (position ${pos})`, showSpinner: false };
      }
      return { message: worktreeProgress || 'Creating worktree...', showSpinner: true };
    }
    if (feature.status === 'not_started') {
      return { message: 'Not started', showSpinner: false };
    }
    if (feature.status === 'ready') {
      return { message: 'Ready', showSpinner: false };
    }
    if (feature.status === 'needs_merging') {
      return { message: 'Waiting for merge slot...', showSpinner: false };
    }
    if (feature.status === 'merging') {
      return { message: 'Merging to target branch...', showSpinner: true };
    }
    return null;
  };

  const statusInfo = getStatusInfo();

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
        <div className="feature-card__badges">
          <span className="feature-card__status-badge">
            {feature.status === 'not_started' && 'NOT STARTED'}
            {feature.status === 'creating_worktree' && 'CREATING...'}
            {feature.status === 'investigating' && 'INVESTIGATING'}
            {feature.status === 'ready_for_planning' && 'READY TO PLAN'}
            {feature.status === 'planning' && 'PLANNING'}
            {feature.status === 'ready' && 'READY'}
            {feature.status === 'developing' && 'DEVELOPING'}
            {feature.status === 'verifying' && 'VERIFYING'}
            {feature.status === 'needs_merging' && 'MERGE PENDING'}
            {feature.status === 'merging' && 'MERGING'}
            {feature.status === 'archived' && 'ARCHIVED'}
          </span>
          {/* Queue position badge - shown for features waiting in pool (queuePosition > 0) */}
          {(feature.queuePosition !== undefined && feature.queuePosition > 0) && (
            <span className="feature-card__queue-badge" title={`Position ${feature.queuePosition || queuePosition || 0} in pool queue`}>
              Queue: {feature.queuePosition || queuePosition || '?'}{poolQueueLength ? `/${poolQueueLength}` : ''}
            </span>
          )}
        </div>

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

          {/* Stop button - shown on hover for developing/verifying features */}
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

      <h3 className="feature-card__title" title={feature.name}>
        {feature.name}
      </h3>

      {/* Status indicator - shown below title */}
      {statusInfo && (
        <div className="feature-card__status-indicator">
          {statusInfo.icon ? (
            <span className={`feature-card__status-icon--${feature.status}`}>
              {statusInfo.icon}
            </span>
          ) : statusInfo.showSpinner ? (
            <div className="feature-card__status-spinner" />
          ) : null}
          <span>{statusInfo.message}</span>
        </div>
      )}

      {/* Merge button - only shown for features ready to merge */}
      {feature.status === 'needs_merging' && onMerge && (
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
