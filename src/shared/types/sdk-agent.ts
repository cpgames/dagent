// src/shared/types/sdk-agent.ts
// Agent SDK types for renderer access

/**
 * Message types from SDK
 */
export type AgentMessageType =
  | 'assistant' // AI text response
  | 'user' // User input
  | 'result' // Tool result
  | 'system' // System message

/**
 * A message in the agent conversation
 */
export interface AgentMessage {
  type: AgentMessageType
  content: string
  timestamp: string
  toolName?: string // For tool_use messages
  toolInput?: unknown
  toolResult?: string // Result from tool execution
}

/**
 * Options for starting an agent query
 */
export interface AgentQueryOptions {
  prompt: string
  systemPrompt?: string
  allowedTools?: string[]
  toolPreset?: 'featureChat' | 'taskAgent' | 'harnessAgent' | 'mergeAgent' | 'none'
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  cwd?: string // Working directory for file operations
}

/**
 * Events streamed from an agent query
 */
export interface AgentStreamEvent {
  type: 'message' | 'tool_use' | 'tool_result' | 'done' | 'error'
  message?: AgentMessage
  error?: string
}
