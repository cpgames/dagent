import type { Feature, FeatureStatus } from '@shared/types';
import FeatureCard, { type MergeType } from './FeatureCard';
import './KanbanColumn.css';

interface KanbanColumnProps {
  title: string;
  status: FeatureStatus;
  features: Feature[];
  onSelectFeature: (featureId: string) => void;
  onArchiveFeature: (featureId: string) => void;
  onDeleteFeature: (featureId: string) => void;
  onStartFeature?: (featureId: string) => void;
  onMergeFeature?: (featureId: string, mergeType: MergeType) => void;
  startingFeatureId?: string | null;
}

/**
 * KanbanColumn - Displays a column of feature cards for a specific status.
 * Shows column header with title, count badge, and scrollable list of cards.
 */
export default function KanbanColumn({
  title,
  status,
  features,
  onSelectFeature,
  onArchiveFeature,
  onDeleteFeature,
  onStartFeature,
  onMergeFeature,
  startingFeatureId,
}: KanbanColumnProps) {
  const count = features.length;

  return (
    <div className="kanban-column">
      {/* Column Header */}
      <div className="kanban-column__header">
        <h3 className={`kanban-column__title kanban-column__title--${status}`}>
          {title}
        </h3>
        <span className="kanban-column__count">
          {count}
        </span>
      </div>

      {/* Cards Container */}
      <div className="kanban-column__cards">
        {features.length === 0 ? (
          <div className="kanban-column__empty">
            <p className="kanban-column__empty-text">No features</p>
          </div>
        ) : (
          features.map((feature) => (
            <FeatureCard
              key={feature.id}
              feature={feature}
              onSelect={onSelectFeature}
              onArchive={status === 'completed' ? onArchiveFeature : undefined}
              onDelete={onDeleteFeature}
              onStart={onStartFeature}
              onMerge={status === 'completed' ? onMergeFeature : undefined}
              isStarting={feature.id === startingFeatureId}
            />
          ))
        )}
      </div>
    </div>
  );
}
