import { create } from 'zustand'
import { toast } from './toast-store'
import type { ChatHistory, AgentStreamEvent } from '@shared/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  isResponding: boolean
  streamingContent: string // Partial response being built
  currentFeatureId: string | null
  systemPrompt: string | null
  contextLoaded: boolean

  // Actions
  loadChat: (featureId: string) => Promise<void>
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  sendToAI: () => Promise<void>
  sendToAgent: () => Promise<void> // Agent SDK streaming
  abortAgent: () => void
  refreshContext: () => Promise<void>
  clearChat: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  isResponding: false,
  streamingContent: '',
  currentFeatureId: null,
  systemPrompt: null,
  contextLoaded: false,

  loadChat: async (featureId: string) => {
    // Clear previous messages before loading new feature's chat
    set({
      isLoading: true,
      messages: [],
      currentFeatureId: featureId,
      systemPrompt: null,
      contextLoaded: false
    })
    try {
      // Load chat messages
      if (window.electronAPI?.storage?.loadChat) {
        const chat = await window.electronAPI.storage.loadChat(featureId)
        if (chat && chat.entries) {
          // Convert ChatEntry to ChatMessage (adding id field)
          const messages: ChatMessage[] = chat.entries.map((entry, index) => ({
            id: `${featureId}-${index}-${entry.timestamp}`,
            role: entry.role,
            content: entry.content,
            timestamp: entry.timestamp
          }))
          set({ messages })
        }
      }

      // Load feature context for AI prompts
      if (window.electronAPI?.chat?.getContext) {
        const contextResult = await window.electronAPI.chat.getContext(featureId)
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

    // Persist to storage asynchronously
    const { currentFeatureId, messages } = get()
    if (currentFeatureId && window.electronAPI?.storage?.saveChat) {
      // Build ChatHistory from current messages (including the new one)
      const chatHistory: ChatHistory = {
        entries: [...messages, newMessage].map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp
        }))
      }
      window.electronAPI.storage.saveChat(currentFeatureId, chatHistory).catch((err) => {
        console.error('Failed to save chat:', err)
        toast.error('Failed to save chat message')
      })
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
    const { messages, currentFeatureId, systemPrompt } = get()
    if (!currentFeatureId || messages.length === 0) return

    // Check if SDK agent API is available
    if (!window.electronAPI?.sdkAgent) {
      // Fall back to sendToAI if SDK agent not available
      return get().sendToAI()
    }

    set({ isResponding: true, streamingContent: '' })

    // Build prompt from message history
    const prompt = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')

    // Subscribe to stream events
    const unsubscribe = window.electronAPI.sdkAgent.onStream((event: AgentStreamEvent) => {
      if (event.type === 'message' && event.message) {
        // Accumulate content
        set((state) => ({
          streamingContent: state.streamingContent + event.message!.content
        }))
      } else if (event.type === 'tool_use' && event.message) {
        // Show tool usage in chat
        set((state) => ({
          streamingContent: state.streamingContent + `\n[Using ${event.message!.toolName}...]\n`
        }))
      } else if (event.type === 'done') {
        // Finalize response
        const { streamingContent, currentFeatureId: featId } = get()
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
            streamingContent: ''
          }))

          // Persist
          const { messages: updated } = get()
          window.electronAPI.storage.saveChat(featId, {
            entries: updated.map((m) => ({
              role: m.role,
              content: m.content,
              timestamp: m.timestamp
            }))
          })
        } else {
          set({ isResponding: false, streamingContent: '' })
        }
        unsubscribe()
      } else if (event.type === 'error') {
        set({ isResponding: false, streamingContent: '' })
        toast.error(event.error || 'Agent query failed')
        console.error('Agent error:', event.error)
        unsubscribe()
      }
    })

    // Start agent query
    try {
      await window.electronAPI.sdkAgent.query({
        prompt,
        systemPrompt: systemPrompt || undefined,
        allowedTools: [], // No tools for basic chat
        permissionMode: 'default'
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
      isResponding: false,
      streamingContent: '',
      systemPrompt: null,
      contextLoaded: false
    })
}))
