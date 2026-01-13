/**
 * Task agent types for DAGent.
 * Defines state, context, and configuration for task agents.
 * Task agents implement individual tasks in isolated worktrees
 * with harness oversight via intention-approval workflow.
 */

import type { Task } from '@shared/types'
import type { IntentionDecision } from './harness-types'

export type TaskAgentStatus =
  | 'initializing'
  | 'loading_context'
  | 'proposing_intention'
  | 'awaiting_approval'
  | 'approved'
  | 'working'
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
