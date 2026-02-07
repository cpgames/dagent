/**
 * Session & Memory Architecture - Type Definitions
 *
 * This file defines the core types for the unified session management system
 * that works across all agent types (PM, Dev, QA, Harness, Merge).
 */

/**
 * Agent types supported by the session system.
 * Note: 'feature' is for Feature MCP tool sessions (not a real agent, but sessions track chat history)
 */
export type AgentType = 'feature' | 'dev' | 'qa' | 'harness' | 'merge' | 'project'

/**
 * Session types based on what context they're attached to.
 */
export type SessionType = 'feature' | 'task'

/**
 * Task execution states that can have separate sessions.
 * Simplified to match the task-centric workflow.
 */
export type TaskState =
  | 'planning'
  | 'in_dev'
  | 'dev_complete'
  | 'in_qa'
  | 'qa_complete'

/**
 * Verification result summary for message metadata.
 */
export interface VerificationResultSummary {
  checkId: string
  passed: boolean
  error?: string
}

/**
 * Individual chat message in a session.
 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  metadata?: {
    agentType?: AgentType
    agentId?: string  // Agent instance ID for tracking (DevAgent)
    taskId?: string   // Task ID for context (DevAgent)
    iteration?: number
    iterationNumber?: number  // Alias for iteration (used by TaskController)
    toolUse?: {
      name: string
      input?: unknown
      result?: unknown
    }
    toolUses?: Array<{
      name: string
      input?: unknown
      result?: unknown
    }>
    tokens?: {
      input: number
      output: number
    }
    internal?: boolean  // Don't show in user-facing UI
    verificationResults?: VerificationResultSummary[]  // Results from Ralph Loop iteration
    // Migration metadata
    migratedFrom?: string
    originalTimestamp?: string
    originalType?: string
  }
}

/**
 * Chat session containing recent messages.
 * This file stores only the last N messages (0 to any number).
 * Older messages are compressed into checkpoint.
 */
export interface ChatSession {
  messages: ChatMessage[]
  totalMessages: number  // Total count including compacted ones
  oldestMessageTimestamp?: string  // Timestamp of oldest message in this file
  newestMessageTimestamp?: string  // Timestamp of newest message
}

/**
 * Memory data representing compressed conversation history.
 * This is the AI's "memory" of past conversation, regenerated on each compaction.
 * Uses importance-based prioritization rather than task-based categorization.
 */
export interface Memory {
  version: number  // Memory version for tracking updates
  createdAt: string
  updatedAt: string

  // Importance-based summary of conversation context
  // Prioritized items that capture the essence of the conversation
  summary: {
    critical: string[]   // CRITICAL - Core purpose, essential requirements (never drop)
    important: string[]  // IMPORTANT - Key requirements, significant details
    minor: string[]      // MINOR - Nice-to-haves, can be dropped if over token limit
  }

  // Metadata about compaction
  compactionInfo: {
    messagesCompacted: number
    oldestMessageTimestamp: string
    newestMessageTimestamp: string
    compactedAt: string
  }

  // Statistics
  stats: {
    totalCompactions: number
    totalMessages: number
    totalTokens: number
  }
}

/**
 * Session context containing relevant project/feature/task information.
 * This is rebuilt dynamically each time a request is made.
 */
export interface SessionContext {
  projectRoot: string

  // Feature context
  featureId: string
  featureName: string
  featureGoal?: string

  // Task context (optional, for task sessions)
  taskId?: string
  taskTitle?: string
  taskState?: TaskState

  // DAG context
  dagSummary?: string
  dependencies?: string[]
  dependents?: string[]

  // Project files context
  projectStructure?: string
  claudeMd?: string
  projectMd?: string

  // Git context
  recentCommits?: string[]

  // Attachments
  attachments?: string[]
}

/**
 * Agent description containing the system prompt for an agent type.
 * This is static and doesn't change during a session.
 */
export interface AgentDescription {
  agentType: AgentType
  roleInstructions: string
  toolInstructions?: string
  createdAt: string
}

/**
 * Complete session metadata and configuration.
 */
export interface Session {
  id: string  // Format: "{sessionType}-{featureId}-{taskId?}-{state?}"
  type: SessionType
  agentType: AgentType

  // Context references
  featureId: string
  taskId?: string
  taskState?: TaskState

  // Lifecycle
  createdAt: string
  updatedAt: string
  status: 'active' | 'archived'

  // File references (relative paths from session directory)
  files: {
    chat: string  // chat_<sessionId>.json
    memory: string  // memory_<sessionId>.json
    context: string  // context_<sessionId>.json
    agentDescription: string  // agent-description_<sessionId>.json
  }

  // Statistics
  stats: {
    totalMessages: number
    totalTokens: number
    totalCompactions: number
    lastRequestTokens?: number
    lastCompactionAt?: string
  }

  // PM Agent planning metadata (only for PM agent sessions)
  pmMetadata?: {
    complexity?: 'low' | 'medium' | 'high'
    questionsAsked?: number
    questionsRequired?: number
    assessedAt?: string
  }
}

/**
 * Token estimation result for a request.
 */
export interface TokenEstimate {
  systemPrompt: number
  messages: number
  userPrompt: number
  total: number
  limit: number  // 100k tokens
  needsCompaction: boolean
}

/**
 * Complete agent request ready to send to Claude.
 */
export interface AgentRequest {
  systemPrompt: string  // Agent Description + Context + Memory + Messages
  userPrompt: string  // Latest user message
  messages?: ChatMessage[]  // For Messages API format
  tokenEstimate: TokenEstimate
  sessionId: string
}

/**
 * Result of a compaction operation.
 */
export interface CompactionResult {
  success: boolean
  newMemory: Memory
  messagesCompacted: number
  tokensReclaimed: number
  error?: string
}

/**
 * Session creation options.
 */
export interface CreateSessionOptions {
  type: SessionType
  agentType: AgentType
  featureId: string
  taskId?: string
  taskState?: TaskState
}

/**
 * Session update event data.
 */
export interface SessionUpdateEvent {
  sessionId: string
  featureId: string
  taskId?: string
  action: 'ready' | 'message_added' | 'compacted' | 'archived'
  timestamp: string
}
