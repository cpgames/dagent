/**
 * SelectableEdge - Custom edge component with selection, highlighting, and delete functionality.
 */
import { useState, type JSX } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position } from '@xyflow/react'

export interface SelectableEdgeData {
  selected?: boolean
  onSelect?: (edgeId: string) => void
  onDelete?: (source: string, target: string) => void
  [key: string]: unknown // Index signature for React Flow compatibility
}

interface SelectableEdgeProps {
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  source: string
  target: string
  data?: SelectableEdgeData
  markerEnd?: string
}

export default function SelectableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  target,
  data,
  markerEnd
}: SelectableEdgeProps): JSX.Element {
  const [showConfirm, setShowConfirm] = useState(false)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  })

  const isSelected = data?.selected ?? false

  const handleEdgeClick = (): void => {
    data?.onSelect?.(id)
  }

  const handleDeleteClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setShowConfirm(true)
  }

  const handleConfirmDelete = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (data?.onDelete) {
      data.onDelete(source, target)
    }
    setShowConfirm(false)
  }

  const handleCancelDelete = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setShowConfirm(false)
  }

  return (
    <>
      {/* Visible edge with click handler */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={20}
        style={{
          stroke: isSelected ? '#3B82F6' : '#6B7280',
          strokeWidth: isSelected ? 3 : 2,
          cursor: 'pointer',
          transition: 'stroke 0.15s, stroke-width 0.15s'
        }}
      />
      {/* Clickable overlay using EdgeLabelRenderer for reliable event handling */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            width: '40px',
            height: '40px',
            cursor: 'pointer',
            zIndex: isSelected ? 10 : 0
          }}
          className="nodrag nopan"
          onClick={handleEdgeClick}
        >
          {/* Delete button and confirm dialog */}
          {isSelected && (
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              onClick={(e) => e.stopPropagation()}
            >
              {!showConfirm ? (
                <button
                  onClick={handleDeleteClick}
                  className="w-6 h-6 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow-lg border border-red-700"
                  title="Delete connection"
                >
                  ×
                </button>
              ) : (
                <div className="bg-gray-800 border border-gray-600 rounded-lg p-2 shadow-xl flex flex-col gap-2 min-w-[140px]">
                  <span className="text-xs text-gray-300 text-center">Remove dependency?</span>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={handleConfirmDelete}
                      className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded"
                    >
                      Delete
                    </button>
                    <button
                      onClick={handleCancelDelete}
                      className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
