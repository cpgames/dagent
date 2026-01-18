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
  onDeleteFeature,
  onStartFeature,
  onStopFeature,
  onMergeFeature,
  startingFeatureId,
  analysisStatus,
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

      {/* Scrollable Content */}
      <div className="kanban-column__content">
        {/* Cards Container */}
        <div className="kanban-column__cards">
          {features.length === 0 ? (
            <div className="kanban-column__empty">
              <p className="kanban-column__empty-text">No features</p>
            </div>
          ) : (
            features.map((feature) => {
              const featureAnalysis = analysisStatus?.[feature.id];
              return (
                <FeatureCard
                  key={feature.id}
                  feature={feature}
                  onSelect={onSelectFeature}
                  onDelete={onDeleteFeature}
                  onStart={onStartFeature}
                  onStop={onStopFeature}
                  onMerge={status === 'completed' ? onMergeFeature : undefined}
                  isStarting={feature.id === startingFeatureId}
                  isAnalyzing={featureAnalysis?.analyzing}
                  pendingAnalysisCount={featureAnalysis?.pendingCount}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
