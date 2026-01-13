import type { TaskStatus } from '@shared/types'

/**
 * Valid state transitions per DAGENT_SPEC section 6.4:
 *
 * blocked → ready     (all dependencies completed)
 * ready → running     (agent assigned)
 * running → merging   (code complete)
 * merging → completed (merge success)
 * merging → failed    (merge failure)
 * running → failed    (task failure)
 *
 * Additionally:
 * any → blocked       (reset on retry or dependency change)
 * failed → ready      (retry after fix)
 */

export type StateTransitionEvent =
  | 'DEPENDENCIES_MET' // blocked → ready
  | 'AGENT_ASSIGNED' // ready → running
  | 'CODE_COMPLETE' // running → merging
  | 'MERGE_SUCCESS' // merging → completed
  | 'MERGE_FAILED' // merging → failed
  | 'TASK_FAILED' // running → failed
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
  { from: 'blocked', to: 'ready', event: 'DEPENDENCIES_MET' },
  { from: 'ready', to: 'running', event: 'AGENT_ASSIGNED' },
  { from: 'running', to: 'merging', event: 'CODE_COMPLETE' },
  { from: 'merging', to: 'completed', event: 'MERGE_SUCCESS' },
  { from: 'merging', to: 'failed', event: 'MERGE_FAILED' },
  { from: 'running', to: 'failed', event: 'TASK_FAILED' },
  { from: 'failed', to: 'ready', event: 'RETRY' },
  { from: 'failed', to: 'blocked', event: 'DEPENDENCY_CHANGED' },
  { from: 'ready', to: 'blocked', event: 'DEPENDENCY_CHANGED' },
  { from: 'blocked', to: 'blocked', event: 'RESET' },
  { from: 'ready', to: 'blocked', event: 'RESET' },
  { from: 'running', to: 'blocked', event: 'RESET' },
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
