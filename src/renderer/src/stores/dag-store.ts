import { create } from 'zustand'
import type { DAGGraph, Task, Connection, HistoryState } from '@shared/types'
import type { TaskLoopStatus } from '../../../main/dag-engine/orchestrator-types'
import { toast } from './toast-store'

// Track if we've already subscribed to DAG updates
let dagUpdateUnsubscribe: (() => void) | null = null
// Track if we've already subscribed to loop status updates
let loopStatusUnsubscribe: (() => void) | null = null
// Track if we've already subscribed to DAGManager events
let dagManagerEventUnsubscribe: (() => void) | null = null

interface DAGStoreState {
  // Current DAG (for active feature)
  dag: DAGGraph | null
  isLoading: boolean
  isMutating: boolean
  isUndoing: boolean
  isRedoing: boolean
  error: string | null

  // Current feature ID for history operations
  currentFeatureId: string | null

  // Selection state
  selectedNodeId: string | null

  // History state
  historyState: HistoryState

  // Loop status tracking (Ralph Loop)
  loopStatuses: Record<string, TaskLoopStatus>

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

  // Loop status actions
  loadLoopStatuses: () => Promise<void>

  // DAGManager initialization
  initializeDAGManager: (featureId: string, projectRoot: string) => Promise<void>
}

/**
 * Get current project root from the project store.
 * Helper to avoid circular dependencies.
 */
async function getProjectRoot(): Promise<string> {
  const projectRoot = await window.electronAPI.project.getCurrent()
  if (!projectRoot) {
    throw new Error('No project selected')
  }
  return projectRoot
}

