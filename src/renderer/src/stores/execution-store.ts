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

  // Actions
  start: (featureId: string) => Promise<{ success: boolean; error?: string }>
  pause: () => Promise<{ success: boolean; error?: string }>
  resume: () => Promise<{ success: boolean; error?: string }>
  stop: () => Promise<{ success: boolean; error?: string }>
  getState: () => Promise<void>
}

export const useExecutionStore = create<ExecutionStoreState>((set) => ({
  execution: {
    status: 'idle',
    featureId: null,
    error: null,
    startedAt: null
  },
  isLoading: false,

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
        set({
          execution: {
            status: state.status,
            featureId: state.featureId,
            error: state.error,
            startedAt: state.startedAt
          },
          isLoading: false
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
      const result = await window.electronAPI.execution.stop()
      if (result.success) {
        set({
          execution: {
            status: 'idle',
            featureId: null,
            error: null,
            startedAt: null
          },
          isLoading: false
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
