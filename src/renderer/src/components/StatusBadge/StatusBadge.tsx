import type { JSX } from 'react';
import type { TaskStatus, FeatureStatus } from '@shared/types';

type Status = TaskStatus | FeatureStatus;

const statusConfig: Record<Status, { color: string; bg: string; label: string }> = {
  // Task statuses
  needs_analysis: { color: 'text-purple-400', bg: 'bg-purple-500/20', label: 'Needs Analysis' },
  blocked: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Blocked' },
  ready_for_dev: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Ready' },
  in_progress: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'In Progress' },
  ready_for_qa: { color: 'text-purple-400', bg: 'bg-purple-500/20', label: 'QA Ready' },
  ready_for_merge: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Merge Ready' },
  completed: { color: 'text-green-400', bg: 'bg-green-500/20', label: 'Completed' },
  failed: { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Failed' },
  // Feature statuses (state-based lifecycle)
  not_started: { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Not Started' },
  creating_worktree: { color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Creating...' },
  investigating: { color: 'text-purple-400', bg: 'bg-purple-500/20', label: 'Investigating' },
  ready_for_planning: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Ready to Plan' },
  planning: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Planning' },
  ready: { color: 'text-green-400', bg: 'bg-green-500/20', label: 'Ready' },
  developing: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Developing' },
  verifying: { color: 'text-purple-400', bg: 'bg-purple-500/20', label: 'Verifying' },
  needs_merging: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Merge Pending' },
  merging: { color: 'text-green-400', bg: 'bg-green-500/20', label: 'Merging' },
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
          status === 'in_progress' || status === 'ready_for_qa' || status === 'ready_for_merge' ||
          status === 'creating_worktree' || status === 'investigating' || status === 'merging' ||
          status === 'planning' || status === 'developing' || status === 'verifying'
            ? 'animate-pulse bg-current'
            : 'bg-current'
        }`}
      />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
