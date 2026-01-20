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

import { useFeatureStore } from '../stores/feature-store'
import { useDAGStore } from '../stores/dag-store'
import { useDialogStore } from '../stores/dialog-store'
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
import type { TaskLoopStatus } from '../../../main/dag-engine/orchestrator-types'
import { ResizeHandle } from '../components/Layout'
import { FeatureSidebar } from '../components/Feature'
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
function dagToNodes(
  dag: DAGGraph | null,
  loopStatuses: Record<string, TaskLoopStatus>,
  onEdit: (taskId: string) => void,
  onDelete: (taskId: string) => void,
  onLog: (taskId: string) => void,
  analyzingTaskId: string | null = null
): Node[] {
  if (!dag) return []

  return dag.nodes.map((task) => ({
    id: task.id,
    type: 'taskNode',
    position: task.position,
    data: {
      task,
      loopStatus: loopStatuses[task.id] || null,
      isBeingAnalyzed: task.id === analyzingTaskId,
      onEdit,
      onDelete,
      onLog
    } as TaskNodeData
  }))
}

// Convert DAG connections to React Flow edges
function dagToEdges(
  dag: DAGGraph | null,
  selectedEdgeId: string | null,
  onSelectEdge: (edgeId: string) => void,
  onDeleteEdge: (source: string, target: string) => void
): Edge[] {
  if (!dag) return []

  return dag.connections.map((conn) => {
    const edgeId = `${conn.from}-${conn.to}`
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
        selected: edgeId === selectedEdgeId,
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
  const {
    dag,
    loopStatuses,
    isMutating,
    error,
    setError,
    addNode,
    updateNode,
    addConnection,
    removeNode,
    removeConnection,
    setSelectedNode,
    historyState,
    undo,
    redo,
    autoLayout
  } = useDAGStore()
  const {
    nodeDialogOpen,
    nodeDialogTaskId,
    openNodeDialog,
    closeNodeDialog,
    logDialogOpen,
    logDialogTitle,
    logDialogTaskId,
    logDialogSource,
    openLogDialog,
    closeLogDialog
  } = useDialogStore()

  // React Flow instance for programmatic control (fitView, etc.)
  const { fitView } = useReactFlow()

  // Log entries for LogDialog (PM logs)
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])

  // Task session for SessionLogDialog
  const [taskSession, setTaskSession] = useState<DevAgentSession | null>(null)

  // Debounce timer for layout persistence
  const saveLayoutTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Track previous node count to only fit view when first node is added
  const prevNodeCountRef = useRef<number>(0)

  // Chat panel width state with localStorage persistence
  const [chatWidth, setChatWidth] = useState(() => {
    const saved = localStorage.getItem('dagent.chatPanelWidth')
    return saved ? parseInt(saved, 10) : 320
  })

  // Handle chat panel resize
  const handleChatResize = useCallback((deltaX: number) => {
    // For left-edge resize: negative deltaX (drag right) = smaller, positive (drag left) = larger
    setChatWidth((w) => Math.min(600, Math.max(280, w - deltaX)))
  }, [])

  // Persist width to localStorage when resize ends
  const handleChatResizeEnd = useCallback(() => {
    localStorage.setItem('dagent.chatPanelWidth', chatWidth.toString())
  }, [chatWidth])

  // Edge selection state
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; taskId: string | null; taskTitle: string }>({
    open: false,
    taskId: null,
    taskTitle: ''
  })

  // Currently analyzing task ID (for analysis animation)
  const [analyzingTaskId, setAnalyzingTaskId] = useState<string | null>(null)

  // Analysis state for ExecutionControls
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)
  const [pendingAnalysisCount, setPendingAnalysisCount] = useState<number>(0)

  // Handle edge selection
  const handleSelectEdge = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId)
  }, [])

  // Handle edge deletion
  const handleDeleteEdge = useCallback(
    (source: string, target: string) => {
      removeConnection(source, target)
      setSelectedEdgeId(null)
    },
    [removeConnection]
  )

  // Clear edge and node selection when clicking on pane
  const handlePaneClick = useCallback(() => {
    setSelectedEdgeId(null)
    setSelectedNode(null)
  }, [setSelectedNode])

  // Handle node click - select the task for PM agent context
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id)
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

  // Handlers for task node actions
  const handleEditTask = useCallback(
    (taskId: string) => {
      openNodeDialog(taskId)
    },
    [openNodeDialog]
  )

  // Handle save from dialog
  const handleDialogSave = useCallback(
    (updates: Partial<Task>) => {
      if (nodeDialogTaskId) {
        updateNode(nodeDialogTaskId, updates)
      }
    },
    [nodeDialogTaskId, updateNode]
  )

  // Handle create task from dialog
  const handleCreateTask = useCallback(
    async (title: string, description: string) => {
      if (!activeFeatureId) return

      // Create a new task directly in the DAG
      const newTask: Task = {
        id: `task-${Date.now()}`, // Temporary ID, DAGManager will assign proper one
        title,
        description,
        status: 'ready_for_dev',
        locked: false,
        position: { x: 0, y: 0 } // DAGManager will auto-place it
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

  // Handle log button click on task
  const handleLogTask = useCallback(
    async (taskId: string) => {
      const task = dag?.nodes.find((n) => n.id === taskId)
      const taskTitle = task?.title || 'Task'
      openLogDialog(`${taskTitle} Session`, taskId, 'task')

      // Load task session
      if (activeFeatureId) {
        try {
          const session = await window.electronAPI.storage.loadTaskSession(activeFeatureId, taskId)
          setTaskSession(session)
        } catch (error) {
          console.error('Failed to load task session:', error)
          setTaskSession(null)
        }
      }
    },
    [dag, activeFeatureId, openLogDialog]
  )

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

  // Handle analyze tasks button click
  const handleAnalyze = useCallback(async () => {
    if (!activeFeatureId) return

    try {
      setIsAnalyzing(true)
      const result = await window.electronAPI.analysis.start(activeFeatureId)
      if (!result.success) {
        toast.error(`Failed to start analysis: ${result.error}`)
        setIsAnalyzing(false)
      }
      // Analysis events will update state via the IPC listener
    } catch (error) {
      toast.error(`Failed to start analysis: ${(error as Error).message}`)
      setIsAnalyzing(false)
    }
  }, [activeFeatureId])

  // Convert DAG to React Flow format
  const initialNodes = useMemo(
    () => dagToNodes(dag, loopStatuses, handleEditTask, handleDeleteTask, handleLogTask, analyzingTaskId),
    [dag, loopStatuses, handleEditTask, handleDeleteTask, handleLogTask, analyzingTaskId]
  )
  const initialEdges = useMemo(
    () => dagToEdges(dag, selectedEdgeId, handleSelectEdge, handleDeleteEdge),
    [dag, selectedEdgeId, handleSelectEdge, handleDeleteEdge]
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

  // Fetch initial pending analysis count on feature change
  useEffect(() => {
    if (!activeFeatureId) {
      setPendingAnalysisCount(0)
      setIsAnalyzing(false)
      setAnalyzingTaskId(null)
      return
    }

    const fetchPendingCount = async (): Promise<void> => {
      try {
        const result = await window.electronAPI.analysis.pending(activeFeatureId)
        setPendingAnalysisCount(result.count)
        // Also check if analysis is currently running
        const statusResult = await window.electronAPI.analysis.status(activeFeatureId)
        setIsAnalyzing(statusResult.running)
      } catch (error) {
        console.error('[DAGView] Failed to fetch analysis status:', error)
        setPendingAnalysisCount(0)
        setIsAnalyzing(false)
      }
    }

    fetchPendingCount()
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
        // Task was kept as-is, decrement pending count
        setAnalyzingTaskId(null)
        setPendingAnalysisCount((prev) => Math.max(0, prev - 1))
      } else if (event.type === 'split') {
        // Task was split into subtasks, the original is gone but new ones may need analysis
        setAnalyzingTaskId(null)
        // Refresh pending count after split since new tasks were created
        window.electronAPI.analysis.pending(activeFeatureId).then((result) => {
          setPendingAnalysisCount(result.count)
        })
      } else if (event.type === 'error') {
        // Clear analyzing state on error
        setAnalyzingTaskId(null)
        setIsAnalyzing(false)
      } else if (event.type === 'complete') {
        // Analysis complete for feature, clear all state
        setAnalyzingTaskId(null)
        setIsAnalyzing(false)
        setPendingAnalysisCount(0)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [activeFeatureId])

  // Update nodes/edges when DAG or selection changes, merging in saved layout positions
  useEffect(() => {
    const nodeCount = dag?.nodes?.length ?? 0
    const prevNodeCount = prevNodeCountRef.current
    console.log(`[DAGViewInner] DAG changed, nodes: ${nodeCount}, updating React Flow`)
    const newNodes = dagToNodes(dag, loopStatuses, handleEditTask, handleDeleteTask, handleLogTask, analyzingTaskId).map((node) => {
      const savedPos = layoutPositionsRef.current[node.id]
      if (savedPos) {
        return { ...node, position: savedPos }
      }
      return node
    })
    console.log(`[DAGViewInner] Setting ${newNodes.length} nodes to React Flow`)
    setNodes(newNodes)
    setEdges(dagToEdges(dag, selectedEdgeId, handleSelectEdge, handleDeleteEdge))

    // Only fit view when going from 0 nodes to 1+ nodes (first node added)
    // This prevents the view from constantly re-centering during planning updates
    if (prevNodeCount === 0 && nodeCount > 0) {
      console.log('[DAGViewInner] First node added, fitting view')
      // Use setTimeout to ensure nodes are rendered before fitting
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 200 })
      }, 50)
    }

    // Update previous node count
    prevNodeCountRef.current = nodeCount
  }, [dag, loopStatuses, analyzingTaskId, handleEditTask, handleDeleteTask, handleLogTask, selectedEdgeId, handleSelectEdge, handleDeleteEdge, setNodes, setEdges, fitView])

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

  // Handle node position changes
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

      // Debounce layout save (500ms after last position change)
      if (activeFeatureId && changes.some((c) => c.type === 'position')) {
        if (saveLayoutTimerRef.current) {
          clearTimeout(saveLayoutTimerRef.current)
        }

        saveLayoutTimerRef.current = setTimeout(async () => {
          try {
            // Save positions from the ref
            await window.electronAPI.dagLayout.save(activeFeatureId, layoutPositionsRef.current)
          } catch (error) {
            console.error('[DAGView] Failed to save layout:', error)
          }
        }, 500)
      }
    },
    [onNodesChange, activeFeatureId]
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

  return (
    <div className="flex h-full overflow-hidden">
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
                  onEdgeClick={(_event, edge) => handleSelectEdge(edge.id)}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 1.5 }}
                  minZoom={0.25}
                  maxZoom={2}
                  nodesDraggable
                  snapToGrid={true}
                  snapGrid={[20, 20]}
                  translateExtent={[
                    [-500, -500],
                    [3000, 3000]
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
        </div>

        {/* Control bar at bottom */}
        <div className="border-t border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2">
          <ExecutionControls
            featureId={activeFeatureId}
            onUndo={undo}
            onRedo={redo}
            canUndo={historyState.canUndo}
            canRedo={historyState.canRedo}
            pendingAnalysisCount={pendingAnalysisCount}
            isAnalyzing={isAnalyzing}
            onAnalyze={handleAnalyze}
          />
        </div>
      </div>

      {/* Feature sidebar with tabs */}
      {activeFeatureId && (
        <div className="relative flex flex-col h-full" style={{ width: chatWidth }}>
          <ResizeHandle onResize={handleChatResize} onResizeEnd={handleChatResizeEnd} position="left" />
          <FeatureSidebar featureId={activeFeatureId} onShowLogs={handleShowPMLogs} />
        </div>
      )}

      {/* Node Dialog */}
      {dialogTask !== undefined && (
        <NodeDialog
          task={dialogTask}
          loopStatus={dialogTask ? loopStatuses[dialogTask.id] || null : null}
          onSave={handleDialogSave}
          onCreate={handleCreateTask}
          onClose={closeNodeDialog}
          onAbortLoop={handleAbortLoop}
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
  const { activeFeatureId } = useFeatureStore()
  const { loadDag, setCurrentFeatureForEvents } = useDAGStore()

  // Set feature for events IMMEDIATELY when feature changes (sync, before async loadDag)
  useEffect(() => {
    console.log(`[DAGView] Setting current feature for events: ${activeFeatureId}`)
    setCurrentFeatureForEvents(activeFeatureId)
  }, [activeFeatureId, setCurrentFeatureForEvents])

  // Load DAG when active feature changes
  useEffect(() => {
    console.log(`[DAGView] useEffect triggered, activeFeatureId=${activeFeatureId}`)
    if (activeFeatureId) {
      console.log(`[DAGView] Calling loadDag for ${activeFeatureId}`)
      loadDag(activeFeatureId)
    }
  }, [activeFeatureId, loadDag])

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
