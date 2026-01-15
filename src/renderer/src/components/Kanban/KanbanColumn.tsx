import type { Feature, FeatureStatus } from '@shared/types';
import FeatureCard, { type MergeType } from './FeatureCard';

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
 * Status color mapping per DAGENT_SPEC 11.1
 */
const statusColors: Record<FeatureStatus, string> = {
  not_started: '#3B82F6',    // Blue
  in_progress: '#F59E0B',    // Yellow
  needs_attention: '#EF4444', // Red
  completed: '#22C55E',       // Green
};

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
  const titleColor = statusColors[status];
  const count = features.length;

  return (
    <div className="flex-1 min-w-[250px] max-w-[350px] flex flex-col bg-gray-900/30 rounded-lg p-3">
      {/* Column Header */}
      <div className="flex items-center gap-2 mb-3">
        <h3
          className="text-sm font-medium uppercase tracking-wide"
          style={{ color: titleColor }}
        >
          {title}
        </h3>
        <span className="bg-gray-700 text-gray-300 text-xs font-medium px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>

      {/* Cards Container */}
      <div className="flex-1 space-y-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        {features.length === 0 ? (
          <div className="flex-1 flex items-center justify-center border border-dashed border-gray-700 rounded-lg min-h-[100px]">
            <p className="text-sm text-gray-500">No features</p>
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
