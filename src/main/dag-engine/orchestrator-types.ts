import type { Task, DAGGraph, TaskStatus } from '@shared/types'
import type { TaskStateChange } from './task-controller'

export type ExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

export interface ExecutionState {
  status: ExecutionStatus
  featureId: string | null
  graph: DAGGraph | null
  startedAt: string | null
  stoppedAt: string | null
  error: string | null
}

export interface ExecutionConfig {
  maxConcurrentTasks: number // Max tasks running simultaneously
  maxConcurrentMerges: number // Max merge operations simultaneously
}

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  maxConcurrentTasks: 3,
  maxConcurrentMerges: 1
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
