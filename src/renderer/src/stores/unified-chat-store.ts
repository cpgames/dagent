/**
 * Unified Chat Store
 *
 * A generic Zustand store for managing chat state across all agent types.
 * Supports multiple concurrent sessions with independent state.
 */

import { create } from 'zustand'
import { toast } from './toast-store'
import type { ChatMessage } from '@shared/types/session'

/**
 * Chat type determines agent behavior and tools.
 * Maps to session AgentType for storage.
 * Note: 'task' should be passed as 'dev' - the backend handles mapping.
 */
export type ChatType = 'feature' | 'project' | 'dev' | 'qa' | 'merge' | 'harness'

/**
 * Project inspection result (used by project chat).
 * This is a specific context type - other chat types may have different context.
 */
export interface ProjectInspection {
  type: 'empty' | 'brownfield'
  hasClaudeMd: boolean
  techStack?: {
    languages: string[]
    frameworks: string[]
    buildTools: string[]
    configFiles: string[]
  }
  structure?: {
    srcDirs: string[]
    hasTests: boolean
    hasDocs: boolean
    fileCount: number
  }
}

/**
 * Active tool use display state.
 */
export interface ActiveToolUse {
  name: string
  input?: unknown
  result?: string
}

/**
 * Memory summary from context compaction.
 * Uses importance-based prioritization.
 */
export interface MemorySummary {
  critical: string[]   // CRITICAL - Core purpose, essential requirements
  important: string[]  // IMPORTANT - Key requirements, significant details
  minor: string[]      // MINOR - Nice-to-haves, can be dropped if over token limit
}

/**
 * Memory data from context compaction.
 */
export interface Memory {
  version: number
  createdAt: string
  updatedAt: string
  summary: MemorySummary
  compactionInfo: {
    messagesCompacted: number
    oldestMessageTimestamp: string
    newestMessageTimestamp: string
    compactedAt: string
  }
  stats: {
    totalCompactions: number
    totalMessages: number
    totalTokens: number
  }
}

/**
 * Per-session state.
 */
export interface ChatSessionState {
  sessionId: string
  chatType: ChatType
  projectRoot: string
  featureId?: string
  messages: ChatMessage[]
  isLoading: boolean
  isResponding: boolean
  isCompacting: boolean
  streamingContent: string
  activeToolUse: ActiveToolUse | null
  pendingToolUses: Array<{ name: string; input?: unknown; result?: unknown }> // Accumulates during streaming
  textSegments: string[] // Text blocks before tool uses (saved on tool_use)
  context: unknown // Generic context (e.g., ProjectInspection for project chat)
  memory: Memory | null
  initialized: boolean
  error: string | null
}

/**
 * Global unified chat state.
 */
interface UnifiedChatState {
  // Session states keyed by sessionId
  sessions: Map<string, ChatSessionState>

  // Actions
  initializeSession: (
    sessionId: string,
    chatType: ChatType,
    projectRoot: string,
    featureId?: string
  ) => Promise<void>
  sendMessage: (sessionId: string, content: string) => Promise<void>
  abort: (sessionId: string) => void
  reset: (sessionId: string) => Promise<void>
  clearError: (sessionId: string) => void
  compact: (sessionId: string) => Promise<void>
  getMemory: (sessionId: string) => Promise<Memory | null>

  // Get session state (creates empty state if not exists)
  getSession: (sessionId: string) => ChatSessionState | undefined
}

/**
 * Create default session state.
 */
function createDefaultSession(
  sessionId: string,
  chatType: ChatType,
  projectRoot: string,
  featureId?: string
): ChatSessionState {
  return {
    sessionId,
    chatType,
    projectRoot,
    featureId,
    messages: [],
    isLoading: false,
    isResponding: false,
    isCompacting: false,
    streamingContent: '',
    activeToolUse: null,
    pendingToolUses: [],
    textSegments: [],
    context: null,
    memory: null,
    initialized: false,
    error: null
  }
}

/**
 * Persist a message to the backend.
 * Fire-and-forget - doesn't block state updates.
 */
function persistMessage(sessionId: string, message: ChatMessage): void {
  window.electronAPI?.unifiedChat?.addMessage(sessionId, message).catch((error) => {
    console.error('[UnifiedChatStore] Failed to persist message:', error)
  })
}

/**
 * Unified chat store.
 */
