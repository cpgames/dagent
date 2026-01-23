import type { Feature, FeatureStatus } from '@shared/types';
import FeatureCard, { type MergeType } from './FeatureCard';
import './KanbanColumn.css';

interface KanbanColumnProps {
  title: string;
  status: FeatureStatus;
  features: Feature[];
  onSelectFeature: (featureId: string) => void;
  onDeleteFeature: (featureId: string) => void;
  onStartFeature?: (featureId: string) => void;
  onStopFeature?: (featureId: string) => void;
  onMergeFeature?: (featureId: string, mergeType: MergeType) => void;
  startingFeatureId?: string | null;
  analysisStatus?: Record<string, { analyzing: boolean; pendingCount: number }>;
  worktreeProgress?: Record<string, string>;
  queueInfo?: Record<string, { position: number; poolQueueLength: number }>;
  /** Optional callback to add a new feature - shows "+ New Feature" button at top */
  onNewFeature?: () => void;
}

/**
 * KanbanColumn - Displays a column of feature cards.
 * Shows column header with title, count badge, and scrollable list of cards.
 * Note: The `status` prop is kept for interface compatibility but is no longer used.
 */
export default function KanbanColumn({
  title,
  status: _status,
  features,
  onSelectFeature,
  onDeleteFeature,
  onStartFeature,
  onStopFeature,
  onMergeFeature,
  startingFeatureId,
  analysisStatus,
  worktreeProgress,
  queueInfo,
  onNewFeature,
}: KanbanColumnProps) {
  const count = features.length;
  // Use column title for CSS class (e.g., 'In Progress' -> 'in-progress')
  const titleClass = title.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="kanban-column">
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
              const featureAnalysis = analysisStatus?.[feature.id];
              const featureQueueInfo = queueInfo?.[feature.id];
              return (
                <FeatureCard
                  key={feature.id}
                  feature={feature}
                  onSelect={onSelectFeature}
                  onDelete={onDeleteFeature}
                  onStart={onStartFeature}
                  onStop={onStopFeature}
                  onMerge={title === 'Completed' ? onMergeFeature : undefined}
                  isStarting={feature.id === startingFeatureId}
                  isAnalyzing={featureAnalysis?.analyzing}
                  pendingAnalysisCount={featureAnalysis?.pendingCount}
                  worktreeProgress={worktreeProgress?.[feature.id]}
                  queuePosition={featureQueueInfo?.position}
                  poolQueueLength={featureQueueInfo?.poolQueueLength}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
