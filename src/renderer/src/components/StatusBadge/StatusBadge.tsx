import type { JSX } from 'react';
import type { TaskStatus, FeatureStatus } from '@shared/types';

type Status = TaskStatus | FeatureStatus;

const statusConfig: Record<Status, { color: string; bg: string; label: string }> = {
  // Task statuses
  ready: { color: 'text-cyan-400', bg: 'bg-cyan-500/20', label: 'Ready' },
  analyzing: { color: 'text-purple-400', bg: 'bg-purple-500/20', label: 'Analyzing' },
  developing: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Developing' },
  developing_paused: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Paused (Dev)' },
  verifying: { color: 'text-purple-400', bg: 'bg-purple-500/20', label: 'Verifying' },
  verifying_paused: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Paused (QA)' },
  done: { color: 'text-green-400', bg: 'bg-green-500/20', label: 'Done' },
  // Feature statuses
  backlog: { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Backlog' },
  creating_worktree: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Creating Worktree' },
  active: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Active' },
  merging: { color: 'text-cyan-400', bg: 'bg-cyan-500/20', label: 'Merging' },
  archived: { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Archived' }
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
  const config = statusConfig[status] || statusConfig.ready;

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

  const isAnimated = status === 'developing' || status === 'verifying' || status === 'analyzing' || status === 'active' || status === 'creating_worktree';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${config.bg} ${config.color} ${sizeClasses[size]}`}
    >
      <span
        className={`${dotSizes[size]} rounded-full ${
          isAnimated ? 'animate-pulse bg-current' : 'bg-current'
        }`}
      />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