export const useUnifiedChatStore = create<UnifiedChatState>((set, get) => {
  // Set up event listeners once
  if (typeof window !== 'undefined' && window.electronAPI?.unifiedChat) {
    // Stream events
    window.electronAPI.unifiedChat.onStream((data) => {
      const { sessionId, event } = data

      set((state) => {
        const session = state.sessions.get(sessionId)
        if (!session) return state

        const newSessions = new Map(state.sessions)
        const newSession = { ...session }

        if (event.type === 'message_start') {
          // Agent started generating a response
          // Save any previous message (with its tool uses) before starting new one
          const allContent = [...newSession.textSegments, newSession.streamingContent]
            .filter(Boolean)
            .join('\n\n')
          if (allContent || newSession.pendingToolUses.length > 0) {
            const assistantMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: allContent,
              timestamp: new Date().toISOString(),
              metadata: {
                agentType: newSession.chatType,
                ...(newSession.pendingToolUses.length > 0 && {
                  toolUses: [...newSession.pendingToolUses]
                })
              }
            }
            newSession.messages = [...newSession.messages, assistantMessage]
            // Persist to backend
            persistMessage(sessionId, assistantMessage)
          }
          newSession.isResponding = true
          newSession.streamingContent = ''
          newSession.pendingToolUses = []
          newSession.textSegments = []
          newSession.activeToolUse = null
        } else if (event.type === 'message' && event.message) {
          // Filter out system messages
          if (event.message.type === 'system') {
            return state
          }
          // Check if we're receiving text AFTER tool calls completed
          // This is a natural message boundary - save previous text + tools as a message
          if (newSession.pendingToolUses.length > 0 && newSession.textSegments.length > 0) {
            const prevText = newSession.textSegments[newSession.textSegments.length - 1]
            if (prevText) {
              const assistantMessage: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: prevText,
                timestamp: new Date().toISOString(),
                metadata: {
                  agentType: newSession.chatType,
                  toolUses: [...newSession.pendingToolUses]
                }
              }
              newSession.messages = [...newSession.messages, assistantMessage]
              // Persist to backend
              persistMessage(sessionId, assistantMessage)
            }
            // Clear the saved segment and tools - they're now a message
            newSession.textSegments = newSession.textSegments.slice(0, -1)
            newSession.pendingToolUses = []
          }
          // SDK sends accumulated text within current text block
          newSession.streamingContent = event.message.content
          // Clear active tool display when we get new text content
          newSession.activeToolUse = null
        } else if (event.type === 'tool_use' && event.message) {
          // Save current text block before tool use
          if (newSession.streamingContent) {
            newSession.textSegments = [...newSession.textSegments, newSession.streamingContent]
            newSession.streamingContent = ''
          }
          // Add tool to pending array immediately (handles parallel tool calls correctly)
          newSession.pendingToolUses = [
            ...newSession.pendingToolUses,
            {
              name: event.message.toolName!,
              input: event.message.toolInput
            }
          ]
          // Show active tool for live display
          newSession.activeToolUse = {
            name: event.message.toolName!,
            input: event.message.toolInput
          }
        } else if (event.type === 'tool_result' && event.message) {
          // Update active tool with result for display
          // Note: tool was already added to pendingToolUses on tool_use event
          if (newSession.activeToolUse) {
            newSession.activeToolUse = {
              ...newSession.activeToolUse,
              result: event.message.toolResult
            }
          }
        } else if (event.type === 'done') {
          // Finalize response - save any remaining content
          // With tool-based splitting, textSegments should be empty by now
          // but handle edge cases where text is in segments without following tools
          const remainingSegments = newSession.textSegments.join('\n\n')
          const finalContent = [remainingSegments, newSession.streamingContent]
            .filter(Boolean)
            .join('\n\n')
          if (finalContent || newSession.pendingToolUses.length > 0) {
            const assistantMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: finalContent,
              timestamp: new Date().toISOString(),
              metadata: {
                agentType: newSession.chatType,
                ...(newSession.pendingToolUses.length > 0 && {
                  toolUses: [...newSession.pendingToolUses]
                })
              }
            }
            newSession.messages = [...newSession.messages, assistantMessage]
            // Persist to backend
            persistMessage(sessionId, assistantMessage)
          }
          newSession.isResponding = false
          newSession.streamingContent = ''
          newSession.pendingToolUses = []
          newSession.textSegments = []
          newSession.activeToolUse = null
        } else if (event.type === 'error') {
          newSession.isResponding = false
          newSession.streamingContent = ''
          newSession.pendingToolUses = []
          newSession.textSegments = []
          newSession.activeToolUse = null
          newSession.error = event.error || 'Unknown error'
          toast.error(event.error || 'Chat error')
        }

        newSessions.set(sessionId, newSession)
        return { sessions: newSessions }
      })
    })

    // Compaction start event
    window.electronAPI.unifiedChat.onCompactionStart((data) => {
      const { sessionId } = data
      set((state) => {
        const session = state.sessions.get(sessionId)
        if (!session) return state

        const newSessions = new Map(state.sessions)
        newSessions.set(sessionId, {
          ...session,
          isCompacting: true
        })
        return { sessions: newSessions }
      })
    })

    // Compaction complete event
    window.electronAPI.unifiedChat.onCompactionComplete((data) => {
      const { sessionId, messagesCompacted } = data
      set((state) => {
        const session = state.sessions.get(sessionId)
        if (!session) return state

        const newSessions = new Map(state.sessions)
        newSessions.set(sessionId, {
          ...session,
          isCompacting: false,
          messages: [] // Clear messages after compaction
        })
        return { sessions: newSessions }
      })
      toast.success(`Compacted ${messagesCompacted} messages`)
    })

    // Compaction error event
    window.electronAPI.unifiedChat.onCompactionError((data) => {
      const { sessionId, error } = data
      set((state) => {
        const session = state.sessions.get(sessionId)
        if (!session) return state

        const newSessions = new Map(state.sessions)
        newSessions.set(sessionId, {
          ...session,
          isCompacting: false,
          error
        })
        return { sessions: newSessions }
      })
      toast.error(`Compaction failed: ${error}`)
    })
  }

  return {
    sessions: new Map(),

    getSession: (sessionId: string) => {
      return get().sessions.get(sessionId)
    },

    initializeSession: async (
      sessionId: string,
      chatType: ChatType,
      projectRoot: string,
      featureId?: string
    ) => {
      // Check if already initialized
      const existing = get().sessions.get(sessionId)
      if (existing?.initialized) {
        return
      }

      // Set loading state - this creates the session BEFORE the async IPC call
      set((state) => {
        const newSessions = new Map(state.sessions)
        newSessions.set(sessionId, {
          ...createDefaultSession(sessionId, chatType, projectRoot, featureId),
          isLoading: true
        })
        return { sessions: newSessions }
      })

      try {
        const result = await window.electronAPI.unifiedChat.initialize(
          sessionId,
          chatType,
          projectRoot,
          featureId
        )

        if (!result.success) {
          set((state) => {
            const newSessions = new Map(state.sessions)
            const session = newSessions.get(sessionId)
            if (session) {
              newSessions.set(sessionId, {
                ...session,
                error: result.error || 'Initialization failed',
                isLoading: false
              })
            }
            return { sessions: newSessions }
          })
          toast.error(result.error || 'Failed to initialize chat')
          return
        }

        // Build initial messages, ensuring metadata is set for assistant messages
        const messages: ChatMessage[] = (result.messages || []).map((msg) => {
          if (msg.role === 'assistant' && !msg.metadata?.agentType) {
            return {
              ...msg,
              metadata: {
                ...msg.metadata,
                agentType: chatType
              }
            }
          }
          return msg
        })

        // Add greeting as first message if provided and no messages exist
        if (result.greeting && messages.length === 0) {
          messages.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: result.greeting,
            timestamp: new Date().toISOString(),
            metadata: {
              agentType: chatType
            }
          })
        }

        set((state) => {
          const newSessions = new Map(state.sessions)
          newSessions.set(sessionId, {
            sessionId,
            chatType,
            projectRoot,
            featureId,
            messages,
            isLoading: false,
            isResponding: false,
            isCompacting: false,
            streamingContent: '',
            activeToolUse: null,
            pendingToolUses: [],
            textSegments: [],
            context: result.context || null,
            memory: null,
            initialized: true,
            error: null
          })
          return { sessions: newSessions }
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Initialization failed'
        set((state) => {
          const newSessions = new Map(state.sessions)
          const session = newSessions.get(sessionId)
          if (session) {
            newSessions.set(sessionId, {
              ...session,
              error: message,
              isLoading: false
            })
          }
          return { sessions: newSessions }
        })
        toast.error(message)
      }
    },

    sendMessage: async (sessionId: string, content: string) => {
      const session = get().sessions.get(sessionId)
      if (!session) {
        toast.error('Chat session not initialized')
        return
      }

      if (!content.trim()) {
        return
      }

      // Add user message
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString()
      }

      set((state) => {
        const newSessions = new Map(state.sessions)
        const currentSession = newSessions.get(sessionId)
        if (currentSession) {
          newSessions.set(sessionId, {
            ...currentSession,
            messages: [...currentSession.messages, userMessage],
            isResponding: true,
            streamingContent: '',
            activeToolUse: null,
            pendingToolUses: [],
            textSegments: [],
            error: null
          })
        }
        return { sessions: newSessions }
      })

      // Send to backend (events come via onStream)
      try {
        await window.electronAPI.unifiedChat.send(sessionId, content.trim())
      } catch (error) {
        set((state) => {
          const newSessions = new Map(state.sessions)
          const currentSession = newSessions.get(sessionId)
          if (currentSession) {
            newSessions.set(sessionId, {
              ...currentSession,
              isResponding: false,
              streamingContent: ''
            })
          }
          return { sessions: newSessions }
        })
        toast.error('Failed to send message')
      }
    },

    abort: (sessionId: string) => {
      window.electronAPI?.unifiedChat?.abort(sessionId)

      set((state) => {
        const newSessions = new Map(state.sessions)
        const session = newSessions.get(sessionId)
        if (session) {
          newSessions.set(sessionId, {
            ...session,
            isResponding: false,
            streamingContent: '',
            activeToolUse: null,
            pendingToolUses: [],
            textSegments: []
          })
        }
        return { sessions: newSessions }
      })
    },

    reset: async (sessionId: string) => {
      try {
        await window.electronAPI.unifiedChat.reset(sessionId)

        set((state) => {
          const newSessions = new Map(state.sessions)
          newSessions.delete(sessionId)
          return { sessions: newSessions }
        })
      } catch (error) {
        console.error('Failed to reset chat session:', error)
      }
    },

    clearError: (sessionId: string) => {
      set((state) => {
        const newSessions = new Map(state.sessions)
        const session = newSessions.get(sessionId)
        if (session) {
          newSessions.set(sessionId, {
            ...session,
            error: null
          })
        }
        return { sessions: newSessions }
      })
    },

    compact: async (sessionId: string) => {
      const session = get().sessions.get(sessionId)
      if (!session) {
        toast.error('Chat session not found')
        return
      }

      if (session.messages.length === 0) {
        toast.error('No messages to compact')
        return
      }

      // Set compacting state (will also be set by event listener)
      set((state) => {
        const newSessions = new Map(state.sessions)
        const currentSession = newSessions.get(sessionId)
        if (currentSession) {
          newSessions.set(sessionId, {
            ...currentSession,
            isCompacting: true
          })
        }
        return { sessions: newSessions }
      })

      try {
        const result = await window.electronAPI.unifiedChat.compact(sessionId)
        if (!result.success) {
          // Reset compacting state on error (backend returns error without emitting event)
          set((state) => {
            const newSessions = new Map(state.sessions)
            const currentSession = newSessions.get(sessionId)
            if (currentSession) {
              newSessions.set(sessionId, {
                ...currentSession,
                isCompacting: false
              })
            }
            return { sessions: newSessions }
          })
          toast.error(result.error || 'Compaction failed')
        }
        // Success handling done via event listeners (onCompactionComplete)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Compaction failed'
        set((state) => {
          const newSessions = new Map(state.sessions)
          const currentSession = newSessions.get(sessionId)
          if (currentSession) {
            newSessions.set(sessionId, {
              ...currentSession,
              isCompacting: false,
              error: message
            })
          }
          return { sessions: newSessions }
        })
        toast.error(message)
      }
    },

    getMemory: async (sessionId: string) => {
      try {
        const memory = await window.electronAPI.unifiedChat.getMemory(sessionId)

        // Update store with memory
        set((state) => {
          const session = state.sessions.get(sessionId)
          if (!session) return state

          const newSessions = new Map(state.sessions)
          newSessions.set(sessionId, {
            ...session,
            memory
          })
          return { sessions: newSessions }
        })

        return memory
      } catch (error) {
        console.error('Failed to get memory:', error)
        return null
      }
    }
  }
})
