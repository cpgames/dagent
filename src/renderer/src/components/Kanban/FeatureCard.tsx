import type { Feature, FeatureStatus } from '@shared/types';

interface FeatureCardProps {
  feature: Feature;
  onSelect: (featureId: string) => void;
  onArchive?: (featureId: string) => void;
  onDelete?: (featureId: string) => void;
  onStart?: (featureId: string) => void;
  isStarting?: boolean;
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
 * Trash icon SVG component
 */
function TrashIcon(): React.JSX.Element {
  return (
    <svg
      className="w-4 h-4"
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
      className="w-4 h-4"
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
      className="w-4 h-4 animate-spin"
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
 * FeatureCard - Displays a single feature in the Kanban board.
 * Shows feature name, task progress placeholder, archive button for completed features,
 * and delete button on hover (except for in_progress features).
 */
export default function FeatureCard({ feature, onSelect, onArchive, onDelete, onStart, isStarting }: FeatureCardProps) {
  const borderColor = statusColors[feature.status];
  const canDelete = feature.status !== 'in_progress';
  const canStart = feature.status === 'not_started' || feature.status === 'needs_attention';

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

  return (
    <div
      className="group bg-gray-800 rounded-lg p-4 cursor-pointer transition-all hover:ring-1 hover:ring-gray-600"
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
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-white font-medium truncate flex-1" title={feature.name}>
          {feature.name}
        </h3>

        <div className="flex items-center gap-1">
          {/* Start button - shown on hover for not_started/needs_attention features */}
          {canStart && onStart && (
            <button
              className={`opacity-0 group-hover:opacity-100 transition-all p-1 -m-1 ${
                isStarting
                  ? 'text-green-400 cursor-wait'
                  : 'text-gray-500 hover:text-green-400'
              }`}
              onClick={handleStart}
              disabled={isStarting}
              aria-label={`Start ${feature.name}`}
              title={isStarting ? 'Starting...' : 'Start execution'}
            >
              {isStarting ? <SpinnerIcon /> : <PlayIcon />}
            </button>
          )}

          {/* Delete button - shown on hover, hidden for in_progress features */}
          {canDelete && onDelete && (
            <button
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-1 -m-1"
              onClick={handleDelete}
              aria-label={`Delete ${feature.name}`}
              title="Delete feature"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end mt-2">
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
