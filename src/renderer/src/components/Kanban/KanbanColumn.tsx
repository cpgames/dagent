import { useState } from 'react';
import type { Feature, FeatureStatus } from '@shared/types';
import FeatureCard, { type MergeType } from './FeatureCard';
import './KanbanColumn.css';

/** Data transferred during drag operation */
interface DragData {
  featureId: string;
  currentStatus: FeatureStatus;
}

interface KanbanColumnProps {
  title: string;
  status: FeatureStatus;
  features: Feature[];
  onSelectFeature: (featureId: string) => void;
  onDeleteFeature: (featureId: string) => void;
  onMergeFeature?: (featureId: string, mergeType: MergeType) => void;
  taskStatus?: Record<string, { analyzing: boolean; isDeveloping: boolean; isVerifying: boolean }>;
  /** Optional callback to add a new feature - shows "+ New Feature" button at top */
  onNewFeature?: () => void;
  /** Callback when a feature is dropped into this column */
  onDropFeature?: (featureId: string, fromStatus: FeatureStatus, toStatus: FeatureStatus) => void;
}

/**
 * Valid status transitions for drag and drop.
 * All transitions allowed except dropping on same column.
 * Note: creating_worktree is a transient status - features transition through it automatically.
 */
const VALID_DROP_TRANSITIONS: Record<FeatureStatus, FeatureStatus[]> = {
  backlog: ['creating_worktree', 'active', 'merging', 'archived'],
  creating_worktree: ['backlog'], // Can cancel back to backlog
  active: ['backlog', 'merging', 'archived'],
  merging: ['backlog', 'active', 'archived'],
  archived: ['backlog', 'active', 'merging']
};

/**
 * KanbanColumn - Displays a column of feature cards.
 * Shows column header with title, count badge, and scrollable list of cards.
 * Supports drag and drop to move features between columns.
 */
export default function KanbanColumn({
  title,
  status,
  features,
  onSelectFeature,
  onDeleteFeature,
  onMergeFeature,
  taskStatus,
  onNewFeature,
  onDropFeature,
}: KanbanColumnProps) {
  const count = features.length;
  // Use column title for CSS class (e.g., 'In Progress' -> 'in-progress')
  const titleClass = title.toLowerCase().replace(/\s+/g, '-');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isValidDrop, setIsValidDrop] = useState(false);

  // Check if a drop from the given status to this column is valid
  const canDropFrom = (fromStatus: FeatureStatus): boolean => {
    if (fromStatus === status) return false; // Can't drop in same column
    const validTargets = VALID_DROP_TRANSITIONS[fromStatus];
    return validTargets?.includes(status) ?? false;
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if this is our drag data
    const hasData = e.dataTransfer.types.includes('application/json') ||
                    e.dataTransfer.types.includes('text/plain');
    if (hasData) {
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);

    // Try to determine if this is a valid drop target
    // Note: We can't read dataTransfer during dragenter, so we check on drop
    setIsValidDrop(true); // Assume valid, will be validated on drop
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only trigger if leaving the column itself, not a child
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDragOver(false);
    setIsValidDrop(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setIsValidDrop(false);

    try {
      // Try application/json first, fall back to text/plain
      let jsonData = e.dataTransfer.getData('application/json');
      if (!jsonData) {
        jsonData = e.dataTransfer.getData('text/plain');
      }
      if (!jsonData) {
        return;
      }

      const data: DragData = JSON.parse(jsonData);
      const { featureId, currentStatus } = data;

      // Validate transition
      if (!canDropFrom(currentStatus)) {
        return;
      }

      // Trigger the drop callback
      onDropFeature?.(featureId, currentStatus, status);
    } catch (error) {
      console.error('[KanbanColumn] Error handling drop:', error);
    }
  };

  const columnClasses = `kanban-column${isDragOver ? ' kanban-column--drag-over' : ''}${isDragOver && isValidDrop ? ' kanban-column--valid-drop' : ''}`;

  return (
    <div
      className={columnClasses}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className="kanban-column__header">
        <h3 className={`kanban-column__title kanban-column__title--${titleClass}`}>
          {title}
        </h3>
        <span className="kanban-column__count">
          {count}
        </span>
      </div>

      {/* Scrollable Content */}
      <div className="kanban-column__content">
        {/* Cards Container */}
        <div className="kanban-column__cards">
          {/* New Feature button - always first if provided */}
          {onNewFeature && (
            <button
              className="kanban-column__new-feature"
              onClick={onNewFeature}
            >
              + New Feature
            </button>
          )}
          {features.length === 0 && !onNewFeature ? (
            <div className="kanban-column__empty">
              <p className="kanban-column__empty-text">No features</p>
            </div>
          ) : (
            features.map((feature) => {
              const featureStatus = taskStatus?.[feature.id];
              return (
                <FeatureCard
                  key={feature.id}
                  feature={feature}
                  onSelect={onSelectFeature}
                  onDelete={onDeleteFeature}
                  onMerge={title === 'Merging' ? onMergeFeature : undefined}
                  isAnalyzing={featureStatus?.analyzing}
                  isDeveloping={featureStatus?.isDeveloping}
                  isVerifying={featureStatus?.isVerifying}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
