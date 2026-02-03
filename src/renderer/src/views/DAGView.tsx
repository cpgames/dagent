/**
 * DAGView - Displays features and their dependencies as a directed acyclic graph.
 * Shows task dependencies and execution flow using React Flow.
 */
import { useCallback, useEffect, useMemo, useState, useRef, type JSX } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type OnConnect,
  type NodeChange,
  BackgroundVariant
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useShallow } from 'zustand/react/shallow'
import { useFeatureStore } from '../stores/feature-store'
import { useDAGStore } from '../stores/dag-store'
import { useDialogStore } from '../stores/dialog-store'
import { useExecutionStore } from '../stores/execution-store'
import {
  TaskNode,
  NodeDialog,
  ConfirmDialog,
  LogDialog,
  SessionLogDialog,
  ExecutionControls,
  LayoutControls,
  SelectableEdge,
  type TaskNodeData,
  type SelectableEdgeData
} from '../components/DAG'
import type { LogEntry, DevAgentSession } from '@shared/types'
import { DockablePanel, PanelToolbar, usePanelLayout } from '../components/Feature'
import type { DAGGraph, Task } from '@shared/types'
import { toast } from '../stores/toast-store'

// Register custom node and edge types
const nodeTypes = {
  taskNode: TaskNode
}

const edgeTypes = {
  selectable: SelectableEdge
}

// Convert DAG nodes to React Flow format
function dagToNodes(dag: DAGGraph | null, analyzingTaskId: string | null = null, worktreePath?: string): Node[] {
  if (!dag) return []

  return dag.nodes.map((task) => ({
    id: task.id,
    type: 'taskNode',
    position: task.position,
    data: {
      task,
      isBeingAnalyzed: task.id === analyzingTaskId,
      worktreePath
    } as TaskNodeData
  }))
}

// Convert DAG connections to React Flow edges
function dagToEdges(
  dag: DAGGraph | null,
  selectedEdge: { source: string; target: string } | null,
  onSelectEdge: (source: string, target: string) => void,
  onDeleteEdge: (source: string, target: string) => void
): Edge[] {
  if (!dag) return []

  return dag.connections.map((conn) => {
    const edgeId = `${conn.from}->${conn.to}`
    const isSelected = selectedEdge?.source === conn.from && selectedEdge?.target === conn.to
    return {
      id: edgeId,
      source: conn.from,
      target: conn.to,
      type: 'selectable',
      markerEnd: {
        type: 'arrowclosed',
        width: 20,
        height: 20
      },
      data: {
        selected: isSelected,
        onSelect: onSelectEdge,
        onDelete: onDeleteEdge
      } as SelectableEdgeData
    }
  })
}

