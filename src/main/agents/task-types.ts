/**
 * Task agent types for DAGent.
 * Defines state, context, and configuration for task agents.
 * Task agents implement individual tasks in isolated worktrees
 * with harness oversight via intention-approval workflow.
 *
 * State Mapping (TaskAgentStatus → TaskStatus):
 * - TaskAgentStatus is internal to the agent lifecycle
 * - TaskStatus is the DAG node status visible in the UI
 *
 * When TaskAgentStatus is:
 *   initializing → Task.status = 'dev'
 *   loading_context → Task.status = 'dev'
 *   proposing_intention → Task.status = 'dev'
 *   awaiting_approval → Task.status = 'dev'
 *   approved → Task.status = 'dev'
 *   working → Task.status = 'dev'
 *   ready_for_merge → Task.status = 'qa' (after DEV_COMPLETE event)
 *   completed → Task.status = 'completed' (after merge)
 *   failed → Task.status = 'failed' (or back to 'dev' for rework)
 */

import type { Task } from '@shared/types'
import type { IntentionDecision } from './harness-types'

/**
 * Internal task agent status for tracking agent lifecycle.
 * See module comment for mapping to TaskStatus.
 */
export type TaskAgentStatus =
  | 'initializing'
  | 'loading_context'
  | 'proposing_intention'
  | 'awaiting_approval'
  | 'approved'
  | 'working'
  | 'ready_for_merge' // SDK done, commit done, waiting for QA review
  | 'completed'
  | 'failed'

export interface TaskAgentState {
  status: TaskAgentStatus
  agentId: string | null
  featureId: string
  taskId: string
  task: Task | null
  context: TaskContext | null
  intention: string | null
  approval: IntentionDecision | null
  worktreePath: string | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface TaskContext {
  // Project-level context
  claudeMd: string | null
  featureGoal: string | null

  // Task-specific context
  taskDescription: string
  taskTitle: string

  // Dependency context (from completed parent tasks)
  dependencyContext: DependencyContextEntry[]

  // Working directory
  worktreePath: string
}

export interface DependencyContextEntry {
  taskId: string
  taskTitle: string
  summary: string // What was implemented
  keyFiles?: string[] // Important files created/modified
  exports?: string[] // Public interfaces/exports
}

export interface TaskAgentConfig {
  autoPropose: boolean // Auto-generate intention (default: true)
  autoExecute: boolean // Auto-execute after approval (default: true)
}

export interface TaskExecutionResult {
  success: boolean
  taskId: string
  filesModified?: string[]
  summary?: string
  error?: string
  commitHash?: string
  filesChanged?: number
}

export interface TaskProgressEvent {
  type: 'progress' | 'tool_use' | 'tool_result'
  content: string
  toolName?: string
  toolInput?: unknown
  toolResult?: string
}

export const DEFAULT_TASK_AGENT_CONFIG: TaskAgentConfig = {
  autoPropose: true,
  autoExecute: true
}

export const DEFAULT_TASK_AGENT_STATE: Omit<TaskAgentState, 'featureId' | 'taskId'> = {
  status: 'initializing',
  agentId: null,
  task: null,
  context: null,
  intention: null,
  approval: null,
  worktreePath: null,
  error: null,
  startedAt: null,
  completedAt: null
}
