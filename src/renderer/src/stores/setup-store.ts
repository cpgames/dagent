/**
 * Setup Store for Setup Agent conversation state.
 * Manages chat messages, streaming state, and project inspection for CLAUDE.md generation.
 */
import { create } from 'zustand'
import { toast } from './toast-store'
import { useProjectStore } from './project-store'
import type { AgentStreamEvent } from '@shared/types'

/**
 * Project inspection result from Setup Agent.
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
 * Chat message in the Setup Agent conversation.
 */
export interface SetupMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

/**
 * Active tool use display state.
 */
export interface ActiveToolUse {
  name: string
  input?: unknown
  result?: string
}

interface SetupState {
  messages: SetupMessage[]
  isLoading: boolean
  isResponding: boolean
  streamingContent: string
  activeToolUse: ActiveToolUse | null
  inspection: ProjectInspection | null
  initialized: boolean
  error: string | null

  // Actions
  initialize: () => Promise<void>
  sendMessage: (content: string) => Promise<void>
  abort: () => void
  reset: () => Promise<void>
}

export const useSetupStore = create<SetupState>((set, get) => ({
  messages: [],
  isLoading: false,
  isResponding: false,
  streamingContent: '',
  activeToolUse: null,
  inspection: null,
  initialized: false,
  error: null,

  /**
   * Initialize the Setup Agent for the current project.
   * Runs project inspection and gets greeting message.
   */
  initialize: async () => {
    const projectPath = useProjectStore.getState().projectPath
    if (!projectPath) {
      set({ error: 'No project selected' })
      return
    }

    // Skip if already initialized
    if (get().initialized) {
      return
    }

    set({ isLoading: true, error: null })

    try {
      const result = await window.electronAPI.setupAgent.initialize(projectPath)

      if (!result.success) {
        set({ error: result.error || 'Initialization failed', isLoading: false })
        toast.error(result.error || 'Failed to initialize Setup Agent')
        return
      }

      // Add greeting as assistant message
      const greetingMessage: SetupMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.greeting || 'Hello! I can help you create a CLAUDE.md file for your project.',
        timestamp: new Date().toISOString()
      }

      set({
        inspection: result.inspection || null,
        messages: [greetingMessage],
        initialized: true,
        isLoading: false
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Initialization failed'
      set({ error: message, isLoading: false })
      toast.error(message)
    }
  },

  /**
   * Send a message to the Setup Agent.
   */
  sendMessage: async (content: string) => {
    const projectPath = useProjectStore.getState().projectPath
    if (!projectPath) {
      toast.error('No project selected')
      return
    }

    if (!content.trim()) {
      return
    }

    // Add user message
    const userMessage: SetupMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString()
    }

    set((state) => ({
      messages: [...state.messages, userMessage],
      isResponding: true,
      streamingContent: '',
      activeToolUse: null,
      error: null
    }))

    // Subscribe to stream events
    const unsubscribe = window.electronAPI.setupAgent.onStream((event: AgentStreamEvent) => {
      if (event.type === 'message' && event.message) {
        // Filter out system messages
        if (event.message.type === 'system') {
          return
        }
        // Replace streaming content (SDK sends accumulated text)
        set({
          streamingContent: event.message.content,
          activeToolUse: null
        })
      } else if (event.type === 'tool_use' && event.message) {
        // Show tool usage
        set({
          activeToolUse: {
            name: event.message.toolName!,
            input: event.message.toolInput
          }
        })
      } else if (event.type === 'tool_result' && event.message) {
        // Update tool result
        set((state) => ({
          activeToolUse: state.activeToolUse
            ? { ...state.activeToolUse, result: event.message!.toolResult }
            : null
        }))
      } else if (event.type === 'done') {
        // Finalize response
        const { streamingContent } = get()
        if (streamingContent) {
          const assistantMessage: SetupMessage = {
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
        } else {
          set({ isResponding: false, streamingContent: '', activeToolUse: null })
        }
        unsubscribe()
      } else if (event.type === 'error') {
        set({ isResponding: false, streamingContent: '', activeToolUse: null, error: event.error })
        toast.error(event.error || 'Setup agent query failed')
        unsubscribe()
      }
    })

    // Start the query
    try {
      await window.electronAPI.setupAgent.query(projectPath, content.trim())
    } catch (error) {
      set({ isResponding: false, streamingContent: '' })
      toast.error('Failed to send message')
      unsubscribe()
    }
  },

  /**
   * Abort the current agent query.
   */
  abort: () => {
    if (window.electronAPI?.setupAgent) {
      window.electronAPI.setupAgent.abort()
    }
    set({ isResponding: false, streamingContent: '', activeToolUse: null })
  },

  /**
   * Reset the Setup Agent and clear conversation.
   */
  reset: async () => {
    try {
      await window.electronAPI.setupAgent.reset()
      set({
        messages: [],
        isLoading: false,
        isResponding: false,
        streamingContent: '',
        activeToolUse: null,
        inspection: null,
        initialized: false,
        error: null
      })
    } catch (error) {
      console.error('Failed to reset Setup Agent:', error)
    }
  }
}))
