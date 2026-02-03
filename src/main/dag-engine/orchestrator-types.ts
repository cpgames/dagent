import type { Task, DAGGraph, TaskStatus } from '@shared/types'
import type { WorktreeId } from '@shared/types/feature'
import type { TaskStateChange } from './task-controller'
import type { LoopExitReason } from './task-controller-types'

export type ExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

/**
 * Loop status for a task being executed by TaskController.
 * Exposed via IPC for UI to display iteration progress.
 */
export interface TaskLoopStatus {
  taskId: string
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted'
  currentIteration: number
  maxIterations: number
  worktreePath: string | null
  checklistSnapshot: Record<string, 'pending' | 'pass' | 'fail' | 'skipped'>
  exitReason: LoopExitReason | null
  error: string | null
}

export interface ExecutionState {
  status: ExecutionStatus
  featureId: string | null
  graph: DAGGraph | null
  startedAt: string | null
  stoppedAt: string | null
  error: string | null
  // Worktree execution fields
  worktreeId: WorktreeId | null
  worktreePath: string | null
}

export interface ExecutionConfig {
  maxConcurrentTasks: number // Max tasks running simultaneously
  maxConcurrentMerges: number // Max merge operations simultaneously
  // Ralph Loop settings
  maxIterations: number // Max iterations per task before failure
  runBuild: boolean // Run build check after each iteration
  runLint: boolean // Run lint check after each iteration
  runTests: boolean // Run tests after each iteration
  continueOnLintFail: boolean // Continue iterations even if lint fails
}

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  maxConcurrentTasks: 1, // Sequential execution in pool architecture
  maxConcurrentMerges: 1,
  // Ralph Loop defaults
  maxIterations: 10,
  runBuild: true,
  runLint: true,
  runTests: false,
  continueOnLintFail: true
}

export interface TaskAssignment {
  taskId: string
  assignedAt: string
  agentId?: string // Will be populated when agents are implemented
}

export interface ExecutionEvent {
  type:
    | 'started'
    | 'paused'
    | 'resumed'
    | 'stopped'
    | 'completed'
    | 'tick'
    | 'task_started'
    | 'task_completed'
    | 'task_finished'
    | 'task_failed'
    | 'agent_assigned'
    | 'qa_passed'
    | 'qa_failed'
    | 'error'
  timestamp: string
  data?: {
    taskId?: string
    previousStatus?: TaskStatus
    newStatus?: TaskStatus
    error?: string
    availableCount?: number
    canAssign?: number
    agentId?: string
    feedback?: string // QA feedback when qa_failed
  }
}

export interface ExecutionSnapshot {
  state: ExecutionState
  assignments: TaskAssignment[]
  history: TaskStateChange[]
  events: ExecutionEvent[]
}

export interface NextTasksResult {
  ready: Task[]
  available: Task[] // Ready tasks not yet assigned
  canAssign: number // How many more tasks can be assigned
}
