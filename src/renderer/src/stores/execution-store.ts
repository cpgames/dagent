import { create } from 'zustand'
import { toast } from './toast-store'

type ExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

interface ExecutionState {
  status: ExecutionStatus
  featureId: string | null
  error: string | null
  startedAt: string | null
}

interface ExecutionStoreState {
  execution: ExecutionState
  isLoading: boolean
  activePollId: number | null

  // Actions
  start: (featureId: string) => Promise<{ success: boolean; error?: string }>
  pause: () => Promise<{ success: boolean; error?: string }>
  resume: () => Promise<{ success: boolean; error?: string }>
  stop: () => Promise<{ success: boolean; error?: string }>
  getState: () => Promise<void>
}

const POLL_INTERVAL_MS = 2000

export const useExecutionStore = create<ExecutionStoreState>((set, get) => ({
  execution: {
    status: 'idle',
    featureId: null,
    error: null,
    startedAt: null
  },
  isLoading: false,
  activePollId: null,

  start: async (featureId) => {
    set({ isLoading: true })
    try {
      // First load the DAG for this feature
      const dag = await window.electronAPI.storage.loadDag(featureId)
      if (!dag) {
        set({ isLoading: false })
        toast.error('Failed to load DAG for feature')
        return { success: false, error: 'Failed to load DAG for feature' }
      }

      // Initialize execution with the feature and graph
      await window.electronAPI.execution.initialize(featureId, dag)

      // Start execution
      const result = await window.electronAPI.execution.start()
      if (result.success) {
        const state = await window.electronAPI.execution.getState()
        // Clear any existing poll
        const existingPollId = get().activePollId
        if (existingPollId) {
          window.clearInterval(existingPollId)
        }

        // Start polling for state updates
        const pollId = window.setInterval(async () => {
          try {
            const polledState = await window.electronAPI.execution.getState()
            set({
              execution: {
                status: polledState.status,
                featureId: polledState.featureId,
                error: polledState.error,
                startedAt: polledState.startedAt
              }
            })
            // Stop polling if execution ended
            if (
              polledState.status === 'idle' ||
              polledState.status === 'completed' ||
              polledState.status === 'failed'
            ) {
              window.clearInterval(pollId)
              set({ activePollId: null })
            }
          } catch {
            // Ignore polling errors
          }
        }, POLL_INTERVAL_MS)

        set({
          execution: {
            status: state.status,
            featureId: state.featureId,
            error: state.error,
            startedAt: state.startedAt
          },
          isLoading: false,
          activePollId: pollId
        })
        toast.success('Execution started')
      } else {
        set({ isLoading: false })
        toast.error(result.error || 'Failed to start execution')
      }
      return result
    } catch (error) {
      set({ isLoading: false })
      const message = String(error)
      toast.error(`Execution error: ${message}`)
      console.error('Execution start error:', error)
      return { success: false, error: message }
    }
  },

  pause: async () => {
    set({ isLoading: true })
    try {
      const result = await window.electronAPI.execution.pause()
      if (result.success) {
        const state = await window.electronAPI.execution.getState()
        set({
          execution: {
            status: state.status,
            featureId: state.featureId,
            error: state.error,
            startedAt: state.startedAt
          },
          isLoading: false
        })
        toast.info('Execution paused')
      } else {
        set({ isLoading: false })
        toast.error(result.error || 'Failed to pause execution')
      }
      return result
    } catch (error) {
      set({ isLoading: false })
      const message = String(error)
      toast.error(`Pause failed: ${message}`)
      console.error('Execution pause error:', error)
      return { success: false, error: message }
    }
  },

  resume: async () => {
    set({ isLoading: true })
    try {
      const result = await window.electronAPI.execution.resume()
      if (result.success) {
        const state = await window.electronAPI.execution.getState()
        set({
          execution: {
            status: state.status,
            featureId: state.featureId,
            error: state.error,
            startedAt: state.startedAt
          },
          isLoading: false
        })
        toast.success('Execution resumed')
      } else {
        set({ isLoading: false })
        toast.error(result.error || 'Failed to resume execution')
      }
      return result
    } catch (error) {
      set({ isLoading: false })
      const message = String(error)
      toast.error(`Resume failed: ${message}`)
      console.error('Execution resume error:', error)
      return { success: false, error: message }
    }
  },

  stop: async () => {
    set({ isLoading: true })
    try {
      // Clear polling interval
      const existingPollId = get().activePollId
      if (existingPollId) {
        window.clearInterval(existingPollId)
      }

      const result = await window.electronAPI.execution.stop()
      if (result.success) {
        set({
          execution: {
            status: 'idle',
            featureId: null,
            error: null,
            startedAt: null
          },
          isLoading: false,
          activePollId: null
        })
        toast.info('Execution stopped')
      } else {
        set({ isLoading: false })
        toast.error(result.error || 'Failed to stop execution')
      }
      return result
    } catch (error) {
      set({ isLoading: false })
      const message = String(error)
      toast.error(`Stop failed: ${message}`)
      console.error('Execution stop error:', error)
      return { success: false, error: message }
    }
  },

  getState: async () => {
    try {
      const state = await window.electronAPI.execution.getState()
      set({
        execution: {
          status: state.status,
          featureId: state.featureId,
          error: state.error,
          startedAt: state.startedAt
        }
      })
    } catch {
      // Ignore errors, keep current state
    }
  }
}))
