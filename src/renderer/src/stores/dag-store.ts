import { create } from 'zustand'
import type { DAGGraph, Task, Connection, HistoryState } from '@shared/types'
import { toast } from './toast-store'

interface DAGStoreState {
  // Current DAG (for active feature)
  dag: DAGGraph | null
  isLoading: boolean
  error: string | null

  // Current feature ID for history operations
  currentFeatureId: string | null

  // Selection state
  selectedNodeId: string | null

  // History state
  historyState: HistoryState

  // Actions
  setDag: (dag: DAGGraph | null) => void
  setSelectedNode: (nodeId: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // Node operations (now async to support history)
  addNode: (node: Task) => Promise<void>
  updateNode: (nodeId: string, updates: Partial<Task>) => Promise<void>
  removeNode: (nodeId: string) => Promise<void>

  // Connection operations (now async to support history)
  addConnection: (connection: Connection) => Promise<void>
  removeConnection: (from: string, to: string) => Promise<void>

  // Async actions
  loadDag: (featureId: string) => Promise<void>
  saveDag: (featureId: string) => Promise<void>

  // History actions
  loadHistoryState: (featureId: string) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
}

export const useDAGStore = create<DAGStoreState>((set, get) => ({
  dag: null,
  isLoading: false,
  error: null,
  currentFeatureId: null,
  selectedNodeId: null,
  historyState: {
    canUndo: false,
    canRedo: false,
    currentVersion: 0,
    totalVersions: 0
  },

  setDag: (dag) => set({ dag }),
  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  addNode: async (node) => {
    const { dag, currentFeatureId } = get()
    if (!dag) return

    const newDag: DAGGraph = {
      ...dag,
      nodes: [...dag.nodes, node]
    }
    set({ dag: newDag })

    // Push version after change
    if (currentFeatureId) {
      try {
        await window.electronAPI.history.pushVersion(
          currentFeatureId,
          newDag,
          `Added node ${node.title || node.id}`
        )
        await get().loadHistoryState(currentFeatureId)
      } catch (error) {
        console.error('Failed to push version:', error)
      }
    }
  },

  updateNode: async (nodeId, updates) => {
    const { dag, currentFeatureId } = get()
    if (!dag) return

    const newDag: DAGGraph = {
      ...dag,
      nodes: dag.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n))
    }
    set({ dag: newDag })

    // Push version after change
    if (currentFeatureId) {
      try {
        await window.electronAPI.history.pushVersion(
          currentFeatureId,
          newDag,
          `Updated node ${nodeId}`
        )
        await get().loadHistoryState(currentFeatureId)
      } catch (error) {
        console.error('Failed to push version:', error)
      }
    }
  },

  removeNode: async (nodeId) => {
    const { dag, currentFeatureId, selectedNodeId } = get()
    if (!dag) return

    const newDag: DAGGraph = {
      nodes: dag.nodes.filter((n) => n.id !== nodeId),
      connections: dag.connections.filter((c) => c.from !== nodeId && c.to !== nodeId)
    }
    set({
      dag: newDag,
      selectedNodeId: selectedNodeId === nodeId ? null : selectedNodeId
    })

    // Push version after change
    if (currentFeatureId) {
      try {
        await window.electronAPI.history.pushVersion(currentFeatureId, newDag, `Removed node ${nodeId}`)
        await get().loadHistoryState(currentFeatureId)
      } catch (error) {
        console.error('Failed to push version:', error)
      }
    }
  },

  addConnection: async (connection) => {
    const { dag, currentFeatureId } = get()
    if (!dag) return

    // Check if connection already exists
    const exists = dag.connections.some(
      (c) => c.from === connection.from && c.to === connection.to
    )
    if (exists) return

    const newDag: DAGGraph = {
      ...dag,
      connections: [...dag.connections, connection]
    }
    set({ dag: newDag })

    // Push version after change
    if (currentFeatureId) {
      try {
        await window.electronAPI.history.pushVersion(
          currentFeatureId,
          newDag,
          `Added connection ${connection.from} -> ${connection.to}`
        )
        await get().loadHistoryState(currentFeatureId)
      } catch (error) {
        console.error('Failed to push version:', error)
      }
    }
  },

  removeConnection: async (from, to) => {
    const { dag, currentFeatureId } = get()
    if (!dag) return

    const newDag: DAGGraph = {
      ...dag,
      connections: dag.connections.filter((c) => !(c.from === from && c.to === to))
    }
    set({ dag: newDag })

    // Push version after change
    if (currentFeatureId) {
      try {
        await window.electronAPI.history.pushVersion(
          currentFeatureId,
          newDag,
          `Removed connection ${from} -> ${to}`
        )
        await get().loadHistoryState(currentFeatureId)
      } catch (error) {
        console.error('Failed to push version:', error)
      }
    }
  },

  loadDag: async (featureId) => {
    set({ isLoading: true, error: null, currentFeatureId: featureId })
    try {
      const dag = await window.electronAPI.storage.loadDag(featureId)
      set({ dag: dag || { nodes: [], connections: [] }, isLoading: false })
      // Load history state after DAG is loaded
      await get().loadHistoryState(featureId)
    } catch (error) {
      const message = (error as Error).message
      set({ error: message, isLoading: false })
      toast.error(`Failed to load DAG: ${message}`)
      console.error('Failed to load DAG:', error)
    }
  },

  saveDag: async (featureId) => {
    const { dag } = get()
    if (!dag) return
    try {
      await window.electronAPI.storage.saveDag(featureId, dag)
    } catch (error) {
      const message = (error as Error).message
      set({ error: message })
      toast.error(`Failed to save DAG: ${message}`)
      console.error('Failed to save DAG:', error)
    }
  },

  loadHistoryState: async (featureId) => {
    try {
      const historyState = await window.electronAPI.history.getState(featureId)
      set({ historyState })
    } catch (error) {
      console.error('Failed to load history state:', error)
    }
  },

  undo: async () => {
    const { currentFeatureId } = get()
    if (!currentFeatureId) return

    try {
      const result = await window.electronAPI.history.undo(currentFeatureId)
      if (result.success && result.graph && result.state) {
        set({ dag: result.graph, historyState: result.state })
      } else if (!result.success) {
        toast.warning('Nothing to undo')
      }
    } catch (error) {
      const message = (error as Error).message
      toast.error(`Undo failed: ${message}`)
      console.error('Undo failed:', error)
    }
  },

  redo: async () => {
    const { currentFeatureId } = get()
    if (!currentFeatureId) return

    try {
      const result = await window.electronAPI.history.redo(currentFeatureId)
      if (result.success && result.graph && result.state) {
        set({ dag: result.graph, historyState: result.state })
      } else if (!result.success) {
        toast.warning('Nothing to redo')
      }
    } catch (error) {
      const message = (error as Error).message
      toast.error(`Redo failed: ${message}`)
      console.error('Redo failed:', error)
    }
  }
}))
