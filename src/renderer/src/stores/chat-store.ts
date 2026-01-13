import { create } from 'zustand'
import { toast } from './toast-store'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean

  // Actions
  loadChat: (featureId: string) => Promise<void>
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  clearChat: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,

  loadChat: async (featureId: string) => {
    set({ isLoading: true })
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
      // Fall back to empty array
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
    set((state) => ({
      messages: [...state.messages, newMessage]
    }))
  },

  clearChat: () => set({ messages: [] })
}))
