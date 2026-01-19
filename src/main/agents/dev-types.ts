/**
 * Dev agent types for DAGent.
 * Defines state, context, and configuration for dev agents.
 * Dev agents implement individual tasks in isolated worktrees
 * with harness oversight via intention-approval workflow.
 *
 * State Mapping (DevAgentStatus → TaskStatus):
 * - DevAgentStatus is internal to the agent lifecycle
 * - TaskStatus is the DAG node status visible in the UI
 *
 * When DevAgentStatus is:
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
import type { FeatureSpec } from './feature-spec-types'

/**
 * Internal dev agent status for tracking agent lifecycle.
 * See module comment for mapping to TaskStatus.
 */
export type DevAgentStatus =
  | 'initializing'
  | 'loading_context'
  | 'proposing_intention'
  | 'awaiting_approval'
  | 'approved'
  | 'working'
  | 'ready_for_merge' // SDK done, commit done, waiting for QA review
  | 'completed'
  | 'failed'

export interface DevAgentState {
  status: DevAgentStatus
  agentId: string | null
  featureId: string
  taskId: string
  sessionId: string | null // Active session for this agent
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

  /** Feature specification for broader context (optional) */
  featureSpec?: FeatureSpec | null

  // Task-specific context
  taskDescription: string
  taskTitle: string

  // Dependency context (from completed parent tasks)
  dependencyContext: DependencyContextEntry[]

  // Other tasks in the workflow (for scope awareness)
  otherTasks?: OtherTaskInfo[]

  // Feature attachments (images, files, etc.)
  // These are available in .dagent/attachments/ and should be copied into appropriate project folders
  attachments?: string[]

  // QA feedback (if reworking after QA failure)
  qaFeedback?: string

  // Working directory
  worktreePath: string
}

export interface OtherTaskInfo {
  title: string
  description: string
  status: string
}

export interface DependencyContextEntry {
  taskId: string
  taskTitle: string
  summary: string // What was implemented
  keyFiles?: string[] // Important files created/modified
  exports?: string[] // Public interfaces/exports
}

export interface DevAgentConfig {
  autoPropose: boolean // Auto-generate intention (default: true)
  autoExecute: boolean // Auto-execute after approval (default: true)
  iterationMode: boolean // Iteration mode for Ralph Loop (default: false)
  iterationPrompt: string | undefined // Prompt for iteration mode
  existingWorktreePath: string | undefined // Use existing worktree instead of creating new one
  sessionId?: string // Session ID for logging (set by TaskController)
}

/** Token usage for an iteration */
export interface IterationTokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface TaskExecutionResult {
  success: boolean
  taskId: string
  filesModified?: string[]
  summary?: string
  error?: string
  commitHash?: string
  filesChanged?: number
  /** Token usage for this execution/iteration */
  tokenUsage?: IterationTokenUsage
}

export interface TaskProgressEvent {
  type: 'progress' | 'tool_use' | 'tool_result'
  content: string
  toolName?: string
  toolInput?: unknown
  toolResult?: string
}

export const DEFAULT_DEV_AGENT_CONFIG: DevAgentConfig = {
  autoPropose: true,
  autoExecute: true,
  iterationMode: false,
  iterationPrompt: undefined,
  existingWorktreePath: undefined
}

export const DEFAULT_DEV_AGENT_STATE: Omit<DevAgentState, 'featureId' | 'taskId'> = {
  status: 'initializing',
  agentId: null,
  sessionId: null,
  task: null,
  context: null,
  intention: null,
  approval: null,
  worktreePath: null,
  error: null,
  startedAt: null,
  completedAt: null
}
