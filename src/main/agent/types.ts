// src/main/agent/types.ts

import type { RequestPriority } from './request-types'

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

/** Hook matcher configuration for SDK hooks */
export interface HookMatcher {
  matcher?: string
  hooks: Array<(input: unknown, toolUseId: string | null, context: { signal?: AbortSignal }) => Promise<unknown>>
  timeout?: number
}

/** Hooks configuration for agent queries */
export interface AgentHooks {
  PreToolUse?: HookMatcher[]
  PostToolUse?: HookMatcher[]
  Stop?: HookMatcher[]
  SubagentStop?: HookMatcher[]
}

export interface AgentQueryOptions {
  prompt: string
  systemPrompt?: string
  allowedTools?: string[]
  toolPreset?: 'featureChat' | 'taskAgent' | 'harnessAgent' | 'mergeAgent' | 'qaAgent' | 'pmAgent' | 'investigationAgent' | 'planningAgent' | 'none'
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  cwd?: string // Working directory for file operations
  hooks?: AgentHooks // SDK hooks for intercepting tool calls
  maxTurns?: number // Maximum number of agentic turns before stopping (default: unlimited)
  // Context options for autoContext
  featureId?: string
  taskId?: string
  agentType?: 'pm' | 'investigation' | 'planning' | 'harness' | 'task' | 'merge' | 'qa'
  autoContext?: boolean // If true, auto-build context prompt using buildAgentPrompt()
  // Request priority options for RequestManager
  priority?: RequestPriority // Priority level (defaults to DEV if not specified)
  agentId?: string // Agent identifier (e.g., 'pm', 'dev-task1', 'qa-task2' - defaults to agentType if not specified)
}

/** Token usage data from SDK messages */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface AgentStreamEvent {
  type: 'message' | 'tool_use' | 'tool_result' | 'done' | 'error'
  message?: AgentMessage
  error?: string
  /** Token usage from this event (populated from SDK usage data) */
  usage?: TokenUsage
}
