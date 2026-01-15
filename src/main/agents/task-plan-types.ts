/**
 * TaskPlan types for DAGent Ralph Loop iteration tracking.
 * Enables iteration state persistence across fresh DevAgent context windows.
 * The TaskPlan tracks checklist items (implement/build/lint/test),
 * iteration count, and activity log so each new agent iteration knows
 * what's passing and what still needs work.
 */

// =============================================================================
// Status Types
// =============================================================================

/**
 * Status for individual checklist items.
 */
export type ChecklistStatus = 'pending' | 'pass' | 'fail' | 'skipped'

/**
 * Overall status for a TaskPlan.
 */
export type TaskPlanStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted'

// =============================================================================
// Core Interfaces
// =============================================================================

/**
 * Individual checklist item for tracking verification steps.
 */
export interface ChecklistItem {
  /** Unique identifier (e.g., 'implement', 'build', 'lint', 'test') */
  id: string
  /** Human-readable description */
  description: string
  /** Current status */
  status: ChecklistStatus
  /** Error message if failed */
  error?: string
  /** Truncated command output (max 500 chars) */
  output?: string
  /** ISO timestamp when status was verified */
  verifiedAt?: string
}

/**
 * Log entry for agent iteration activity.
 */
export interface ActivityEntry {
  /** 1-based iteration number */
  iteration: number
  /** What the agent accomplished */
  summary: string
  /** ISO timestamp */
  timestamp: string
  /** Duration in milliseconds */
  duration?: number
  /** Checklist state after iteration */
  checklistSnapshot?: Record<string, ChecklistStatus>
}

/**
 * Configuration options for task execution.
 */
export interface TaskPlanConfig {
  /** Run build step (default: true) */
  runBuild: boolean
  /** Run lint step (default: true) */
  runLint: boolean
  /** Run tests step (default: false, opt-in) */
  runTests: boolean
  /** Continue execution if lint fails (default: true) */
  continueOnLintFail: boolean
  /** Override detected build command */
  buildCommand?: string
  /** Override detected lint command */
  lintCommand?: string
  /** Override detected test command */
  testCommand?: string
}

/**
 * Full TaskPlan representing Ralph Loop iteration state.
 */
export interface TaskPlan {
  /** Associated task ID */
  taskId: string
  /** Associated feature ID */
  featureId: string
  /** Current iteration (1-based) */
  iteration: number
  /** Maximum allowed iterations (default: 10) */
  maxIterations: number
  /** Overall plan status */
  status: TaskPlanStatus
  /** Checklist items to verify */
  checklist: ChecklistItem[]
  /** Activity log of iterations */
  activity: ActivityEntry[]
  /** ISO timestamp when plan was created */
  createdAt: string
  /** ISO timestamp of last update */
  updatedAt: string
  /** ISO timestamp when plan completed (if applicable) */
  completedAt?: string
  /** Execution configuration */
  config: TaskPlanConfig
}

// =============================================================================
// Default Values
// =============================================================================

/**
 * Default checklist items for new TaskPlans.
 */
export const DEFAULT_CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'implement', description: 'Implement the task requirements', status: 'pending' },
  { id: 'build', description: 'Build passes without errors', status: 'pending' },
  { id: 'lint', description: 'Lint passes (if available)', status: 'pending' },
  { id: 'test', description: 'Tests pass (if available)', status: 'pending' }
]

/**
 * Default configuration for new TaskPlans.
 */
export const DEFAULT_TASK_PLAN_CONFIG: TaskPlanConfig = {
  runBuild: true,
  runLint: true,
  runTests: false,
  continueOnLintFail: true
}
