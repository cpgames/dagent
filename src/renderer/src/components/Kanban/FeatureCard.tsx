import type { Feature, FeatureStatus } from '@shared/types';

interface FeatureCardProps {
  feature: Feature;
  onSelect: (featureId: string) => void;
  onArchive?: (featureId: string) => void;
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
 * FeatureCard - Displays a single feature in the Kanban board.
 * Shows feature name, task progress placeholder, and archive button for completed features.
 */
export default function FeatureCard({ feature, onSelect, onArchive }: FeatureCardProps) {
  const borderColor = statusColors[feature.status];

  const handleClick = () => {
    onSelect(feature.id);
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onSelect
    onArchive?.(feature.id);
  };

  return (
    <div
      className="bg-gray-800 rounded-lg p-4 cursor-pointer transition-all hover:ring-1 hover:ring-gray-600"
      style={{ borderLeft: `4px solid ${borderColor}` }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      <h3 className="text-white font-medium mb-2 truncate" title={feature.name}>
        {feature.name}
      </h3>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">
          {/* Task count placeholder - actual count comes in Phase 7 */}
          0 tasks
        </span>

        {feature.status === 'completed' && onArchive && (
          <button
            className="text-sm text-gray-400 hover:text-white transition-colors"
            onClick={handleArchive}
            aria-label={`Archive ${feature.name}`}
          >
            Archive
          </button>
        )}
      </div>
    </div>
  );
}
