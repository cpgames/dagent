/**
 * TaskController types for DAGent Ralph Loop iteration cycle.
 * Manages iterative DevAgent execution with fresh context windows
 * and automated verification until all checks pass or max iterations reached.
 */

import type { VerificationResult } from '../agents/verification-types'

// =============================================================================
// Status Types
// =============================================================================

/**
 * TaskController status for tracking the loop lifecycle.
 */
export type TaskControllerStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'aborted'

/**
 * Reason for exiting the Ralph Loop.
 */
export type LoopExitReason =
  | 'all_checks_passed' // All required checks pass
  | 'max_iterations_reached' // Hit maxIterations limit (safety backstop)
  | 'context_limit_reached' // Hit context token limit (intelligent checkpoint)
  | 'aborted' // User or system abort
  | 'error' // Unrecoverable error occurred

/**
 * Cumulative token usage tracking across iterations.
 */
export interface CumulativeTokenUsage {
  input: number
  output: number
  total: number
}

// =============================================================================
// Result Interfaces
// =============================================================================

/**
 * Result of a single Ralph Loop iteration.
 */
export interface IterationResult {
  /** 1-based iteration number */
  iteration: number
  /** Whether DevAgent completed successfully */
  devAgentSuccess: boolean
  /** Results from verification checks */
  verificationResults: VerificationResult[]
  /** Duration of this iteration in milliseconds */
  duration: number
  /** Human-readable summary of what happened */
  summary: string
  /** Error message if iteration failed */
  error?: string
}

// =============================================================================
// State Interfaces
// =============================================================================

/**
 * Full state of a TaskController instance.
 */
export interface TaskControllerState {
  /** Current controller status */
  status: TaskControllerStatus
  /** Associated feature ID */
  featureId: string
  /** Associated task ID */
  taskId: string
  /** Path to task worktree (null if not yet created) */
  worktreePath: string | null
  /** Active session ID for this loop (null if not yet created) */
  sessionId: string | null
  /** Current iteration number (1-based) */
  currentIteration: number
  /** Maximum iterations allowed (safety backstop) */
  maxIterations: number
  /** Results from each completed iteration */
  iterationResults: IterationResult[]
  /** ISO timestamp when controller started (null if not started) */
  startedAt: string | null
  /** ISO timestamp when controller completed (null if not completed) */
  completedAt: string | null
  /** Reason for loop exit (null if still running) */
  exitReason: LoopExitReason | null
  /** Error message if failed (null if no error) */
  error: string | null
  /** Cumulative token usage across all iterations */
  cumulativeTokens: CumulativeTokenUsage
}

// =============================================================================
// Configuration Interface
// =============================================================================

/**
 * Configuration options for TaskController.
 */
export interface TaskControllerConfig {
  /** Maximum number of iterations before giving up (safety backstop, default: 50) */
  maxIterations: number
  /** Run build verification after each iteration (default: true) */
  runBuild: boolean
  /** Run lint verification after each iteration (default: true) */
  runLint: boolean
  /** Run tests verification after each iteration (default: false) */
  runTests: boolean
  /** Continue execution if lint fails (default: true) */
  continueOnLintFail: boolean
  /** Abort immediately if DevAgent fails (default: false) */
  abortOnDevAgentFail: boolean
  /** Enable context-aware checkpointing based on token usage (default: true) */
  useContextCheckpointing: boolean
  /** Token limit for context-aware checkpointing (default: 150000) */
  contextTokenLimit: number
  /** Manager worktree path - if provided, use instead of creating task worktree */
  managerWorktreePath?: string
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default TaskController configuration with sensible defaults.
 */
export const DEFAULT_TASK_CONTROLLER_CONFIG: TaskControllerConfig = {
  maxIterations: 50, // Safety backstop - context checkpointing should trigger first
  runBuild: true,
  runLint: true,
  runTests: false,
  continueOnLintFail: true,
  abortOnDevAgentFail: false,
  useContextCheckpointing: true,
  contextTokenLimit: 150000 // ~150k tokens soft limit for checkpointing
}
