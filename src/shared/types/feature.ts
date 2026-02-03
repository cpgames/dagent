import type { TransitionRules } from './task'

/**
 * Feature status in the dual-manager architecture.
 *
 * Flow: backlog -> creating_worktree -> active -> merging -> archived
 *                                         ^          |
 *                                         |_(fail)___|
 *
 * - backlog: Feature created but not yet started (no worktree)
 * - creating_worktree: Assigned to feature manager, worktree being created
 * - active: Has worktree, tasks being worked on
 * - merging: All tasks archived, merging feature branch to main
 * - archived: Complete and merged, worktree can be reclaimed
 */
export type FeatureStatus = 'backlog' | 'creating_worktree' | 'active' | 'merging' | 'archived'

/**
 * Human-readable labels for feature statuses.
 */
export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  backlog: 'Backlog',
  creating_worktree: 'Creating Worktree',
  active: 'Active',
  merging: 'Merging',
  archived: 'Archived'
}

/**
 * Get human-readable label for a feature status.
 */
export function getFeatureStatusLabel(status: FeatureStatus): string {
  return FEATURE_STATUS_LABELS[status] || status
}

/** Action to take when feature is completed */
export type CompletionAction = 'manual' | 'auto_pr' | 'auto_merge'

/** Execution mode for task development */
export type ExecutionMode = 'auto' | 'step'

/** Worktree pool identifiers */
export type WorktreeId = 'neon' | 'cyber' | 'pulse'

/**
 * Feature implements IManageable for the manager architecture.
 */
export interface Feature {
  id: string
  name: string
  status: FeatureStatus
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
  description?: string // Optional multi-line description
  attachments?: string[] // Optional array of file paths relative to feature directory

  // IManageable fields
  blocked: boolean // True if blocked (e.g., waiting on external dependency)
  transitions?: TransitionRules // Optional item-level transition overrides
  errorMessage?: string // Error message if processing failed

  // Worktree assignment (when active)
  worktreeId?: WorktreeId // Which worktree pool this feature is assigned to
  worktreePath?: string // Full path to the worktree
  branch?: string // Branch name (e.g., dagent/neon)

  // Settings
  completionAction?: CompletionAction // Action when feature completes (defaults to 'manual')
  executionMode?: ExecutionMode // How tasks are executed: 'auto' (default) or 'step' (manual per-task)

  // PR tracking
  prUrl?: string // URL to the created pull request (if any)
}

/**
 * Check if a feature status is terminal (no further work).
 */
export function isFeatureTerminal(status: FeatureStatus): boolean {
  return status === 'archived'
}

/**
 * Check if a feature has an assigned worktree.
 */
export function hasWorktree(feature: Feature): boolean {
  return !!feature.worktreeId && !!feature.worktreePath
}

// Branch naming per DAGENT_SPEC section 8.1
// Note: Feature branch uses /main suffix to avoid git ref conflicts with task branches
// Git cannot have both 'feature/test' (branch) and 'feature/test/task-xxx' (branch)
// because refs/heads/feature/test would need to be both a file and a directory

/**
 * Get the branch name for a feature.
 * @example getFeatureBranchName('feature-car') => 'feature/car/main'
 */
export function getFeatureBranchName(featureId: string): string {
  const cleanId = featureId.replace(/^feature-/, '')
  return `feature/${cleanId}/main`
}

/**
 * Get the branch name for a task.
 * @example getTaskBranchName('feature-car', '2145') => 'feature/car/task-2145'
 */
export function getTaskBranchName(featureId: string, taskId: string): string {
  const cleanId = featureId.replace(/^feature-/, '')
  return `feature/${cleanId}/task-${taskId}`
}
