/**
 * Transition rules define where an item goes after processing.
 * Used by Router to move items between managers.
 */
export interface TransitionRules {
  /** Status to transition to on success (undefined = stay in completed list) */
  onSuccess?: string
  /** Status to transition to on failure (undefined = stay in failed list) */
  onFail?: string
}

/**
 * Task status in the dual-manager architecture.
 *
 * Normal flow: ready -> developing -> verifying -> archived
 *                           ^              |
 *                           |_(QA fail)____|
 *
 * Optional analysis: ready -> analyzing -> ready -> developing
 *
 * Pause flow:
 *   developing -> developing_paused (stash changes)
 *   verifying -> verifying_paused (stash changes)
 *   *_paused -> original status (resume)
 */
export type TaskStatus =
  | 'ready' // Ready to start development
  | 'analyzing' // PM agent analyzing/refining task (optional)
  | 'developing' // Dev agent implementing
  | 'developing_paused' // Dev paused, changes stashed
  | 'verifying' // QA agent verifying
  | 'verifying_paused' // QA paused, changes stashed
  | 'done' // Complete and committed

/**
 * Human-readable labels for task statuses.
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  ready: 'Ready',
  analyzing: 'Analyzing',
  developing: 'Developing',
  developing_paused: 'Paused (Dev)',
  verifying: 'Verifying',
  verifying_paused: 'Paused (QA)',
  done: 'Done'
}

/**
 * Get human-readable label for a task status.
 */
export function getTaskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status] || status
}

export interface TaskPosition {
  x: number
  y: number
}

/**
 * Task analysis results from PM agent.
 */
export interface TaskAnalysis {
  approach: string // How to implement this task
  files: string[] // Files likely to be modified
  acceptanceCriteria: string[] // What defines "done"
  estimatedComplexity: 'low' | 'medium' | 'high'
  analyzedAt: string // ISO timestamp
}

/**
 * Task implements IManageable for the manager architecture.
 */
export interface Task {
  id: string
  title: string
  spec: string // Markdown spec from PM analysis
  status: TaskStatus
  position: TaskPosition
  dependencies: string[] // Task IDs this task depends on

  // IManageable fields
  blocked: boolean // True if waiting on dependencies
  transitions?: TransitionRules // Optional item-level transition overrides

  // Analysis results (populated when PM analyzes)
  analysis?: TaskAnalysis

  // Execution tracking
  devIterations?: number // Number of dev attempts
  qaIterations?: number // Number of QA attempts
  qaFeedback?: string // Feedback from QA when task fails
  assignedAgentId?: string // ID of agent currently working on this task
  stashId?: string // Git stash reference when task is paused
  isPaused?: boolean // True if task execution was paused (status kept as developing/verifying)
  commitHash?: string // Git commit hash when task completed

  // Session tracking
  sessions?: {
    analysis?: string[] // Session IDs for analysis
    dev?: string[] // Session IDs for dev iterations
    qa?: string[] // Session IDs for QA iterations
  }
  currentSessionId?: string // Active session ID
}

/**
 * Check if a task status represents paused state.
 */
export function isTaskPaused(status: TaskStatus): boolean {
  return status === 'developing_paused' || status === 'verifying_paused'
}

/**
 * Check if a task status is terminal (no further work).
 */
export function isTaskTerminal(status: TaskStatus): boolean {
  return status === 'done'
}

/**
 * Check if a task can be paused (has uncommitted work).
 */
export function canPauseTask(status: TaskStatus): boolean {
  return status === 'developing' || status === 'verifying'
}

/**
 * Get the paused status for an active task.
 */
export function getPausedStatus(
  status: 'developing' | 'verifying'
): 'developing_paused' | 'verifying_paused' {
  return status === 'developing' ? 'developing_paused' : 'verifying_paused'
}

/**
 * Get the active status from a paused task.
 */
export function getActiveStatus(
  status: 'developing_paused' | 'verifying_paused'
): 'developing' | 'verifying' {
  return status === 'developing_paused' ? 'developing' : 'verifying'
}
