// src/main/agent/types.ts

// Message types from SDK
export type AgentMessageType =
  | 'assistant' // AI text response
  | 'user' // User input
  | 'result' // Tool result
  | 'system' // System message

export interface AgentMessage {
  type: AgentMessageType
  content: string
  timestamp: string
  toolName?: string // For result messages
  toolInput?: unknown
  toolResult?: string // Result from tool execution
}

export interface AgentQueryOptions {
  prompt: string
  systemPrompt?: string
  allowedTools?: string[]
  toolPreset?: 'featureChat' | 'taskAgent' | 'harnessAgent' | 'mergeAgent' | 'pmAgent' | 'none'
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  cwd?: string // Working directory for file operations
  // Context options for autoContext
  featureId?: string
  taskId?: string
  agentType?: 'pm' | 'harness' | 'task' | 'merge'
  autoContext?: boolean // If true, auto-build context prompt using buildAgentPrompt()
}

export interface AgentStreamEvent {
  type: 'message' | 'tool_use' | 'tool_result' | 'done' | 'error'
  message?: AgentMessage
  error?: string
}
