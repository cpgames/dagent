/**
 * Inter-Agent Message Types for Task-Harness Communication
 *
 * These types define the message-based communication protocol between
 * TaskAgent and HarnessAgent, replacing direct method calls.
 *
 * Note: Named "InterAgent" to avoid collision with AgentMessage in sdk-agent.ts
 */

// Message type union for all inter-agent communication scenarios
export type InterAgentMessageType =
  | 'task_registered' // Task agent registered with harness
  | 'intention_proposed' // Task agent proposes intention
  | 'intention_approved' // Harness approves intention
  | 'intention_rejected' // Harness rejects intention
  | 'task_working' // Task agent started work
  | 'task_ready_for_merge' // Task execution done, commit done, ready for merge
  | 'task_completed' // Task agent completed (after merge)
  | 'task_failed' // Task agent failed

// Agent identifier with type and ID
export interface AgentIdentifier {
  type: 'harness' | 'task'
  id: string
}

// Base message interface for all inter-agent messages
export interface InterAgentMessage {
  id: string // UUID for tracking
  type: InterAgentMessageType
  from: AgentIdentifier
  to: AgentIdentifier
  taskId: string // Always present for routing
  payload: unknown // Type-specific data
  timestamp: string // ISO timestamp
}

// Type-specific payload interfaces

export interface TaskRegisteredPayload {
  taskId: string
}

export interface IntentionProposedPayload {
  intention: string
  files?: string[]
}

export interface IntentionApprovedPayload {
  type: 'approved' | 'approved_with_notes'
  notes?: string
}

export interface IntentionRejectedPayload {
  reason: string
}

export interface TaskWorkingPayload {
  startedAt: string
}

export interface TaskCompletedPayload {
  summary?: string
  commitHash?: string
}

export interface TaskFailedPayload {
  error: string
}

// Type guard helpers for payload types
export function isIntentionProposedPayload(payload: unknown): payload is IntentionProposedPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'intention' in payload &&
    typeof (payload as IntentionProposedPayload).intention === 'string'
  )
}

export function isIntentionApprovedPayload(payload: unknown): payload is IntentionApprovedPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'type' in payload &&
    ((payload as IntentionApprovedPayload).type === 'approved' ||
      (payload as IntentionApprovedPayload).type === 'approved_with_notes')
  )
}

export function isIntentionRejectedPayload(payload: unknown): payload is IntentionRejectedPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'reason' in payload &&
    typeof (payload as IntentionRejectedPayload).reason === 'string'
  )
}

export function isTaskCompletedPayload(payload: unknown): payload is TaskCompletedPayload {
  return typeof payload === 'object' && payload !== null
}

export function isTaskFailedPayload(payload: unknown): payload is TaskFailedPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof (payload as TaskFailedPayload).error === 'string'
  )
}
