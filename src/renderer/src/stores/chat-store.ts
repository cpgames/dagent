import { create } from 'zustand'
import { toast } from './toast-store'
import { useAuthStore } from './auth-store'
import { useProjectStore } from './project-store'
import { useDAGStore } from './dag-store'
import { useFeatureStore } from './feature-store'
import type { AgentStreamEvent } from '@shared/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ActiveToolUse {
  name: string
  input?: unknown
  result?: string
}

export type ChatContextType = 'feature' | 'task' | 'agent'

/**
 * Compute PM session ID from feature ID.
 * Session ID format: "pm-feature-{featureId}"
 */
function getPMSessionId(featureId: string): string {
  return `pm-feature-${featureId}`
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  isResponding: boolean
  streamingContent: string // Partial response being built
  activeToolUse: ActiveToolUse | null // Current tool operation
  currentFeatureId: string | null
  sessionId: string | null // Session ID for session API
  contextType: ChatContextType | null
  systemPrompt: string | null
  contextLoaded: boolean

  // Actions
  loadChat: (contextId: string, contextType?: ChatContextType) => Promise<void>
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  sendMessage: () => Promise<void> // Auto-selects SDK or ChatService
  sendToAI: () => Promise<void>
  sendToAgent: () => Promise<void> // Agent SDK streaming
  abortAgent: () => void
  refreshContext: () => Promise<void>
  clearChat: () => void
  clearMessages: () => void // Clear messages but keep context
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  isResponding: false,
  streamingContent: '',
  activeToolUse: null,
  currentFeatureId: null,
  sessionId: null,
  contextType: null,
  systemPrompt: null,
  contextLoaded: false,

  loadChat: async (contextId: string, contextType: ChatContextType = 'feature') => {
    const sessionId = getPMSessionId(contextId)

    // Clear previous messages before loading new context's chat
    set({
      isLoading: true,
      messages: [],
      currentFeatureId: contextId,
      sessionId,
      contextType,
      systemPrompt: null,
      contextLoaded: false
    })
    try {
      // Get project root from project store
      const projectRoot = useProjectStore.getState().projectPath

      // Check if migration is needed and perform it transparently
      if (contextType === 'feature' && projectRoot && window.electronAPI?.session?.needsMigration) {
        try {
          const needsMigration = await window.electronAPI.session.needsMigration(projectRoot, contextId)
          if (needsMigration && window.electronAPI?.session?.migratePMChat) {
            console.log('[ChatStore] Migrating old chat format for', contextId)
            const result = await window.electronAPI.session.migratePMChat(projectRoot, contextId)
            if (result.success) {
              console.log('[ChatStore] Migration successful:', result.messagesImported, 'messages imported')
            } else {
              console.error('[ChatStore] Migration failed:', result.error)
            }
          }
        } catch (migrationError) {
          console.error('[ChatStore] Migration check failed:', migrationError)
          // Continue loading - migration is optional
        }
      }

      // Load chat messages from session API (preferred) or fall back to storage API
      if (contextType === 'feature' && projectRoot && window.electronAPI?.session?.loadMessages) {
        try {
          const sessionMessages = await window.electronAPI.session.loadMessages(
            projectRoot,
            sessionId,
            contextId
          )

          if (sessionMessages && sessionMessages.length > 0) {
            // Convert session ChatMessage to store ChatMessage format
            const messages: ChatMessage[] = sessionMessages.map((msg, index) => ({
              id: msg.id || `${contextId}-${index}-${msg.timestamp}`,
              role: msg.role === 'system' ? 'assistant' : msg.role as 'user' | 'assistant',
              content: msg.content,
              timestamp: msg.timestamp
            }))
            set({ messages })
          }
        } catch (sessionError) {
          console.warn('[ChatStore] Session API failed, falling back to storage:', sessionError)
          // Fall back to old storage API
          if (window.electronAPI?.storage?.loadChat) {
            const chat = await window.electronAPI.storage.loadChat(contextId)
            if (chat && chat.entries) {
              const messages: ChatMessage[] = chat.entries.map((entry, index) => ({
                id: `${contextId}-${index}-${entry.timestamp}`,
                role: entry.role,
                content: entry.content,
                timestamp: entry.timestamp
              }))
              set({ messages })
            }
          }
        }
      } else if (contextType === 'feature' && window.electronAPI?.storage?.loadChat) {
        // Fallback: Load from old storage if session API not available
        const chat = await window.electronAPI.storage.loadChat(contextId)
        if (chat && chat.entries) {
          const messages: ChatMessage[] = chat.entries.map((entry, index) => ({
            id: `${contextId}-${index}-${entry.timestamp}`,
            role: entry.role,
            content: entry.content,
            timestamp: entry.timestamp
          }))
          set({ messages })
        }
      }

      // Automatically load context for AI prompts (no manual refresh needed)
      if (contextType === 'feature' && window.electronAPI?.chat?.getContext) {
        const contextResult = await window.electronAPI.chat.getContext(contextId)
        if (contextResult) {
          set({ systemPrompt: contextResult.systemPrompt, contextLoaded: true })
        }
      }

      set({ isLoading: false })
    } catch (error) {
      console.error('Failed to load chat:', error)
      toast.error('Failed to load chat history')
      set({ messages: [], isLoading: false })
    }
  },

  addMessage: (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }

    // Update state with new message
    set((state) => ({
      messages: [...state.messages, newMessage]
    }))

    // Persist to session API asynchronously (only user messages - assistant messages handled in sendToAgent)
    const { currentFeatureId, sessionId } = get()
    const projectRoot = useProjectStore.getState().projectPath

    if (currentFeatureId && sessionId && projectRoot && message.role === 'user') {
      // Use session API if available
      if (window.electronAPI?.session?.addUserMessage) {
        window.electronAPI.session.addUserMessage(
          projectRoot,
          sessionId,
          currentFeatureId,
          message.content
        ).catch((err) => {
          console.error('Failed to save message to session:', err)
          toast.error('Failed to save chat message')
        })
      }
    }
  },

  sendMessage: async () => {
    // Auto-select between Agent SDK and ChatService based on SDK availability
    const { sdkStatus } = useAuthStore.getState()

    if (sdkStatus?.available) {
      // Use Agent SDK for streaming responses
      return get().sendToAgent()
    } else {
      // Fall back to ChatService
      return get().sendToAI()
    }
  },

  sendToAI: async () => {
    const { messages, currentFeatureId, systemPrompt } = get()
    if (!currentFeatureId || messages.length === 0) return

    set({ isResponding: true })

    try {
      const response = await window.electronAPI.chat.send({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp
        })),
        systemPrompt: systemPrompt || undefined
      })

      if (response.error) {
        toast.error(response.error)
      } else if (response.content) {
        // Add assistant message
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.content,
          timestamp: new Date().toISOString()
        }
        set((state) => ({
          messages: [...state.messages, assistantMessage]
        }))

        // Persist updated messages
        const { messages: updatedMessages } = get()
        if (window.electronAPI?.storage?.saveChat) {
          await window.electronAPI.storage.saveChat(currentFeatureId, {
            entries: updatedMessages.map((m) => ({
              role: m.role,
              content: m.content,
              timestamp: m.timestamp
            }))
          })
        }
      }
    } catch (error) {
      console.error('AI response error:', error)
      toast.error('Failed to get AI response')
    } finally {
      set({ isResponding: false })
    }
  },

  sendToAgent: async () => {
    const { messages, currentFeatureId } = get()
    if (!currentFeatureId || messages.length === 0) return

    // Check if SDK agent API is available
    if (!window.electronAPI?.sdkAgent) {
      // Fall back to sendToAI if SDK agent not available
      return get().sendToAI()
    }

    set({ isResponding: true, streamingContent: '', activeToolUse: null })

    // Set PM tools feature context for task creation
    if (window.electronAPI?.pmTools) {
      await window.electronAPI.pmTools.setContext(currentFeatureId)
    }

    // Build prompt from message history
    const prompt = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')

    // Subscribe to stream events
    const unsubscribe = window.electronAPI.sdkAgent.onStream((event: AgentStreamEvent) => {
      if (event.type === 'message' && event.message) {
        // Filter out system messages (e.g., "System: init") - they're internal SDK events
        if (event.message.type === 'system') {
          return
        }
        // Clear any active tool use when we get text content
        // Replace (not append) streaming content - SDK sends accumulated text, not deltas
        set({
          streamingContent: event.message!.content,
          activeToolUse: null
        })
      } else if (event.type === 'tool_use' && event.message) {
        // Show tool usage in UI via activeToolUse state
        set({
          activeToolUse: {
            name: event.message!.toolName!,
            input: event.message!.toolInput
          }
        })
      } else if (event.type === 'tool_result' && event.message) {
        // Update activeToolUse with result
        set((state) => ({
          activeToolUse: state.activeToolUse
            ? {
                ...state.activeToolUse,
                result: event.message!.toolResult
              }
            : null
        }))
      } else if (event.type === 'done') {
        // Finalize response
        const { streamingContent, currentFeatureId: featId, sessionId: sessId } = get()
        if (streamingContent && featId) {
          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: streamingContent,
            timestamp: new Date().toISOString()
          }
          set((state) => ({
            messages: [...state.messages, assistantMessage],
            isResponding: false,
            streamingContent: '',
            activeToolUse: null
          }))

          // Persist assistant message to session API
          const projectRoot = useProjectStore.getState().projectPath
          if (sessId && projectRoot && window.electronAPI?.session?.addAssistantMessage) {
            window.electronAPI.session.addAssistantMessage(
              projectRoot,
              sessId,
              featId,
              streamingContent
            ).catch((err) => {
              console.error('Failed to save assistant message to session:', err)
            })
          }
        } else {
          set({ isResponding: false, streamingContent: '', activeToolUse: null })
        }

        // Refresh DAG to show any new tasks created by PM agent
        const dagStore = useDAGStore.getState()
        const featureStore = useFeatureStore.getState()
        if (featureStore.activeFeatureId) {
          dagStore.loadDag(featureStore.activeFeatureId)
        }

        unsubscribe()
      } else if (event.type === 'error') {
        set({ isResponding: false, streamingContent: '', activeToolUse: null })
        toast.error(event.error || 'Agent query failed')
        console.error('Agent error:', event.error)
        unsubscribe()
      }
    })

    // Get current project for cwd and selected task
    const projectState = useProjectStore.getState()
    const projectRoot = projectState.projectPath || undefined
    const dagState = useDAGStore.getState()
    const selectedTaskId = dagState.selectedNodeId || undefined

    // Start agent query with PM Agent tools and autoContext
    try {
      await window.electronAPI.sdkAgent.query({
        prompt,
        // Use autoContext for automatic context injection instead of manual systemPrompt
        toolPreset: 'pmAgent', // Read, Glob, Grep + CreateTask, ListTasks tools
        permissionMode: 'acceptEdits', // Auto-approve read-only tools
        cwd: projectRoot,
        // Context options for autoContext
        featureId: currentFeatureId,
        taskId: selectedTaskId, // Pass selected task to agent context
        agentType: 'pm',
        autoContext: true
      })
    } catch (error) {
      set({ isResponding: false, streamingContent: '' })
      toast.error('Failed to start agent query')
      unsubscribe()
    }
  },

  abortAgent: () => {
    if (window.electronAPI?.sdkAgent) {
      window.electronAPI.sdkAgent.abort()
    }
    set({ isResponding: false, streamingContent: '' })
  },

  refreshContext: async () => {
    const { currentFeatureId } = get()
    if (!currentFeatureId) return

    if (window.electronAPI?.chat?.getContext) {
      const contextResult = await window.electronAPI.chat.getContext(currentFeatureId)
      if (contextResult) {
        set({ systemPrompt: contextResult.systemPrompt, contextLoaded: true })
        toast.success('Context refreshed')
      }
    }
  },

  clearChat: () =>
    set({
      messages: [],
      currentFeatureId: null,
      sessionId: null,
      contextType: null,
      isResponding: false,
      streamingContent: '',
      activeToolUse: null,
      systemPrompt: null,
      contextLoaded: false
    }),

  clearMessages: () => {
    const { currentFeatureId, sessionId, contextType } = get()

    // Clear messages but keep context/ID
    set({
      messages: [],
      isResponding: false,
      streamingContent: '',
      activeToolUse: null
    })

    // Clear messages via session API (preferred) or fall back to storage
    const projectRoot = useProjectStore.getState().projectPath
    if (currentFeatureId && sessionId && contextType === 'feature' && projectRoot && window.electronAPI?.session?.clearMessages) {
      window.electronAPI.session.clearMessages(projectRoot, sessionId, currentFeatureId).catch((err) => {
        console.error('Failed to clear session messages:', err)
        toast.error('Failed to clear chat')
      })
    }
  }
}))

// Subscribe to chat update events from main process
if (typeof window !== 'undefined' && window.electronAPI?.chat?.onUpdated) {
  window.electronAPI.chat.onUpdated((data: { featureId: string }) => {
    const state = useChatStore.getState()
    // Only reload if this is the currently active feature
    if (state.currentFeatureId === data.featureId && state.contextType === 'feature') {
      console.log('[ChatStore] Received chat update, reloading messages')
      state.loadChat(data.featureId, 'feature')
    }
  })
}