// Inner component that has access to useReactFlow
function DAGViewInner({
  activeFeatureId
}: {
  activeFeatureId: string | null
}): JSX.Element {
  // Use granular selectors to prevent unnecessary re-renders
  const dag = useDAGStore((state) => state.dag)
  const isMutating = useDAGStore((state) => state.isMutating)
  const error = useDAGStore((state) => state.error)
  const setError = useDAGStore((state) => state.setError)
  const addNode = useDAGStore((state) => state.addNode)
  const addConnection = useDAGStore((state) => state.addConnection)
  const removeNode = useDAGStore((state) => state.removeNode)
  const removeConnection = useDAGStore((state) => state.removeConnection)
  const selectedNodeId = useDAGStore((state) => state.selectedNodeId)
  const setSelectedNode = useDAGStore((state) => state.setSelectedNode)
  // Use shallow comparison for object values to prevent unnecessary re-renders
  const historyState = useDAGStore(useShallow((state) => state.historyState))
  const undo = useDAGStore((state) => state.undo)
  const redo = useDAGStore((state) => state.redo)
  const autoLayout = useDAGStore((state) => state.autoLayout)
  const layoutVersion = useDAGStore((state) => state.layoutVersion)

  const nodeDialogOpen = useDialogStore((state) => state.nodeDialogOpen)
  const nodeDialogTaskId = useDialogStore((state) => state.nodeDialogTaskId)
  const openNodeDialog = useDialogStore((state) => state.openNodeDialog)
  const closeNodeDialog = useDialogStore((state) => state.closeNodeDialog)
  const logDialogOpen = useDialogStore((state) => state.logDialogOpen)
  const logDialogTitle = useDialogStore((state) => state.logDialogTitle)
  const logDialogTaskId = useDialogStore((state) => state.logDialogTaskId)
  const logDialogSource = useDialogStore((state) => state.logDialogSource)
  const openLogDialog = useDialogStore((state) => state.openLogDialog)
  const closeLogDialog = useDialogStore((state) => state.closeLogDialog)

  // React Flow instance for programmatic control (fitView, etc.)
  const { fitView } = useReactFlow()

  // Log entries for LogDialog (PM logs)
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])

  // Task session for SessionLogDialog
  const [taskSession, setTaskSession] = useState<DevAgentSession | null>(null)

  // Session for selected task (for TaskDetailsPanel inline logs)
  const [selectedTaskSession, setSelectedTaskSession] = useState<DevAgentSession | null>(null)

  // Track previous node count to only fit view when first node is added
  const prevNodeCountRef = useRef<number>(0)


  // Panel layout management
  const {
    layoutState,
    activePanels,
    togglePanel,
    updatePanelPosition,
    removePanel: removePanelFromLayout,
    groupPanels,
    ungroupPanel,
    setActiveTab,
    updateGroupPosition
  } = usePanelLayout()

  // Edge selection state - store source/target directly to avoid parsing edge IDs
  const [selectedEdge, setSelectedEdge] = useState<{ source: string; target: string } | null>(null)

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; taskId: string | null; taskTitle: string }>({
    open: false,
    taskId: null,
    taskTitle: ''
  })

  // Currently analyzing task ID (for analysis animation)
  const [analyzingTaskId, setAnalyzingTaskId] = useState<string | null>(null)

  // Planning/analyzing state for ExecutionControls
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)

  // Handle edge selection
  const handleSelectEdge = useCallback((source: string, target: string) => {
    setSelectedEdge({ source, target })
  }, [])

  // Handle edge deletion
  const handleDeleteEdge = useCallback(
    (source: string, target: string) => {
      removeConnection(source, target)
      setSelectedEdge(null)
    },
    [removeConnection]
  )

  // Clear edge and node selection when clicking on pane
  const handlePaneClick = useCallback(() => {
    // Zustand handles duplicate value detection, so just set directly
    setSelectedEdge(null)
    setSelectedNode(null)
  }, [setSelectedNode])

  // Handle node click - select the task for PM agent context
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id)
      // Only update edge selection if there was a selected edge
      setSelectedEdge((prev) => prev ? null : prev)
    },
    [setSelectedNode]
  )

  // Find the task for the open dialog (null means create mode)
  const dialogTask = useMemo(() => {
    if (!nodeDialogOpen) return undefined // Dialog not open
    if (!nodeDialogTaskId) return null // Create mode
    if (!dag) return undefined // No DAG loaded
    return dag.nodes.find((n) => n.id === nodeDialogTaskId) || undefined
  }, [nodeDialogOpen, nodeDialogTaskId, dag])

  // Get the selected task for the Task panel
  const selectedTask = useMemo(() => {
    if (!selectedNodeId || !dag) return null
    return dag.nodes.find((n) => n.id === selectedNodeId) || null
  }, [selectedNodeId, dag])

  // Handle create task from dialog
  const handleCreateTask = useCallback(
    async (title: string) => {
      if (!activeFeatureId) return

      // Create a new task directly in the DAG
      const newTask: Task = {
        id: `task-${Date.now()}`, // Temporary ID, DAGManager will assign proper one
        title,
        spec: '', // Spec is generated by PM, starts empty
        status: 'ready',
        blocked: false,
        position: { x: 0, y: 0 }, // DAGManager will auto-place it
        dependencies: [] // No dependencies initially
      }

      await addNode(newTask)
      toast.success(`Task "${title}" created`)
    },
    [activeFeatureId, addNode]
  )

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      const task = dag?.nodes.find(n => n.id === taskId)
      const taskTitle = task?.title || 'this task'

      setDeleteConfirm({
        open: true,
        taskId,
        taskTitle
      })
    },
    [dag]
  )

  const confirmDeleteTask = useCallback(() => {
    if (deleteConfirm.taskId) {
      removeNode(deleteConfirm.taskId)
      setDeleteConfirm({ open: false, taskId: null, taskTitle: '' })
    }
  }, [deleteConfirm.taskId, removeNode])

  // Handle keyboard Delete key to delete selected task or edge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Delete/Backspace
      if (e.key !== 'Delete' && e.key !== 'Backspace') return

      // Don't trigger if user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Delete selected edge (direct deletion, no confirmation)
      if (selectedEdge) {
        e.preventDefault()
        handleDeleteEdge(selectedEdge.source, selectedEdge.target)
        return
      }

      // Delete selected node (with confirmation dialog)
      if (selectedNodeId) {
        e.preventDefault()
        handleDeleteTask(selectedNodeId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, selectedEdge, handleDeleteTask, handleDeleteEdge])

  // Handle abort loop
  const handleAbortLoop = useCallback(async (taskId: string) => {
    try {
      const result = await window.electronAPI.execution.abortLoop(taskId)
      if (!result.success) {
        toast.error(`Failed to abort loop: ${result.error}`)
      }
    } catch (error) {
      toast.error(`Failed to abort loop: ${(error as Error).message}`)
    }
  }, [])

  // Handle PM log button click
  const handleShowPMLogs = useCallback(async () => {
    openLogDialog('PM Agent Logs', null, 'pm')

    // Load PM-specific logs or chat history converted to log format
    if (activeFeatureId) {
      try {
        const chatHistory = await window.electronAPI.storage.loadChat(activeFeatureId)
        if (chatHistory && chatHistory.entries.length > 0) {
          // Convert chat entries to log entries
          const entries: LogEntry[] = chatHistory.entries.map((entry) => ({
            timestamp: entry.timestamp,
            type: entry.role === 'user' ? 'pm-query' : 'pm-response',
            agent: 'pm',
            content: entry.content
          }))
          setLogEntries(entries)
        } else {
          setLogEntries([])
        }
      } catch (error) {
        console.error('Failed to load PM logs:', error)
        setLogEntries([])
      }
    }
  }, [activeFeatureId, openLogDialog])

  // Handle plan button click - starts planning phase
  const handlePlan = useCallback(async () => {
    if (!activeFeatureId) return

    try {
      setIsAnalyzing(true) // Reuse analyzing state for planning indicator
      const result = await window.electronAPI.feature.startPlanning(activeFeatureId)
      if (!result.success) {
        toast.error(`Failed to start planning: ${result.error}`)
        setIsAnalyzing(false)
      }
      // Planning status changes will update via IPC listener
    } catch (error) {
      toast.error(`Failed to start planning: ${(error as Error).message}`)
      setIsAnalyzing(false)
    }
  }, [activeFeatureId])

  // Handle clear logs
  const handleClearLogs = useCallback(async (taskId: string) => {
    if (!activeFeatureId) return
    try {
      await window.electronAPI.storage.clearSessionMessages(activeFeatureId, taskId)
      // Refresh the session by clearing the local state
      setSelectedTaskSession(null)
      toast.success('Logs cleared')
    } catch (error) {
      toast.error(`Failed to clear logs: ${(error as Error).message}`)
    }
  }, [activeFeatureId])

  // Handle abort task (discard all changes and reset to ready)
  const handleAbortTask = useCallback(async (taskId: string) => {
    if (!activeFeatureId) return
    try {
      const result = await window.electronAPI.execution.abortTask(taskId)
      if (result.success) {
        toast.success('Task aborted and reset to Ready')
        // Clear the session for this task
        setSelectedTaskSession(null)
      } else {
        toast.error(`Failed to abort task: ${result.error}`)
      }
    } catch (error) {
      toast.error(`Failed to abort task: ${(error as Error).message}`)
    }
  }, [activeFeatureId])

  // Handle start single task (step-by-step execution mode)
  const handleStartTask = useCallback(async (taskId: string) => {
    if (!activeFeatureId) return

    try {
      // First, initialize the orchestrator with the feature's DAG
      // This is required before startSingleTask can work
      const currentDag = await window.electronAPI.storage.loadDag(activeFeatureId)
      if (!currentDag) {
        toast.error('Failed to load DAG for feature')
        return
      }
      await window.electronAPI.execution.initialize(activeFeatureId, currentDag)

      // Now start the single task
      const result = await window.electronAPI.execution.startSingleTask(taskId)
      if (!result.success) {
        toast.error(`Failed to start task: ${result.error}`)
      } else {
        toast.success('Task started')
      }
    } catch (error) {
      console.error('[DAGView] Error starting task:', error)
      toast.error('Failed to start task')
    }
  }, [activeFeatureId])

  // Get the active feature status to check if we can start tasks
  // Use a selector that only extracts what we need to prevent re-renders
  const canStartTasks = useFeatureStore(
    useCallback(
      (state) => state.features.find(f => f.id === activeFeatureId)?.status === 'active',
      [activeFeatureId]
    )
  )

  // Get the active feature's worktreePath for git operations
  const activeWorktreePath = useFeatureStore(
    useCallback(
      (state) => state.features.find(f => f.id === activeFeatureId)?.worktreePath,
      [activeFeatureId]
    )
  )

  // Convert DAG to React Flow format
  const initialNodes = useMemo(
    () => dagToNodes(dag, analyzingTaskId, activeWorktreePath),
    [dag, analyzingTaskId, activeWorktreePath]
  )
  const initialEdges = useMemo(
    () => dagToEdges(dag, selectedEdge, handleSelectEdge, handleDeleteEdge),
    [dag, selectedEdge, handleSelectEdge, handleDeleteEdge]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Store loaded layout positions in a ref so they persist across DAG updates
  const layoutPositionsRef = useRef<Record<string, { x: number; y: number }>>({})

  // Load layout positions when active feature changes
  useEffect(() => {
    if (!activeFeatureId) {
      layoutPositionsRef.current = {}
      return
    }

    const loadLayout = async () => {
      try {
        const result = await window.electronAPI.dagLayout.load(activeFeatureId)
        if (result.success && result.layout && result.layout.positions) {
          layoutPositionsRef.current = result.layout.positions
        } else {
          layoutPositionsRef.current = {}
        }
      } catch (error) {
        console.error('[DAGView] Failed to load layout:', error)
        layoutPositionsRef.current = {}
      }
    }

    loadLayout()
  }, [activeFeatureId])

  // Clear saved positions when auto-layout is applied (layoutVersion changes)
  // This ensures the new calculated positions are used instead of old saved positions
  const prevLayoutVersionRef = useRef(layoutVersion)
  useEffect(() => {
    if (layoutVersion !== prevLayoutVersionRef.current) {
      layoutPositionsRef.current = {}
      prevLayoutVersionRef.current = layoutVersion
    }
  }, [layoutVersion])

  // Fetch initial analysis status on feature change
  useEffect(() => {
    if (!activeFeatureId) {
      setIsAnalyzing(false)
      setAnalyzingTaskId(null)
      return
    }

    const fetchStatus = async (): Promise<void> => {
      try {
        // Check if analysis (or planning) is currently running
        const statusResult = await window.electronAPI.analysis.status(activeFeatureId)
        setIsAnalyzing(statusResult.running)
      } catch (error) {
        console.error('[DAGView] Failed to fetch analysis status:', error)
        setIsAnalyzing(false)
      }
    }

    fetchStatus()
  }, [activeFeatureId])

  // Listen for analysis events to track which task is being analyzed
  useEffect(() => {
    if (!activeFeatureId) {
      setAnalyzingTaskId(null)
      return
    }

    const unsubscribe = window.electronAPI.analysis.onEvent((data) => {
      // Only update if the event is for this feature
      if (data.featureId !== activeFeatureId) return

      const { event } = data
      if (event.type === 'analyzing') {
        setAnalyzingTaskId(event.taskId ?? null)
        setIsAnalyzing(true)
      } else if (event.type === 'kept') {
        // Task was kept as-is
        setAnalyzingTaskId(null)
      } else if (event.type === 'split') {
        // Task was split into subtasks
        setAnalyzingTaskId(null)
      } else if (event.type === 'error') {
        // Clear analyzing state on error
        setAnalyzingTaskId(null)
        setIsAnalyzing(false)
      } else if (event.type === 'complete') {
        // Analysis complete for feature, clear all state
        setAnalyzingTaskId(null)
        setIsAnalyzing(false)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [activeFeatureId])

  // Update nodes when DAG changes, merging in saved layout positions
  useEffect(() => {
    const nodeCount = dag?.nodes?.length ?? 0
    const prevNodeCount = prevNodeCountRef.current
    const newNodes = dagToNodes(dag, analyzingTaskId, activeWorktreePath).map((node) => {
      const savedPos = layoutPositionsRef.current[node.id]
      if (savedPos) {
        return { ...node, position: savedPos }
      }
      return node
    })
    setNodes(newNodes)

    // Only fit view when going from 0 nodes to 1+ nodes (first node added)
    // This prevents the view from constantly re-centering during planning updates
    if (prevNodeCount === 0 && nodeCount > 0) {
      // Use setTimeout to ensure nodes are rendered before fitting
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 200 })
      }, 50)
    }

    // Update previous node count
    prevNodeCountRef.current = nodeCount
  }, [dag, analyzingTaskId, activeWorktreePath, setNodes, fitView])

  // Update edges separately when DAG or edge selection changes
  // This prevents node selection from being reset when only edge selection changes
  useEffect(() => {
    setEdges(dagToEdges(dag, selectedEdge, handleSelectEdge, handleDeleteEdge))
  }, [dag, selectedEdge, handleSelectEdge, handleDeleteEdge, setEdges])

  // Poll for real-time session updates when task log dialog is open
  useEffect(() => {
    if (!logDialogOpen || logDialogSource !== 'task' || !logDialogTaskId || !activeFeatureId) {
      return
    }

    const poll = async (): Promise<void> => {
      try {
        const session = await window.electronAPI.storage.loadTaskSession(
          activeFeatureId,
          logDialogTaskId
        )
        // Only update if message count changed to prevent unnecessary re-renders
        setTaskSession((prev) => {
          if (session?.messages.length !== prev?.messages.length) {
            return session
          }
          return prev
        })
      } catch (error) {
        console.error('Failed to poll task session:', error)
      }
    }

    // Poll every 2 seconds
    const intervalId = setInterval(poll, 2000)

    return () => clearInterval(intervalId)
  }, [logDialogOpen, logDialogSource, logDialogTaskId, activeFeatureId])

  // Poll for selected task session (for TaskDetailsPanel inline logs)
  // Debounce the initial load to prevent lag during rapid node selection
  useEffect(() => {
    if (!selectedNodeId || !activeFeatureId) {
      setSelectedTaskSession(null)
      return
    }

    // Debounce initial load to avoid IPC call lag during selection
    const loadTimeout = setTimeout(async () => {
      try {
        const session = await window.electronAPI.storage.loadTaskSession(activeFeatureId, selectedNodeId)
        setSelectedTaskSession(session)
      } catch (error) {
        console.error('Failed to load selected task session:', error)
        setSelectedTaskSession(null)
      }
    }, 300) // 300ms debounce

    // Poll every 2 seconds for updates (only after initial debounce)
    const intervalId = setInterval(async () => {
      try {
        const session = await window.electronAPI.storage.loadTaskSession(activeFeatureId, selectedNodeId)
        setSelectedTaskSession((prev) => {
          if (session?.messages.length !== prev?.messages.length) {
            return session
          }
          return prev
        })
      } catch (error) {
        console.error('Failed to poll selected task session:', error)
      }
    }, 2000)

    return () => {
      clearTimeout(loadTimeout)
      clearInterval(intervalId)
    }
  }, [selectedNodeId, activeFeatureId])

  // Handle node position changes (during drag - no snapping for smooth movement)
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes)

      // Update positions in the layout ref (not the DAG store)
      changes.forEach((change) => {
        if (change.type === 'position' && change.position && change.id) {
          layoutPositionsRef.current[change.id] = {
            x: change.position.x,
            y: change.position.y
          }
        }
      })
    },
    [onNodesChange]
  )

  // Snap to grid after drag ends
  const SNAP_GRID = 20
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Snap position to grid
      const snappedX = Math.round(node.position.x / SNAP_GRID) * SNAP_GRID
      const snappedY = Math.round(node.position.y / SNAP_GRID) * SNAP_GRID

      // Update node position to snapped value
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id ? { ...n, position: { x: snappedX, y: snappedY } } : n
        )
      )

      // Update layout ref with snapped position
      layoutPositionsRef.current[node.id] = { x: snappedX, y: snappedY }

      // Save layout to backend
      if (activeFeatureId) {
        window.electronAPI.dagLayout.save(activeFeatureId, layoutPositionsRef.current).catch((error) => {
          console.error('[DAGView] Failed to save layout:', error)
        })
      }
    },
    [setNodes, activeFeatureId]
  )

  // Handle new connections
  const handleConnect: OnConnect = useCallback(
    async (connection: Connection) => {
      if (connection.source && connection.target) {
        // Add to DAG store (with validation)
        // Don't add directly to React Flow - let event-driven updates handle it
        await addConnection({ from: connection.source, to: connection.target })
        // Note: If validation fails, addConnection will show an error toast
        // and the connection won't be added (no edge will appear)
      }
    },
    [addConnection]
  )

  // Handle edge changes including deletion
  const handleEdgesChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (changes: any[]) => {
      onEdgesChange(changes)

      // Handle edge removal
      changes.forEach((change) => {
        if (change.type === 'remove' && change.id) {
          const [from, to] = change.id.split('-')
          if (from && to) {
            removeConnection(from, to)
          }
        }
      })
    },
    [onEdgesChange, removeConnection]
  )

  // Panel toolbar element
  const panelToolbar = (
    <PanelToolbar
      activePanels={activePanels}
      onTogglePanel={togglePanel}
    />
  )

  // Overlay panels element - rendered on top of the graph
  const overlayPanels = activeFeatureId && activePanels.length > 0 && (
    <DockablePanel
      featureId={activeFeatureId}
      worktreePath={activeWorktreePath}
      layoutState={layoutState}
      onUpdatePosition={updatePanelPosition}
      onRemovePanel={removePanelFromLayout}
      onGroupPanels={groupPanels}
      onUngroupPanel={ungroupPanel}
      onSetActiveTab={setActiveTab}
      onUpdateGroupPosition={updateGroupPosition}
      onShowLogs={handleShowPMLogs}
      selectedTask={selectedTask || undefined}
      taskSession={selectedTaskSession}
      canStartTask={canStartTasks}
      onAbortLoop={handleAbortLoop}
      onStartTask={handleStartTask}
      onDeleteTask={handleDeleteTask}
      onClearLogs={handleClearLogs}
      onAbortTask={handleAbortTask}
    />
  )

  return (
    <div className="flex h-full overflow-hidden">
      {/* Panel toolbar - always on left */}
      {panelToolbar}

      {/* React Flow canvas */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 relative">
          {error && (
            <div className="absolute top-2 left-2 right-2 z-10 bg-[var(--color-error-dim)] text-[var(--color-error)] px-3 py-2 rounded-lg text-sm flex justify-between items-center">
              <span>
                <span className="font-medium">Error:</span> {error}
              </span>
              <button
                onClick={() => setError(null)}
                className="ml-2 hover:text-[var(--text-primary)] text-[var(--color-error)]"
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}
          <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={handleNodesChange}
                  onEdgesChange={handleEdgesChange}
                  onConnect={handleConnect}
                  onPaneClick={handlePaneClick}
                  onNodeClick={handleNodeClick}
                  onNodeDragStop={handleNodeDragStop}
                  onEdgeClick={(_event, edge) => handleSelectEdge(edge.source, edge.target)}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 1.5 }}
                  minZoom={0.25}
                  maxZoom={2}
                  nodesDraggable
                  translateExtent={[
                    [-5000, -5000],
                    [10000, 10000]
                  ]}
                  defaultEdgeOptions={{ animated: false }}
                  connectionLineStyle={{
                    stroke: '#00f0ff',
                    strokeWidth: 3
                  }}
                  className="!bg-[rgba(10,0,21,0.5)]"
                  proOptions={{ hideAttribution: true }}
                >
                  <svg style={{ position: 'absolute', top: 0, left: 0 }}>
                    <defs>
                      <marker
                        id="edge-arrow-default"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path
                          d="M 0 0 L 10 5 L 0 10 z"
                          fill="#a86ce6"
                        />
                      </marker>
                      <marker
                        id="edge-arrow-selected"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path
                          d="M 0 0 L 10 5 L 0 10 z"
                          fill="#00f0ff"
                        />
                      </marker>
                    </defs>
                  </svg>
                  <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(106, 80, 128, 0.5)" className="opacity-50" />
                  <Controls className="!bg-[var(--bg-surface)] !border-[var(--border-default)] [&>button]:!bg-[var(--bg-elevated)] [&>button]:!border-[var(--border-subtle)] [&>button]:!text-[var(--text-primary)] [&>button:hover]:!bg-[var(--bg-hover)]" />
                  <MiniMap
                    className="!bg-[var(--bg-surface)] !border-[var(--border-default)]"
                    nodeColor="#6a5080"
                    maskColor="rgba(10, 0, 21, 0.6)"
                  />
                </ReactFlow>
                {/* Layout controls */}
                <LayoutControls
                  featureId={activeFeatureId}
                  onNewTask={() => openNodeDialog(null)}
                  onAutoLayout={autoLayout}
                />

                {/* Mutation loading indicator */}
                {isMutating && (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md">
                    <span className="inline-block w-2 h-2 bg-[var(--color-warning)] rounded-full animate-pulse" />
                    <span className="text-sm text-[var(--text-secondary)]">Saving...</span>
                  </div>
                )}

                {/* Dockable panels overlay */}
                {overlayPanels}
        </div>

        {/* Control bar at bottom */}
        <div className="border-t border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2">
          <ExecutionControls
            featureId={activeFeatureId}
            onUndo={undo}
            onRedo={redo}
            canUndo={historyState.canUndo}
            canRedo={historyState.canRedo}
            onPlan={handlePlan}
            isPlanningInProgress={isAnalyzing}
          />
        </div>
      </div>

      {/* Node Dialog - only for creating new tasks */}
      {dialogTask === null && (
        <NodeDialog
          onCreate={handleCreateTask}
          onClose={closeNodeDialog}
        />
      )}

      {/* Session Log Dialog for task logs */}
      {logDialogOpen && logDialogTitle && logDialogSource === 'task' && (
        <SessionLogDialog session={taskSession} title={logDialogTitle} onClose={closeLogDialog} />
      )}

      {/* Log Dialog for PM logs */}
      {logDialogOpen && logDialogTitle && logDialogSource === 'pm' && (
        <LogDialog entries={logEntries} title={logDialogTitle} onClose={closeLogDialog} />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Task"
        message={`Delete "${deleteConfirm.taskTitle}"?\n\nThis will remove the task and all its connections.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDeleteTask}
        onCancel={() => setDeleteConfirm({ open: false, taskId: null, taskTitle: '' })}
      />

    </div>
  )
}

// Outer component wrapper
export default function DAGView(): JSX.Element {
  const { activeFeatureId, features } = useFeatureStore()
  const { loadDag, setCurrentFeatureForEvents, dag } = useDAGStore()
  const { execution, start } = useExecutionStore()
  const autoResumeAttemptedRef = useRef<string | null>(null)

  // Set feature for events IMMEDIATELY when feature changes (sync, before async loadDag)
  useEffect(() => {
    setCurrentFeatureForEvents(activeFeatureId)
  }, [activeFeatureId, setCurrentFeatureForEvents])

  // Load DAG when active feature changes
  useEffect(() => {
    if (activeFeatureId) {
      loadDag(activeFeatureId)
    }
  }, [activeFeatureId, loadDag])

  // Reset auto-resume tracking when feature changes
  useEffect(() => {
    autoResumeAttemptedRef.current = null
  }, [activeFeatureId])

  // Auto-resume: If feature has tasks in 'developing' or 'verifying' status, auto-start execution
  useEffect(() => {
    // Skip if already attempted for this feature or already running
    if (!activeFeatureId || !dag || execution.status === 'running') {
      return
    }

    // Only attempt auto-resume once per feature
    if (autoResumeAttemptedRef.current === activeFeatureId) {
      return
    }

    // Check if any tasks are in progress (developing or verifying)
    const inProgressTasks = dag.nodes.filter(
      task => task.status === 'developing' || task.status === 'verifying'
    )
    if (inProgressTasks.length === 0) {
      return
    }

    // Check if feature is active (not backlog/archived)
    const feature = features.find(f => f.id === activeFeatureId)
    if (!feature || feature.status !== 'active') {
      return
    }

    // Mark as attempted before starting
    autoResumeAttemptedRef.current = activeFeatureId
    start(activeFeatureId)
  }, [activeFeatureId, dag, execution.status, features, start])

  return (
    <div className="h-full">
      {activeFeatureId ? (
        <ReactFlowProvider>
          <DAGViewInner activeFeatureId={activeFeatureId} />
        </ReactFlowProvider>
      ) : (
        <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
          Select a feature to view its task graph
        </div>
      )}
    </div>
  )
}
