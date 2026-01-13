import { create } from 'zustand'
import { toast } from './toast-store'
import type { ChatHistory } from '@shared/types'

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
  currentFeatureId: string | null

  // Actions
  loadChat: (featureId: string) => Promise<void>
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  sendToAI: () => Promise<void>
  clearChat: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  isResponding: false,
  currentFeatureId: null,

  loadChat: async (featureId: string) => {
    // Clear previous messages before loading new feature's chat
    set({ isLoading: true, messages: [], currentFeatureId: featureId })
    try {
      // Try to load chat via IPC, fall back to empty array if not implemented
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
          set({ messages, isLoading: false })
          return
        }
      }
      // Fall back to empty array (new feature with no chat yet)
      set({ messages: [], isLoading: false })
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
    const { messages, currentFeatureId } = get()
    if (!currentFeatureId || messages.length === 0) return

    set({ isResponding: true })

    try {
      const response = await window.electronAPI.chat.send({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp
        }))
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

  clearChat: () => set({ messages: [], currentFeatureId: null, isResponding: false })
}))
