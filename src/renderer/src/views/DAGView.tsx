/**
 * DAGView - Displays features and their dependencies as a directed acyclic graph.
 * Shows task dependencies and execution flow using React Flow.
 */
import { useCallback, useEffect, useMemo, type JSX } from 'react'
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
import { TaskNode, FeatureTabs, NodeDialog, type TaskNodeData } from '../components/DAG'
import type { DAGGraph, Task } from '@shared/types'

// Register custom node types
const nodeTypes = {
  taskNode: TaskNode
}

// Convert DAG nodes to React Flow format
function dagToNodes(
  dag: DAGGraph | null,
  onEdit: (taskId: string) => void,
  onDelete: (taskId: string) => void
): Node[] {
  if (!dag) return []

  return dag.nodes.map((task) => ({
    id: task.id,
    type: 'taskNode',
    position: task.position,
    data: {
      task,
      onEdit,
      onDelete
    } as TaskNodeData
  }))
}

// Convert DAG connections to React Flow edges
function dagToEdges(dag: DAGGraph | null): Edge[] {
  if (!dag) return []

  return dag.connections.map((conn) => ({
    id: `${conn.from}-${conn.to}`,
    source: conn.from,
    target: conn.to,
    animated: false,
    style: { stroke: '#6B7280', strokeWidth: 2 }
  }))
}

export default function DAGView(): JSX.Element {
  const { features, activeFeatureId, setActiveFeature } = useFeatureStore()
  const { dag, loadDag, updateNode, addConnection, removeNode, removeConnection } = useDAGStore()
  const { nodeDialogOpen, nodeDialogTaskId, openNodeDialog, closeNodeDialog } = useDialogStore()

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

  // Convert DAG to React Flow format
  const initialNodes = useMemo(
    () => dagToNodes(dag, handleEditTask, handleDeleteTask),
    [dag, handleEditTask, handleDeleteTask]
  )
  const initialEdges = useMemo(() => dagToEdges(dag), [dag])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes/edges when DAG changes
  useEffect(() => {
    setNodes(dagToNodes(dag, handleEditTask, handleDeleteTask))
    setEdges(dagToEdges(dag))
  }, [dag, handleEditTask, handleDeleteTask, setNodes, setEdges])

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

      {/* React Flow canvas */}
      <div className="flex-1 bg-gray-900">
        {activeFeatureId ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            nodeTypes={nodeTypes}
            fitView
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
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a feature to view its task graph
          </div>
        )}
      </div>

      {/* Control bar at bottom */}
      <div className="border-t border-gray-700 bg-gray-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            disabled
            className="px-3 py-1.5 rounded text-sm bg-gray-700 text-gray-400 cursor-not-allowed"
            title="Execute tasks (coming soon)"
          >
            <svg
              className="w-4 h-4 inline-block mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Play
          </button>
          <button
            disabled
            className="px-3 py-1.5 rounded text-sm bg-gray-700 text-gray-400 cursor-not-allowed"
            title="Stop execution (coming soon)"
          >
            <svg
              className="w-4 h-4 inline-block mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
              />
            </svg>
            Stop
          </button>
          <div className="border-l border-gray-600 mx-2 h-6" />
          <button
            disabled
            className="px-3 py-1.5 rounded text-sm bg-gray-700 text-gray-400 cursor-not-allowed"
            title="Undo (coming soon)"
          >
            <svg
              className="w-4 h-4 inline-block mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
            Undo
          </button>
          <button
            disabled
            className="px-3 py-1.5 rounded text-sm bg-gray-700 text-gray-400 cursor-not-allowed"
            title="Redo (coming soon)"
          >
            <svg
              className="w-4 h-4 inline-block mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
              />
            </svg>
            Redo
          </button>
        </div>
      </div>

      {/* Node Dialog */}
      {dialogTask && (
        <NodeDialog task={dialogTask} onSave={handleDialogSave} onClose={closeNodeDialog} />
      )}
    </div>
  )
}
