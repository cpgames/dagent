/**
 * SelectableEdge - Custom edge component with selection, highlighting, and delete functionality.
 */
import { useState, type JSX } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position } from '@xyflow/react'
import './SelectableEdge.css'

// Theme colors for edge styling (CSS variables can't be used in inline SVG styles)
const EDGE_COLOR_DEFAULT = '#6a5080' // matches --text-muted
const EDGE_COLOR_SELECTED = '#00f0ff' // matches --accent-primary

export interface SelectableEdgeData {
  selected?: boolean
  onSelect?: (edgeId: string) => void
  onDelete?: (source: string, target: string) => void
  [key: string]: unknown // Index signature for React Flow compatibility
}

interface EdgeMarker {
  type: 'arrow' | 'arrowclosed'
  width?: number
  height?: number
  color?: string
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
  markerEnd?: string | EdgeMarker
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

  // Override marker color based on selection state
  const markerConfig: string | EdgeMarker | undefined =
    markerEnd && typeof markerEnd === 'object'
      ? {
          ...markerEnd,
          color: isSelected ? EDGE_COLOR_SELECTED : EDGE_COLOR_DEFAULT
        }
      : markerEnd

  return (
    <>
      {/* Visible edge with click handler */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerConfig as string}
        interactionWidth={20}
        style={{
          stroke: isSelected ? EDGE_COLOR_SELECTED : EDGE_COLOR_DEFAULT,
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
          className="edge-label nodrag nopan"
          onClick={handleEdgeClick}
        >
          {/* Delete button and confirm dialog */}
          {isSelected && (
            <div className="edge-delete-container" onClick={(e) => e.stopPropagation()}>
              {!showConfirm ? (
                <button
                  onClick={handleDeleteClick}
                  className="edge-delete-btn"
                  title="Delete connection"
                >
                  ×
                </button>
              ) : (
                <div className="edge-confirm-dialog">
                  <span className="edge-confirm-text">Remove dependency?</span>
                  <div className="edge-confirm-actions">
                    <button onClick={handleConfirmDelete} className="edge-confirm-btn edge-confirm-btn--delete">
                      Delete
                    </button>
                    <button onClick={handleCancelDelete} className="edge-confirm-btn edge-confirm-btn--cancel">
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
