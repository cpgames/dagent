import { useState, useEffect } from 'react';
import type { Feature } from '@shared/types';
import './FeatureCard.css';

export type MergeType = 'ai' | 'pr';

interface FeatureCardProps {
  feature: Feature;
  onSelect: (featureId: string) => void;
  onDelete?: (featureId: string) => void;
  onMerge?: (featureId: string, mergeType: MergeType) => void;
  isAnalyzing?: boolean;
  /** Task is currently being developed */
  isDeveloping?: boolean;
  /** Task is currently being verified */
  isVerifying?: boolean;
  /** Disable dragging (e.g., during worktree creation) */
  isDragDisabled?: boolean;
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg className="feature-card__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

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
 * External link icon for PR badge
 */
function ExternalLinkIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

/**
 * FeatureCard - Displays a single feature in the Kanban board.
 * Simplified for 4-state model: backlog, active, completed, archived
 * Supports drag and drop to move between columns.
 */
export default function FeatureCard({ feature, onSelect, onDelete, onMerge, isAnalyzing, isDeveloping, isVerifying, isDragDisabled }: FeatureCardProps) {
  const [showMergeDropdown, setShowMergeDropdown] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const canDrag = !isDragDisabled;

  // Drag handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (isDragDisabled) {
      e.preventDefault();
      return;
    }
    setIsDragging(true);
    const dragData = {
      featureId: feature.id,
      currentStatus: feature.status
    };
    // Set both text/plain and application/json for compatibility
    e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
    // Set a custom drag image using the current element
    if (e.currentTarget) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

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
    e.stopPropagation();
    onDelete?.(feature.id);
  };

  const handleMergeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMergeDropdown(!showMergeDropdown);
  };

  const handleMergeOption = (e: React.MouseEvent, mergeType: MergeType) => {
    e.stopPropagation();
    onMerge?.(feature.id, mergeType);
    setShowMergeDropdown(false);
  };

  // Get worktree name for color coding
  const worktreeClass = feature.worktreeId ? ` feature-card--manager-${feature.worktreeId}` : '';
  const draggingClass = isDragging ? ' feature-card--dragging' : '';
  const isBacklog = feature.status === 'backlog';
  const backlogClass = isBacklog ? ' feature-card--not-selectable' : '';
  const cardClasses = `feature-card feature-card--${feature.status}${worktreeClass}${draggingClass}${backlogClass}`;

  // Determine status message based on feature state (only show important statuses)
  const getStatusInfo = (): string | null => {
    if (feature.status === 'backlog') {
      return 'Drag to start →';
    }
    if (feature.status === 'creating_worktree') {
      return 'Creating worktree...';
    }
    if (feature.status === 'active') {
      if (isAnalyzing) {
        return 'Analyzing...';
      }
      if (isDeveloping) {
        return 'Developing...';
      }
      if (isVerifying) {
        return 'Verifying...';
      }
      return null;
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
      draggable={canDrag}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
      title={isBacklog ? 'Drag to "In Progress" to start this feature' : undefined}
    >
      <div className="feature-card__header">
        <div className="feature-card__badges">
          <span className="feature-card__status-badge">
            {feature.status === 'backlog' && 'BACKLOG'}
            {feature.status === 'creating_worktree' && 'CREATING WORKTREE'}
            {feature.status === 'active' && 'ACTIVE'}
            {feature.status === 'merging' && 'MERGING'}
            {feature.status === 'archived' && 'ARCHIVED'}
          </span>
          {feature.prUrl && (
            <a
              href={feature.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="feature-card__pr-badge"
              onClick={(e) => e.stopPropagation()}
              title="Open Pull Request"
            >
              PR
              <ExternalLinkIcon className="feature-card__pr-icon" />
            </a>
          )}
        </div>

        <div className="feature-card__actions">
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

      {/* Manager badge - shown below header when assigned */}
      {feature.worktreeId && (
        <span className={`feature-card__manager-badge feature-card__manager-badge--${feature.worktreeId}`}>
          {feature.worktreeId.toUpperCase()}
        </span>
      )}

      <h3 className="feature-card__title" title={feature.name}>
        {feature.name}
      </h3>

      {/* Status indicator - shown below title */}
      {statusInfo && (
        <div className={`feature-card__status-indicator${statusInfo.endsWith('...') ? ' feature-card__status-indicator--busy' : ''}`}>
          <span>{statusInfo}</span>
        </div>
      )}

      {/* Merge button - only shown for merging features */}
      {feature.status === 'merging' && onMerge && (
        <div className="feature-card__footer">
          <div className="relative">
            <button
              className="feature-card__merge-btn"
              onClick={handleMergeClick}
              aria-label={`Merge ${feature.name}`}
            >
              <MergeIcon />
              Merge
            </button>
            {showMergeDropdown && (
              <div className="feature-card__dropdown">
                <button className="feature-card__dropdown-item" onClick={(e) => handleMergeOption(e, 'ai')}>
                  AI Merge
                </button>
                <button className="feature-card__dropdown-item" onClick={(e) => handleMergeOption(e, 'pr')}>
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