export const useDAGStore = create<DAGStoreState>((set, get) => ({
  dag: null,
  isLoading: false,
  isMutating: false,
  isUndoing: false,
  isRedoing: false,
  error: null,
  currentFeatureId: null,
  selectedNodeId: null,
  historyState: {
    canUndo: false,
    canRedo: false,
    currentVersion: 0,
    totalVersions: 0
  },
  loopStatuses: {},

  setDag: (dag) => set({ dag }),
  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  addNode: async (node) => {
    const { currentFeatureId } = get()
    if (!currentFeatureId) return

    set({ isMutating: true })
    try {
      const projectRoot = await getProjectRoot()

      // Use DAGManager to add node (with validation)
      const createdNode = await window.electronAPI.dagManager.addNode(
        currentFeatureId,
        projectRoot,
        node
      )

      // DAGManager events will update the local state
      // But we also push to history for undo/redo
      const newDag = await window.electronAPI.dagManager.getGraph(currentFeatureId, projectRoot)

      try {
        await window.electronAPI.history.pushVersion(
          currentFeatureId,
          newDag,
          `Added node ${createdNode.title || createdNode.id}`
        )
        await get().loadHistoryState(currentFeatureId)
      } catch (error) {
        console.error('Failed to push version:', error)
        toast.warning('Changes saved but history snapshot failed')
      }
    } catch (error) {
      console.error('Failed to add node:', error)
      toast.error(`Failed to add node: ${(error as Error).message}`)
    } finally {
      set({ isMutating: false })
    }
  },

  updateNode: async (nodeId, updates) => {
    const { dag, currentFeatureId } = get()
    if (!dag) return

    set({ isMutating: true })
    try {
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
          toast.warning('Changes saved but history snapshot failed')
        }
      }
    } finally {
      set({ isMutating: false })
    }
  },

  removeNode: async (nodeId) => {
    const { currentFeatureId, selectedNodeId } = get()
    if (!currentFeatureId) return

    set({ isMutating: true })
    try {
      const projectRoot = await getProjectRoot()

      // Use DAGManager to remove node (also removes related connections)
      await window.electronAPI.dagManager.removeNode(currentFeatureId, projectRoot, nodeId)

      // Clear selection if we removed the selected node
      if (selectedNodeId === nodeId) {
        set({ selectedNodeId: null })
      }

      // DAGManager events will update the local state
      // But we also push to history for undo/redo
      const newDag = await window.electronAPI.dagManager.getGraph(currentFeatureId, projectRoot)

      try {
        await window.electronAPI.history.pushVersion(currentFeatureId, newDag, `Removed node ${nodeId}`)
        await get().loadHistoryState(currentFeatureId)
      } catch (error) {
        console.error('Failed to push version:', error)
        toast.warning('Changes saved but history snapshot failed')
      }
    } catch (error) {
      console.error('Failed to remove node:', error)
      toast.error(`Failed to remove node: ${(error as Error).message}`)
    } finally {
      set({ isMutating: false })
    }
  },

  addConnection: async (connection) => {
    const { currentFeatureId } = get()
    if (!currentFeatureId) return

    set({ isMutating: true })
    try {
      const projectRoot = await getProjectRoot()

      // Use DAGManager to add connection (with cycle detection validation)
      const result = await window.electronAPI.dagManager.addConnection(
        currentFeatureId,
        projectRoot,
        connection.from,
        connection.to
      )

      // If validation failed (null returned), show error toast
      if (!result) {
        toast.error('Cannot add connection: would create a cycle in the graph')
        return
      }

      // DAGManager events will update the local state
      // But we also push to history for undo/redo
      const newDag = await window.electronAPI.dagManager.getGraph(currentFeatureId, projectRoot)

      try {
        await window.electronAPI.history.pushVersion(
          currentFeatureId,
          newDag,
          `Added connection ${connection.from} -> ${connection.to}`
        )
        await get().loadHistoryState(currentFeatureId)
      } catch (error) {
        console.error('Failed to push version:', error)
        toast.warning('Changes saved but history snapshot failed')
      }
    } catch (error) {
      console.error('Failed to add connection:', error)
      toast.error(`Failed to add connection: ${(error as Error).message}`)
    } finally {
      set({ isMutating: false })
    }
  },

  removeConnection: async (from, to) => {
    const { currentFeatureId } = get()
    if (!currentFeatureId) return

    set({ isMutating: true })
    try {
      const projectRoot = await getProjectRoot()

      // Use DAGManager to remove connection
      const connectionId = `${from}->${to}`
      await window.electronAPI.dagManager.removeConnection(currentFeatureId, projectRoot, connectionId)

      // DAGManager events will update the local state
      // But we also push to history for undo/redo
      const newDag = await window.electronAPI.dagManager.getGraph(currentFeatureId, projectRoot)

      try {
        await window.electronAPI.history.pushVersion(
          currentFeatureId,
          newDag,
          `Removed connection ${from} -> ${to}`
        )
        await get().loadHistoryState(currentFeatureId)
      } catch (error) {
        console.error('Failed to push version:', error)
        toast.warning('Changes saved but history snapshot failed')
      }
    } catch (error) {
      console.error('Failed to remove connection:', error)
      toast.error(`Failed to remove connection: ${(error as Error).message}`)
    } finally {
      set({ isMutating: false })
    }
  },

  loadDag: async (featureId) => {
    set({ isLoading: true, error: null, currentFeatureId: featureId })
    try {
      const projectRoot = await getProjectRoot()

      // Initialize DAGManager for this feature
      await get().initializeDAGManager(featureId, projectRoot)

      // Load the graph from DAGManager
      const dag = await window.electronAPI.dagManager.getGraph(featureId, projectRoot)
      set({ dag, isLoading: false })

      // Load history state after DAG is loaded
      await get().loadHistoryState(featureId)

      // Subscribe to DAG updates from orchestrator (only once)
      if (dagUpdateUnsubscribe) {
        dagUpdateUnsubscribe()
      }
      dagUpdateUnsubscribe = window.electronAPI.dag.onUpdated((data) => {
        const { currentFeatureId } = get()
        // Only update if it's for the current feature
        if (data.featureId === currentFeatureId) {
          console.log('[DAGStore] Received DAG update from orchestrator')
          set({ dag: data.graph })
        }
      })

      // Subscribe to loop status updates
      if (loopStatusUnsubscribe) {
        loopStatusUnsubscribe()
      }
      loopStatusUnsubscribe = window.electronAPI.execution.onLoopStatusUpdated((status) => {
        const { loopStatuses } = get()
        console.log('[DAGStore] Received loop status update:', status.taskId, status.status)
        set({ loopStatuses: { ...loopStatuses, [status.taskId]: status } })
      })

      // Load initial loop statuses
      await get().loadLoopStatuses()
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

    set({ isUndoing: true })
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
    } finally {
      set({ isUndoing: false })
    }
  },

  redo: async () => {
    const { currentFeatureId } = get()
    if (!currentFeatureId) return

    set({ isRedoing: true })
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
    } finally {
      set({ isRedoing: false })
    }
  },

  loadLoopStatuses: async () => {
    try {
      const statuses = await window.electronAPI.execution.getAllLoopStatuses()
      set({ loopStatuses: statuses })
    } catch (error) {
      console.error('Failed to load loop statuses:', error)
    }
  },

  initializeDAGManager: async (featureId: string, projectRoot: string) => {
    try {
      // Create/get DAGManager instance for this feature
      await window.electronAPI.dagManager.create(featureId, projectRoot)
      console.log('[DAGStore] DAGManager initialized:', featureId)

      // Subscribe to DAGManager events (only once)
      if (dagManagerEventUnsubscribe) {
        dagManagerEventUnsubscribe()
      }

      dagManagerEventUnsubscribe = window.electronAPI.dagManager.onEvent((data) => {
        const { currentFeatureId } = get()
        // Only update if it's for the current feature
        if (data.featureId !== currentFeatureId) return

        console.log('[DAGStore] Received DAGManager event:', data.event.type)

        // Update local state based on event type
        switch (data.event.type) {
          case 'node-added': {
            const { dag } = get()
            if (dag) {
              set({
                dag: {
                  ...dag,
                  nodes: [...dag.nodes, data.event.node]
                }
              })
            }
            break
          }
          case 'node-removed': {
            const { dag } = get()
            if (dag) {
              set({
                dag: {
                  ...dag,
                  nodes: dag.nodes.filter((n) => n.id !== data.event.nodeId)
                }
              })
            }
            break
          }
          case 'connection-added': {
            const { dag } = get()
            if (dag) {
              set({
                dag: {
                  ...dag,
                  connections: [...dag.connections, data.event.connection]
                }
              })
            }
            break
          }
          case 'connection-removed': {
            const { dag } = get()
            if (dag) {
              const [from, to] = data.event.connectionId.split('->')
              set({
                dag: {
                  ...dag,
                  connections: dag.connections.filter((c) => !(c.from === from && c.to === to))
                }
              })
            }
            break
          }
          case 'node-moved': {
            const { dag } = get()
            if (dag) {
              set({
                dag: {
                  ...dag,
                  nodes: dag.nodes.map((n) =>
                    n.id === data.event.nodeId ? { ...n, position: data.event.position } : n
                  )
                }
              })
            }
            break
          }
          case 'graph-reset': {
            set({ dag: data.event.graph })
            break
          }
        }
      })
    } catch (error) {
      console.error('Failed to initialize DAGManager:', error)
      toast.error(`Failed to initialize DAG: ${(error as Error).message}`)
    }
  }
}))
