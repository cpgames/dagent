import type { TaskStatus } from '@shared/types'

/**
 * Valid state transitions for task pipeline (queue-based):
 *
 * blocked → ready_for_dev       (all dependencies completed)
 * ready_for_dev → in_progress   (dev agent assigned)
 * in_progress → ready_for_qa    (dev complete)
 * in_progress → failed          (dev/qa/merge failure)
 * ready_for_qa → completed      (QA passed - pool mode, no per-task merge)
 * ready_for_qa → ready_for_merge (QA passed - legacy mode with per-task merge)
 * ready_for_qa → ready_for_dev  (QA failed, back to dev)
 * ready_for_merge → in_progress (merge agent started - legacy mode)
 * in_progress → completed       (merge success - legacy mode)
 *
 * Additionally:
 * any → blocked                 (reset on retry or dependency change)
 * failed → ready_for_dev        (retry after fix)
 */

export type StateTransitionEvent =
  | 'DEPENDENCIES_MET' // blocked → ready_for_dev
  | 'AGENT_ASSIGNED' // ready_for_dev → in_progress
  | 'DEV_COMPLETE' // in_progress → ready_for_qa
  | 'QA_PASSED' // ready_for_qa → ready_for_merge (legacy) or completed (pool)
  | 'QA_PASSED_POOL' // ready_for_qa → completed (pool mode - no merge needed)
  | 'QA_FAILED' // ready_for_qa → ready_for_dev (back to dev)
  | 'MERGE_STARTED' // ready_for_merge → in_progress
  | 'MERGE_SUCCESS' // in_progress → completed
  | 'MERGE_FAILED' // in_progress → failed
  | 'TASK_FAILED' // in_progress → failed
  | 'RETRY' // failed → ready_for_dev (if dependencies met)
  | 'DEPENDENCY_CHANGED' // any incomplete → blocked
  | 'RESET' // any → blocked (manual reset)

export interface StateTransition {
  from: TaskStatus
  to: TaskStatus
  event: StateTransitionEvent
}

// All valid transitions
export const VALID_TRANSITIONS: StateTransition[] = [
  // Main pipeline flow
  { from: 'blocked', to: 'ready_for_dev', event: 'DEPENDENCIES_MET' },
  { from: 'ready_for_dev', to: 'in_progress', event: 'AGENT_ASSIGNED' },
  { from: 'in_progress', to: 'ready_for_qa', event: 'DEV_COMPLETE' },
  { from: 'ready_for_qa', to: 'completed', event: 'QA_PASSED_POOL' }, // Pool mode: direct to completed
  { from: 'ready_for_qa', to: 'ready_for_merge', event: 'QA_PASSED' }, // Legacy mode: per-task merge
  { from: 'ready_for_qa', to: 'ready_for_dev', event: 'QA_FAILED' }, // Back to dev for rework
  { from: 'ready_for_merge', to: 'in_progress', event: 'MERGE_STARTED' }, // Legacy mode
  { from: 'in_progress', to: 'completed', event: 'MERGE_SUCCESS' }, // Legacy mode
  // Failure transitions
  { from: 'in_progress', to: 'failed', event: 'TASK_FAILED' },
  { from: 'in_progress', to: 'failed', event: 'MERGE_FAILED' },
  // Recovery and retry
  { from: 'failed', to: 'ready_for_dev', event: 'RETRY' },
  { from: 'failed', to: 'blocked', event: 'DEPENDENCY_CHANGED' },
  { from: 'ready_for_dev', to: 'blocked', event: 'DEPENDENCY_CHANGED' },
  // Reset transitions (any state → blocked)
  { from: 'blocked', to: 'blocked', event: 'RESET' },
  { from: 'ready_for_dev', to: 'blocked', event: 'RESET' },
  { from: 'in_progress', to: 'blocked', event: 'RESET' },
  { from: 'ready_for_qa', to: 'blocked', event: 'RESET' },
  { from: 'ready_for_merge', to: 'blocked', event: 'RESET' },
  { from: 'failed', to: 'blocked', event: 'RESET' },
  { from: 'completed', to: 'blocked', event: 'RESET' }
]

export interface TransitionResult {
  success: boolean
  previousStatus: TaskStatus
  newStatus: TaskStatus
  error?: string
}

/**
 * Checks if a state transition is valid.
 */
export function isValidTransition(
  from: TaskStatus,
  to: TaskStatus,
  event: StateTransitionEvent
): boolean {
  return VALID_TRANSITIONS.some((t) => t.from === from && t.to === to && t.event === event)
}

/**
 * Gets the target status for a given event from a current status.
 * Returns null if no valid transition exists.
 */
export function getNextStatus(
  currentStatus: TaskStatus,
  event: StateTransitionEvent
): TaskStatus | null {
  const transition = VALID_TRANSITIONS.find((t) => t.from === currentStatus && t.event === event)
  return transition?.to ?? null
}

/**
 * Gets all valid events that can be triggered from a given status.
 */
export function getValidEvents(currentStatus: TaskStatus): StateTransitionEvent[] {
  return VALID_TRANSITIONS.filter((t) => t.from === currentStatus).map((t) => t.event)
}
