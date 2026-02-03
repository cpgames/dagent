/**
 * Feature Manager Types
 *
 * Types for the feature manager system that manages reusable worktrees
 * for feature execution.
 */

/**
 * Feature manager worktree status
 */
export type FeatureManagerWorktreeStatus = 'initializing' | 'idle' | 'busy' | 'merging'

/**
 * Information about a feature manager's worktree (serializable, no class references)
 */
export interface FeatureManagerInfo {
  /** Feature manager identifier (1, 2, or 3) */
  featureManagerId: number
  /** Branch name: "worktree-neon", "worktree-cyber", etc. */
  branchName: string
  /** Worktree path: ".dagent-worktrees/neon", etc. */
  worktreePath: string | null
  /** Current status of the feature manager */
  status: FeatureManagerWorktreeStatus
  /** Currently active feature ID, or null if idle */
  currentFeatureId: string | null
  /** Number of features in queue */
  queueLength: number
}

/**
 * Configuration for feature managers
 */
export interface FeatureManagerConfig {
  /** Maximum number of feature managers (default: 3) */
  maxManagers: number
}

/**
 * Default feature manager configuration
 */
export const DEFAULT_MANAGER_CONFIG: FeatureManagerConfig = {
  maxManagers: 3
}

/**
 * Entry in the feature queue for a manager
 */
export interface FeatureQueueEntry {
  /** Feature ID */
  featureId: string
  /** ISO timestamp when feature was added to queue */
  addedAt: string
  /** Current status of the feature in the queue */
  status: 'queued' | 'active' | 'merging' | 'completed'
}

/**
 * Entry in the global merge queue
 */
export interface MergeQueueEntry {
  /** Feature ID waiting to be merged */
  featureId: string
  /** Feature manager ID where the feature was executed */
  featureManagerId: number
  /** Target branch to merge to */
  targetBranch: string
  /** ISO timestamp when merge was requested */
  requestedAt: string
  /** Current status of the merge */
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  /** Error message if merge failed */
  error?: string
}

/**
 * Result of feature assignment to a manager
 */
export interface FeatureAssignmentResult {
  /** Feature manager ID assigned to the feature */
  featureManagerId: number
  /** Position in the manager's queue (0 = active, 1+ = queued) */
  queuePosition: number
  /** Whether feature started immediately or was queued */
  isQueued: boolean
  /** Path to the worktree (null if not yet created) */
  worktreePath: string | null
}

/**
 * Result of a merge operation
 */
export interface MergeResult {
  /** Whether merge completed successfully */
  success: boolean
  /** Whether any merge actually occurred (false if already up to date) */
  merged: boolean
  /** Conflicts encountered during merge */
  conflicts?: MergeConflict[]
  /** Commit hash after successful merge */
  commitHash?: string
  /** Error message if merge failed */
  error?: string
}

/**
 * Conflict information from merge
 */
export interface MergeConflict {
  /** File path with conflict */
  file: string
  /** Type of conflict */
  type: 'content' | 'delete' | 'rename' | 'binary'
  /** Our version of the file (manager branch) */
  ours?: string
  /** Their version of the file (target branch) */
  theirs?: string
}

/**
 * Feature manager status values
 */
export type FeatureManagerStatus =
  | 'idle'
  | 'preparing'
  | 'waiting_for_prep_merge'
  | 'executing'
  | 'waiting_for_completion_merge'
  | 'merging'

/**
 * State of a FeatureManager
 */
export interface FeatureManagerState {
  /** Feature manager ID */
  featureManagerId: number
  /** Branch name for this manager */
  branchName: string
  /** Worktree path for this manager (null if not created) */
  worktreePath: string | null
  /** Currently active feature, or null if idle */
  currentFeature: FeatureQueueEntry | null
  /** Queue of waiting features */
  queue: FeatureQueueEntry[]
  /** Currently executing task ID, or null */
  currentTaskId: string | null
  /** Manager status */
  status: FeatureManagerStatus
  /** Pending merge request ID from MergeManager */
  pendingMergeRequestId: string | null
}

/**
 * Events emitted by FeatureManagerPool
 */
export interface FeatureManagerPoolEvents {
  'manager:created': { featureManagerId: number; branchName: string }
  'manager:initialized': { featureManagerId: number }
  'manager:status-changed': { featureManagerId: number; status: FeatureManagerWorktreeStatus }
  'feature:assigned': { featureId: string; featureManagerId: number; queuePosition: number }
  'feature:queued': { featureId: string; featureManagerId: number; queuePosition: number }
  'feature:started': { featureId: string; featureManagerId: number }
  'feature:completed': { featureId: string; featureManagerId: number }
  'feature:removed': { featureId: string; featureManagerId: number }
  'merge:enqueued': { featureId: string; featureManagerId: number }
  'merge:started': { featureId: string; featureManagerId: number }
  'merge:completed': { featureId: string; featureManagerId: number; success: boolean }
  'merge:failed': { featureId: string; featureManagerId: number; error: string }
}

/**
 * Overall status of the feature manager pool
 */
export interface FeatureManagerPoolStatus {
  /** Whether the pool has been initialized */
  initialized: boolean
  /** Number of active feature managers */
  activeManagerCount: number
  /** Maximum number of feature managers */
  maxManagers: number
  /** Total features currently queued across all managers */
  totalQueuedFeatures: number
  /** Number of items in the merge queue */
  mergeQueueLength: number
  /** Info about each feature manager */
  managers: FeatureManagerInfo[]
}

/**
 * Events emitted by FeatureManager
 */
export interface FeatureManagerEvents {
  'feature:started': { featureId: string }
  'feature:prepared': { featureId: string }
  'feature:prep_failed': { featureId: string; error: string }
  'feature:completed': { featureId: string }
  'feature:merged': { featureId: string }
  'feature:merge_failed': { featureId: string; error: string }
  'task:started': { featureId: string; taskId: string }
  'task:completed': { featureId: string; taskId: string }
  'merge:requested': { featureId: string }
  'queue:updated': { queueLength: number }
}

/**
 * Synthwave-themed feature manager names.
 * Each manager gets a unique neon-inspired name.
 */
export const FEATURE_MANAGER_NAMES: Record<number, string> = {
  1: 'Neon',
  2: 'Cyber',
  3: 'Pulse'
}

/**
 * Get feature manager name for a manager ID
 */
export function getFeatureManagerName(featureManagerId: number): string {
  return FEATURE_MANAGER_NAMES[featureManagerId] || `Manager-${featureManagerId}`
}

/**
 * Get branch name for a feature manager
 */
export function getManagerBranchName(featureManagerId: number): string {
  const name = getFeatureManagerName(featureManagerId).toLowerCase()
  return `dagent/${name}`
}

/**
 * Get worktree path for a feature manager
 */
export function getManagerWorktreePath(projectRoot: string, featureManagerId: number): string {
  const name = getFeatureManagerName(featureManagerId).toLowerCase()
  return `${projectRoot}/.dagent-worktrees/${name}`
}

