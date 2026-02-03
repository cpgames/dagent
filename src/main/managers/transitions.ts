import type { TransitionRules } from './types'

// Re-export TaskStatus from shared types for consistency
export type { TaskStatus } from '@shared/types/task'
import type { TaskStatus } from '@shared/types/task'

// Re-export labels from shared types
export { TASK_STATUS_LABELS } from '@shared/types/task'

// Re-export FeatureStatus from shared types
export type { FeatureStatus } from '@shared/types/feature'
export { FEATURE_STATUS_LABELS } from '@shared/types/feature'
import type { FeatureStatus } from '@shared/types/feature'

/**
 * Default transitions for tasks.
 *
 * Normal flow:
 *   ready -> developing -> verifying -> done
 *               ^              |
 *               |_(QA fail)____|
 *
 * Optional analysis:
 *   ready -> analyzing -> ready (refines task, then back to ready)
 *
 * Pause flow:
 *   developing -> developing_paused -> developing (resume)
 *   verifying -> verifying_paused -> verifying (resume)
 */
export const TASK_TRANSITIONS: Record<TaskStatus, TransitionRules> = {
  ready: {
    onSuccess: 'developing' // Direct start
  },
  analyzing: {
    onSuccess: 'ready', // After analysis, task is ready again
    onFail: 'ready' // On failure, back to ready
  },
  developing: {
    onSuccess: 'verifying',
    onFail: 'developing' // Retry dev on failure
  },
  developing_paused: {
    onSuccess: 'developing' // Resume goes back to developing
  },
  verifying: {
    onSuccess: 'done',
    onFail: 'ready' // QA fail goes back to ready for re-assignment
  },
  verifying_paused: {
    onSuccess: 'verifying' // Resume goes back to verifying
  },
  done: {} // Terminal state - no transitions
}

/**
 * Default transitions for features.
 *
 * Flow:
 *   backlog -> creating_worktree -> active -> merging -> archived
 *                                      ^          |
 *                                      |_(fail)___|
 */
export const FEATURE_TRANSITIONS: Record<FeatureStatus, TransitionRules> = {
  backlog: {
    onSuccess: 'creating_worktree'
  },
  creating_worktree: {
    onSuccess: 'active',
    onFail: 'backlog' // Failed to create worktree, back to backlog
  },
  active: {
    onSuccess: 'merging'
  },
  merging: {
    onSuccess: 'archived',
    onFail: 'active' // Merge failure goes back to active
  },
  archived: {} // Terminal state - no transitions
}

/**
 * Get the next status for a task based on success/failure.
 * Uses item-level overrides if present, otherwise falls back to defaults.
 */
export function getNextTaskStatus(
  currentStatus: TaskStatus,
  success: boolean,
  itemTransitions?: TransitionRules
): TaskStatus | undefined {
  const transitions = itemTransitions ?? TASK_TRANSITIONS[currentStatus]
  const nextStatus = success ? transitions?.onSuccess : transitions?.onFail
  return nextStatus as TaskStatus | undefined
}

/**
 * Get the next status for a feature based on success/failure.
 * Uses item-level overrides if present, otherwise falls back to defaults.
 */
export function getNextFeatureStatus(
  currentStatus: FeatureStatus,
  success: boolean,
  itemTransitions?: TransitionRules
): FeatureStatus | undefined {
  const transitions = itemTransitions ?? FEATURE_TRANSITIONS[currentStatus]
  const nextStatus = success ? transitions?.onSuccess : transitions?.onFail
  return nextStatus as FeatureStatus | undefined
}

/**
 * Check if a task status is terminal (no further transitions).
 */
export function isTaskTerminal(status: TaskStatus): boolean {
  return status === 'done'
}

/**
 * Check if a feature status is terminal (no further transitions).
 */
export function isFeatureTerminal(status: FeatureStatus): boolean {
  return status === 'archived'
}

/**
 * Check if a task status represents paused state.
 */
export function isTaskPaused(status: TaskStatus): boolean {
  return status === 'developing_paused' || status === 'verifying_paused'
}

/**
 * Get the active status for a paused task.
 */
export function getActiveStatusFromPaused(
  pausedStatus: 'developing_paused' | 'verifying_paused'
): 'developing' | 'verifying' {
  return pausedStatus === 'developing_paused' ? 'developing' : 'verifying'
}

/**
 * Get the paused status for an active task.
 */
export function getPausedStatusFromActive(
  activeStatus: 'developing' | 'verifying'
): 'developing_paused' | 'verifying_paused' {
  return activeStatus === 'developing' ? 'developing_paused' : 'verifying_paused'
}
