import type { TaskStatus } from '@shared/types'

/**
 * Valid state transitions for task pipeline:
 *
 * blocked → ready     (all dependencies completed)
 * ready → dev         (agent assigned)
 * dev → qa            (dev work complete, ready for QA)
 * dev → failed        (dev failure)
 * qa → merging        (QA passed)
 * qa → dev            (QA failed, rework needed)
 * qa → failed         (QA error)
 * merging → completed (merge success)
 * merging → failed    (merge failure)
 *
 * Additionally:
 * any → blocked       (reset on retry or dependency change)
 * failed → ready      (retry after fix)
 */

export type StateTransitionEvent =
  | 'DEPENDENCIES_MET' // blocked → ready
  | 'AGENT_ASSIGNED' // ready → dev
  | 'DEV_COMPLETE' // dev → qa
  | 'QA_PASSED' // qa → merging
  | 'QA_FAILED' // qa → dev (with feedback)
  | 'MERGE_SUCCESS' // merging → completed
  | 'MERGE_FAILED' // merging → failed
  | 'TASK_FAILED' // dev/qa → failed
  | 'RETRY' // failed → ready (if dependencies met)
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
  { from: 'blocked', to: 'ready', event: 'DEPENDENCIES_MET' },
  { from: 'ready', to: 'dev', event: 'AGENT_ASSIGNED' },
  { from: 'dev', to: 'qa', event: 'DEV_COMPLETE' },
  { from: 'qa', to: 'merging', event: 'QA_PASSED' },
  { from: 'qa', to: 'dev', event: 'QA_FAILED' },
  { from: 'merging', to: 'completed', event: 'MERGE_SUCCESS' },
  // Failure transitions
  { from: 'dev', to: 'failed', event: 'TASK_FAILED' },
  { from: 'qa', to: 'failed', event: 'TASK_FAILED' },
  { from: 'merging', to: 'failed', event: 'MERGE_FAILED' },
  // Recovery and retry
  { from: 'failed', to: 'ready', event: 'RETRY' },
  { from: 'failed', to: 'blocked', event: 'DEPENDENCY_CHANGED' },
  { from: 'ready', to: 'blocked', event: 'DEPENDENCY_CHANGED' },
  // Reset transitions (any state → blocked)
  { from: 'blocked', to: 'blocked', event: 'RESET' },
  { from: 'ready', to: 'blocked', event: 'RESET' },
  { from: 'dev', to: 'blocked', event: 'RESET' },
  { from: 'qa', to: 'blocked', event: 'RESET' },
  { from: 'merging', to: 'blocked', event: 'RESET' },
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
