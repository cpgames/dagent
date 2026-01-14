/**
 * DAGView - Displays features and their dependencies as a directed acyclic graph.
 * Shows task dependencies and execution flow using React Flow.
 */
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
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
  FeatureTabs,
  NodeDialog,
  ExecutionControls,
  SelectableEdge,
  type TaskNodeData,
  type SelectableEdgeData
} from '../components/DAG'
import { FeatureChat, TaskChat } from '../components/Chat'
import { ResizeHandle } from '../components/Layout'
import type { DAGGraph, Task } from '@shared/types'

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
  onEdit: (taskId: string) => void,
  onDelete: (taskId: string) => void,
  onChat: (taskId: string) => void
): Node[] {
  if (!dag) return []

  return dag.nodes.map((task) => ({
    id: task.id,
    type: 'taskNode',
    position: task.position,
    data: {
      task,
      onEdit,
      onDelete,
      onChat
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
      data: {
        selected: edgeId === selectedEdgeId,
        onSelect: onSelectEdge,
        onDelete: onDeleteEdge
      } as SelectableEdgeData
    }
  })
}

export default function DAGView(): JSX.Element {
  const { features, activeFeatureId, setActiveFeature } = useFeatureStore()
  const {
    dag,
    isMutating,
    error,
    setError,
    loadDag,
    updateNode,
    addConnection,
    removeNode,
    removeConnection,
    historyState,
    undo,
    redo
  } = useDAGStore()
  const {
    nodeDialogOpen,
    nodeDialogTaskId,
    openNodeDialog,
    closeNodeDialog,
    taskChatOpen,
    taskChatTaskId,
    taskChatFeatureId,
    openTaskChat
  } = useDialogStore()

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

  // Clear edge selection when clicking on pane
  const handlePaneClick = useCallback(() => {
    setSelectedEdgeId(null)
  }, [])

  // Find the task for the open dialog
  const dialogTask = useMemo(() => {
    if (!nodeDialogOpen || !nodeDialogTaskId || !dag) return null
    return dag.nodes.find((n) => n.id === nodeDialogTaskId) || null
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

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      removeNode(taskId)
    },
    [removeNode]
  )

  const handleChatTask = useCallback(
    (taskId: string) => {
      if (activeFeatureId) {
        openTaskChat(taskId, activeFeatureId)
      }
    },
    [activeFeatureId, openTaskChat]
  )

  // Convert DAG to React Flow format
  const initialNodes = useMemo(
    () => dagToNodes(dag, handleEditTask, handleDeleteTask, handleChatTask),
    [dag, handleEditTask, handleDeleteTask, handleChatTask]
  )
  const initialEdges = useMemo(
    () => dagToEdges(dag, selectedEdgeId, handleSelectEdge, handleDeleteEdge),
    [dag, selectedEdgeId, handleSelectEdge, handleDeleteEdge]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes/edges when DAG or selection changes
  useEffect(() => {
    setNodes(dagToNodes(dag, handleEditTask, handleDeleteTask, handleChatTask))
    setEdges(dagToEdges(dag, selectedEdgeId, handleSelectEdge, handleDeleteEdge))
  }, [dag, handleEditTask, handleDeleteTask, handleChatTask, selectedEdgeId, handleSelectEdge, handleDeleteEdge, setNodes, setEdges])

  // Load DAG when active feature changes
  useEffect(() => {
    if (activeFeatureId) {
      loadDag(activeFeatureId)
    }
  }, [activeFeatureId, loadDag])

  // Handle node position changes
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes)

      // Update positions in DAG store
      changes.forEach((change) => {
        if (change.type === 'position' && change.position && change.id) {
          updateNode(change.id, {
            position: { x: change.position.x, y: change.position.y }
          })
        }
      })
    },
    [onNodesChange, updateNode]
  )

  // Handle new connections
  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        // Add to React Flow state
        setEdges((eds) => addEdge(connection, eds))
        // Add to DAG store
        addConnection({ from: connection.source, to: connection.target })
      }
    },
    [setEdges, addConnection]
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
    <div className="flex flex-col h-full">
      {/* Feature tabs at top */}
      <div className="border-b border-gray-700 bg-gray-900">
        <FeatureTabs
          features={features}
          activeFeatureId={activeFeatureId}
          onSelectFeature={setActiveFeature}
        />
      </div>

      {/* Main content area: React Flow canvas + Chat sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* React Flow canvas */}
        <div className="flex-1 flex flex-col bg-gray-900">
          <div className="flex-1 relative">
            {activeFeatureId ? (
              <>
                {error && (
                  <div className="absolute top-2 left-2 right-2 z-10 bg-red-900/90 text-red-100 px-3 py-2 rounded-lg text-sm flex justify-between items-center">
                    <span>
                      <span className="font-medium">Error:</span> {error}
                    </span>
                    <button
                      onClick={() => setError(null)}
                      className="ml-2 hover:text-white text-red-200"
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
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 1.5 }}
                  minZoom={0.25}
                  maxZoom={2}
                  nodesDraggable
                  className="bg-gray-900"
                  proOptions={{ hideAttribution: true }}
                >
                  <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#374151" />
                  <Controls className="!bg-gray-800 !border-gray-700 [&>button]:!bg-gray-700 [&>button]:!border-gray-600 [&>button]:!text-white [&>button:hover]:!bg-gray-600" />
                  <MiniMap
                    className="!bg-gray-800 !border-gray-700"
                    nodeColor="#4B5563"
                    maskColor="rgba(0, 0, 0, 0.5)"
                  />
                </ReactFlow>
                {/* Mutation loading indicator */}
                {isMutating && (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md">
                    <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                    <span className="text-sm text-gray-300">Saving...</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                Select a feature to view its task graph
              </div>
            )}
          </div>

          {/* Control bar at bottom */}
          <div className="border-t border-gray-700 bg-gray-800 px-4 py-2">
            <ExecutionControls
              featureId={activeFeatureId}
              onUndo={undo}
              onRedo={redo}
              canUndo={historyState.canUndo}
              canRedo={historyState.canRedo}
            />
          </div>
        </div>

        {/* Chat sidebar with overlay support */}
        {activeFeatureId && (
          <div className="relative" style={{ width: chatWidth }}>
            <ResizeHandle onResize={handleChatResize} onResizeEnd={handleChatResizeEnd} position="left" />
            <FeatureChat featureId={activeFeatureId} />
            {taskChatOpen && taskChatTaskId && taskChatFeatureId && (
              <TaskChat taskId={taskChatTaskId} featureId={taskChatFeatureId} />
            )}
          </div>
        )}
      </div>

      {/* Node Dialog */}
      {dialogTask && (
        <NodeDialog task={dialogTask} onSave={handleDialogSave} onClose={closeNodeDialog} />
      )}
    </div>
  )
}
