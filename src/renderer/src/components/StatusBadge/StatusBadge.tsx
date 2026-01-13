import type { JSX } from 'react';
import type { TaskStatus, FeatureStatus } from '@shared/types';

type Status = TaskStatus | FeatureStatus;

const statusConfig: Record<Status, { color: string; bg: string; label: string }> = {
  // Task statuses
  blocked: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Blocked' },
  ready: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Ready' },
  running: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Running' },
  merging: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Merging' },
  completed: { color: 'text-green-400', bg: 'bg-green-500/20', label: 'Completed' },
  failed: { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Failed' },
  // Feature statuses
  not_started: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Not Started' },
  in_progress: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'In Progress' },
  needs_attention: { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Needs Attention' }
};

interface StatusBadgeProps {
  status: Status;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function StatusBadge({
  status,
  showLabel = true,
  size = 'md'
}: StatusBadgeProps): JSX.Element {
  const config = statusConfig[status] || statusConfig.blocked;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5'
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${config.bg} ${config.color} ${sizeClasses[size]}`}
    >
      <span
        className={`${dotSizes[size]} rounded-full ${
          status === 'running' || status === 'merging' || status === 'in_progress'
            ? 'animate-pulse bg-current'
            : 'bg-current'
        }`}
      />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
