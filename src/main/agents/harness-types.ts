import type { Task, DAGGraph } from '@shared/types'

export type HarnessStatus = 'idle' | 'active' | 'paused' | 'stopped'

export interface HarnessState {
  status: HarnessStatus
  featureId: string | null
  featureGoal: string | null
  claudeMd: string | null
  graph: DAGGraph | null
  activeTasks: Map<string, TaskExecutionState>
  pendingIntentions: Map<string, PendingIntention>
  messageHistory: HarnessMessage[]
  startedAt: string | null
  stoppedAt: string | null
  projectRoot: string | null
}

export interface TaskExecutionState {
  taskId: string
  agentId: string
  status: 'assigned' | 'intention_pending' | 'approved' | 'working' | 'merging'
  intention?: string
  approvalNotes?: string
  startedAt: string
}

export interface PendingIntention {
  agentId: string
  taskId: string
  intention: string
  files?: string[]
  receivedAt: string
}

export interface HarnessMessage {
  type:
    | 'intention_received'
    | 'approval_sent'
    | 'rejection_sent'
    | 'task_started'
    | 'task_completed'
    | 'task_failed'
    | 'info'
    | 'warning'
    | 'error'
  taskId?: string
  agentId?: string
  content: string
  timestamp: string
}

export interface IntentionReviewContext {
  intention: PendingIntention
  task: Task
  graph: DAGGraph
  claudeMd: string | null
  featureGoal: string | null
  otherActiveTasks: TaskExecutionState[]
  completedTasks: Task[]
}

export interface IntentionDecision {
  approved: boolean
  type: 'approved' | 'approved_with_notes' | 'modified' | 'rejected'
  notes?: string
  modifications?: string
  reason?: string
}

export const DEFAULT_HARNESS_STATE: Omit<
  HarnessState,
  'activeTasks' | 'pendingIntentions' | 'messageHistory'
> = {
  status: 'idle',
  featureId: null,
  featureGoal: null,
  claudeMd: null,
  graph: null,
  startedAt: null,
  stoppedAt: null,
  projectRoot: null
}
