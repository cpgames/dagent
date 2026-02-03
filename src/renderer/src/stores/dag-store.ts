import { create } from 'zustand'
import type { DAGGraph, Task, Connection, HistoryState } from '@shared/types'
import type { TaskLoopStatus } from '../../../main/dag-engine/orchestrator-types'
import { toast } from './toast-store'

// Track if we've already subscribed to DAG updates
let dagUpdateUnsubscribe: (() => void) | null = null
// Track if we've already subscribed to loop status updates
let loopStatusUnsubscribe: (() => void) | null = null
// Track if global event subscription is set up
let globalEventSubscriptionActive = false

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

  // Layout version - increments when auto-layout is applied
  // Used by components to detect when to clear saved positions
  layoutVersion: number

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
  clearLoopStatus: (taskId: string) => void

  // DAGManager initialization
  initializeDAGManager: (featureId: string, projectRoot: string) => Promise<void>

  // Layout actions
  autoLayout: () => Promise<void>

  // Set current feature for event handling (call immediately when feature is selected)
  setCurrentFeatureForEvents: (featureId: string | null) => void
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
  layoutVersion: 0,

  setDag: (dag) => set({ dag }),
  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // Set current feature for event handling - call immediately when feature is selected
  setCurrentFeatureForEvents: (featureId) => {
    if (featureId) {
      // Set feature ID and ensure we have an empty DAG ready to receive events
      const { dag } = get()
      if (!dag) {
        set({ currentFeatureId: featureId, dag: { nodes: [], connections: [] } })
      } else {
        set({ currentFeatureId: featureId })
      }
    } else {
      set({ currentFeatureId: null })
    }
  },

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
          set({ dag: data.graph })
        }
      })

      // Subscribe to loop status updates
      if (loopStatusUnsubscribe) {
        loopStatusUnsubscribe()
      }
      loopStatusUnsubscribe = window.electronAPI.execution.onLoopStatusUpdated((status) => {
        if (!status || !status.taskId) {
          return
        }
        const { loopStatuses } = get()
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

  clearLoopStatus: (taskId: string) => {
    const { loopStatuses } = get()
    const newStatuses = { ...loopStatuses }
    delete newStatuses[taskId]
    set({ loopStatuses: newStatuses })
  },

  initializeDAGManager: async (featureId: string, projectRoot: string) => {
    try {
      // Set currentFeatureId so event handler knows which feature to accept events for
      // Also initialize DAG to empty if not already set, so events can add nodes
      const { dag } = get()
      if (!dag) {
        set({ currentFeatureId: featureId, dag: { nodes: [], connections: [] } })
      } else {
        set({ currentFeatureId: featureId })
      }

      // Create/get DAGManager instance for this feature
      const result = await window.electronAPI.dagManager.create(featureId, projectRoot)

      // Update local DAG with the graph from the manager (in case it has existing data)
      if (result.graph) {
        set({ dag: result.graph })
      }

      // NOTE: Event handling is done by the global subscription set up in setupGlobalDAGEventSubscription()
      // No need to set up a local subscription here - that would cause duplicate event processing
    } catch (error) {
      console.error('[DAGStore] initializeDAGManager failed:', error)
      toast.error(`Failed to initialize DAG: ${(error as Error).message}`)
    }
  },

  autoLayout: async () => {
    const { currentFeatureId } = get()
    if (!currentFeatureId) return

    set({ isMutating: true })
    try {
      const projectRoot = await getProjectRoot()

      // Call auto-layout via DAGManager
      const result = await window.electronAPI.dagManager.autoLayout(currentFeatureId, projectRoot)

      if (result.success && result.graph) {
        // Increment layoutVersion to signal components to clear saved positions
        const { layoutVersion } = get()
        set({ dag: result.graph, layoutVersion: layoutVersion + 1 })

        // Save new layout positions to backend for persistence
        const positions: Record<string, { x: number; y: number }> = {}
        for (const node of result.graph.nodes) {
          positions[node.id] = node.position
        }
        try {
          await window.electronAPI.dagLayout.save(currentFeatureId, positions)
        } catch (error) {
          console.error('Failed to save layout positions:', error)
        }

        // Push to history for undo/redo
        try {
          await window.electronAPI.history.pushVersion(
            currentFeatureId,
            result.graph,
            'Auto-arranged layout'
          )
          await get().loadHistoryState(currentFeatureId)
        } catch (error) {
          console.error('Failed to push version:', error)
          toast.warning('Layout applied but history snapshot failed')
        }

        toast.success('Layout arranged')
      }
    } catch (error) {
      console.error('Failed to auto-layout:', error)
      toast.error(`Failed to arrange layout: ${(error as Error).message}`)
    } finally {
      set({ isMutating: false })
    }
  }
}))

/**
 * Set up global DAGManager event subscription.
 * This ensures we receive events even if the DAG view hasn't fully loaded yet.
 * Must be called early in app initialization.
 */
export function setupGlobalDAGEventSubscription(): void {
  if (globalEventSubscriptionActive) {
    return
  }

  // Set up the subscription
  window.electronAPI.dagManager.onEvent((data) => {
    const state = useDAGStore.getState()
    const { currentFeatureId } = state

    // Only update if it's for the current feature
    if (data.featureId !== currentFeatureId) {
      return
    }

    // Update local state based on event type
    // NOTE: For incremental updates (node-added, etc.), we get fresh state to avoid stale closures
    switch (data.event.type) {
      case 'node-added': {
        // Get fresh state to avoid stale closure issues with rapid events
        const freshDag = useDAGStore.getState().dag
        if (freshDag) {
          useDAGStore.setState({
            dag: {
              ...freshDag,
              nodes: [...freshDag.nodes, data.event.node]
            }
          })
        } else {
          useDAGStore.setState({
            dag: {
              nodes: [data.event.node],
              connections: []
            }
          })
        }
        break
      }
      case 'node-removed': {
        const freshDag = useDAGStore.getState().dag
        if (freshDag) {
          useDAGStore.setState({
            dag: {
              ...freshDag,
              nodes: freshDag.nodes.filter((n) => n.id !== data.event.nodeId)
            }
          })
        }
        break
      }
      case 'node-updated': {
        const freshDag = useDAGStore.getState().dag
        if (freshDag) {
          useDAGStore.setState({
            dag: {
              ...freshDag,
              nodes: freshDag.nodes.map((n) =>
                n.id === data.event.node.id ? { ...n, ...data.event.node } : n
              )
            }
          })
        }
        break
      }
      case 'connection-added': {
        const freshDag = useDAGStore.getState().dag
        if (freshDag) {
          useDAGStore.setState({
            dag: {
              ...freshDag,
              connections: [...freshDag.connections, data.event.connection]
            }
          })
        }
        break
      }
      case 'connection-removed': {
        const freshDag = useDAGStore.getState().dag
        if (freshDag) {
          const [from, to] = data.event.connectionId.split('->')
          useDAGStore.setState({
            dag: {
              ...freshDag,
              connections: freshDag.connections.filter((c) => !(c.from === from && c.to === to))
            }
          })
        }
        break
      }
      case 'node-moved': {
        const freshDag = useDAGStore.getState().dag
        if (freshDag) {
          useDAGStore.setState({
            dag: {
              ...freshDag,
              nodes: freshDag.nodes.map((n) =>
                n.id === data.event.nodeId ? { ...n, position: data.event.position } : n
              )
            }
          })
        }
        break
      }
      case 'graph-reset': {
        useDAGStore.setState({ dag: data.event.graph })
        break
      }
    }
  })

  globalEventSubscriptionActive = true
}
