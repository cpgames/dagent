import { useState, useCallback, useRef, useEffect, type JSX } from 'react'
import { FeatureDescription } from './FeatureDescription'
import { FeatureSpecViewer } from './FeatureSpecViewer'
import { FeatureChat } from '../Chat'
import { TaskDetailsPanel } from '../DAG/TaskDetailsPanel'
import type { Task, DevAgentSession } from '@shared/types'
import {
  type PanelLayoutState,
  type PanelPosition,
  type PanelGroup,
  type SnapPosition,
  getSnapPositionStyle,
  detectSnapZone
} from './usePanelLayout'
import './DockablePanel.css'

// Panel types that can be docked
export type PanelId = 'description' | 'spec' | 'chat' | 'task'

// Panel configuration
const PANEL_CONFIGS: Record<PanelId, { title: string; defaultWidth: number; defaultHeight: number; minWidth: number; minHeight: number }> = {
  description: { title: 'Description', defaultWidth: 380, defaultHeight: 300, minWidth: 250, minHeight: 150 },
  spec: { title: 'Spec', defaultWidth: 400, defaultHeight: 400, minWidth: 300, minHeight: 200 },
  chat: { title: 'Chat', defaultWidth: 380, defaultHeight: 450, minWidth: 280, minHeight: 250 },
  task: { title: 'Task Editor', defaultWidth: 400, defaultHeight: 350, minWidth: 300, minHeight: 200 }
}

export interface DockablePanelProps {
  featureId: string
  worktreePath?: string
  layoutState: PanelLayoutState
  onUpdatePosition: (panelId: PanelId, position: PanelPosition) => void
  onRemovePanel: (panelId: PanelId) => void
  onGroupPanels: (panelId1: PanelId, panelId2: PanelId) => void
  onUngroupPanel: (panelId: PanelId) => void
  onSetActiveTab: (groupId: string, panelId: PanelId) => void
  onUpdateGroupPosition: (groupId: string, position: PanelPosition) => void
  onBringPanelToFront: (panelId: PanelId) => void
  onBringGroupToFront: (groupId: string) => void
  onShowLogs?: () => void
  // Task details props
  selectedTask?: Task | null
  taskSession?: DevAgentSession | null
  canStartTask?: boolean
  onAbortLoop?: (taskId: string) => void
  onStartTask?: (taskId: string) => void
  onDeleteTask?: (taskId: string) => void
  onClearLogs?: (taskId: string) => void
  onAbortTask?: (taskId: string) => void
}

// Icons
const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

interface DragState {
  type: 'panel' | 'tab' | 'group'
  panelId: PanelId
  groupId?: string // If dragging a group or tab from a group
  startX: number
  startY: number
  startPanelX: number
  startPanelY: number
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface ResizeState {
  type: 'panel' | 'group'
  panelId?: PanelId
  groupId?: string
  direction: ResizeDirection
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  startPanelX: number
  startPanelY: number
}

// Track panel positions for drop detection
interface PanelBounds {
  panelId?: PanelId
  groupId?: string
  x: number
  y: number
  width: number
  height: number
}

export function DockablePanel({
  featureId,
  worktreePath,
  layoutState,
  onUpdatePosition,
  onRemovePanel,
  onGroupPanels,
  onUngroupPanel,
  onSetActiveTab,
  onUpdateGroupPosition,
  onBringPanelToFront,
  onBringGroupToFront,
  onShowLogs,
  selectedTask,
  taskSession,
  canStartTask,
  onAbortLoop,
  onStartTask,
  onDeleteTask,
  onClearLogs,
  onAbortTask
}: DockablePanelProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dragStarted, setDragStarted] = useState(false) // True after mouse moves past threshold
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null)
  const [hoverSnapZone, setHoverSnapZone] = useState<SnapPosition | null>(null)
  const [hoverDropTarget, setHoverDropTarget] = useState<{ panelId?: PanelId; groupId?: string } | null>(null)
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)
  const [resizeSize, setResizeSize] = useState<{ width: number; height: number } | null>(null)
  const [resizePosition, setResizePosition] = useState<{ x: number; y: number } | null>(null)
  const panelBoundsRef = useRef<PanelBounds[]>([])
  // Refs for drag state to avoid re-renders during drag
  const dragPositionRef = useRef<{ x: number; y: number } | null>(null)
  const hoverSnapZoneRef = useRef<SnapPosition | null>(null)
  const hoverDropTargetRef = useRef<{ panelId?: PanelId; groupId?: string } | null>(null)
  const rafIdRef = useRef<number | null>(null)

  // Drag threshold in pixels - must move this far before drag starts
  const DRAG_THRESHOLD = 5

  // Track container size
  useEffect(() => {
    if (!containerRef.current) return

    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        })
      }
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [])

  // Get dimensions for a panel or group
  const getDimensions = useCallback((panelId?: PanelId, groupId?: string): { width: number; height: number } => {
    if (groupId) {
      const group = layoutState.groups.find(g => g.id === groupId)
      const activePanel = group?.activePanel || group?.panels[0]
      if (activePanel) {
        const config = PANEL_CONFIGS[activePanel]
        return {
          width: group?.position.width || config.defaultWidth,
          height: group?.position.height || config.defaultHeight
        }
      }
    }
    if (panelId) {
      const position = layoutState.standalone[panelId]
      const config = PANEL_CONFIGS[panelId]
      return {
        width: position?.width || config.defaultWidth,
        height: position?.height || config.defaultHeight
      }
    }
    return { width: 400, height: 300 }
  }, [layoutState])

  // Check if a point intersects with a panel/group (for drop detection)
  const findDropTarget = useCallback((x: number, y: number, excludePanelId?: PanelId, excludeGroupId?: string): { panelId?: PanelId; groupId?: string } | null => {
    for (const bounds of panelBoundsRef.current) {
      // Skip the panel being dragged
      if (bounds.panelId && bounds.panelId === excludePanelId) continue
      if (bounds.groupId && bounds.groupId === excludeGroupId) continue

      // Check intersection
      if (x >= bounds.x && x <= bounds.x + bounds.width &&
          y >= bounds.y && y <= bounds.y + bounds.height) {
        return { panelId: bounds.panelId, groupId: bounds.groupId }
      }
    }
    return null
  }, [])

  // Handle mouse move during drag
  useEffect(() => {
    if (!dragState) return

    const { width: panelWidth, height: panelHeight } = getDimensions(
      dragState.type === 'panel' || dragState.type === 'tab' ? dragState.panelId : undefined,
      dragState.type === 'group' ? dragState.groupId : undefined
    )

    let hasDragStarted = dragStarted

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragState.startX
      const deltaY = e.clientY - dragState.startY

      // Check if we've passed the drag threshold
      if (!hasDragStarted) {
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        if (distance < DRAG_THRESHOLD) {
          return // Haven't moved enough yet
        }
        hasDragStarted = true
        setDragStarted(true)
      }

      const newX = dragState.startPanelX + deltaX
      const newY = dragState.startPanelY + deltaY

      // Store in ref for immediate use
      dragPositionRef.current = { x: newX, y: newY }

      // Check for drop target (another panel/group)
      const centerX = newX + panelWidth / 2
      const centerY = newY + panelHeight / 2
      const dropTarget = findDropTarget(
        centerX,
        centerY,
        dragState.panelId,
        dragState.groupId
      )
      hoverDropTargetRef.current = dropTarget

      // Only show snap zones if not hovering over a panel
      if (!dropTarget) {
        const snapZone = detectSnapZone(
          newX,
          newY,
          panelWidth,
          panelHeight,
          containerSize.width,
          containerSize.height
        )
        hoverSnapZoneRef.current = snapZone
      } else {
        hoverSnapZoneRef.current = null
      }

      // Batch state updates with RAF to avoid multiple re-renders
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null
          setDragPosition(dragPositionRef.current)
          setHoverDropTarget(hoverDropTargetRef.current)
          setHoverSnapZone(hoverSnapZoneRef.current)
        })
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragState) return

      // If drag never started (threshold not crossed), just clean up
      if (!hasDragStarted) {
        setDragState(null)
        setDragPosition(null)
        setDragStarted(false)
        return
      }

      const deltaX = e.clientX - dragState.startX
      const deltaY = e.clientY - dragState.startY
      const finalX = dragState.startPanelX + deltaX
      const finalY = dragState.startPanelY + deltaY

      // Check if dropping on another panel (for grouping)
      const centerX = finalX + panelWidth / 2
      const centerY = finalY + panelHeight / 2
      const dropTarget = findDropTarget(centerX, centerY, dragState.panelId, dragState.groupId)

      if (dropTarget && dragState.type === 'panel') {
        // Group panels
        if (dropTarget.panelId) {
          onGroupPanels(dragState.panelId, dropTarget.panelId)
        } else if (dropTarget.groupId) {
          // Find any panel in the target group to merge with
          const targetGroup = layoutState.groups.find(g => g.id === dropTarget.groupId)
          if (targetGroup && targetGroup.panels.length > 0) {
            onGroupPanels(dragState.panelId, targetGroup.panels[0])
          }
        }
      } else if (dropTarget && dragState.type === 'tab') {
        // Ungroup first, then group with new target
        onUngroupPanel(dragState.panelId)
        setTimeout(() => {
          if (dropTarget.panelId) {
            onGroupPanels(dragState.panelId, dropTarget.panelId)
          } else if (dropTarget.groupId) {
            const targetGroup = layoutState.groups.find(g => g.id === dropTarget.groupId)
            if (targetGroup && targetGroup.panels.length > 0) {
              onGroupPanels(dragState.panelId, targetGroup.panels[0])
            }
          }
        }, 0)
      } else if (dragState.type === 'tab' && !dropTarget) {
        // Tab dragged out - only ungroup if mouse moved OUTSIDE the header area
        // The header/tab bar is approximately 40px tall
        const HEADER_HEIGHT = 40
        const deltaX = e.clientX - dragState.startX
        const deltaY = e.clientY - dragState.startY

        // Ungroup if:
        // 1. Dragged down past the header (below tab bar)
        // 2. Dragged up above the panel (above header)
        // 3. Dragged horizontally far enough to leave panel bounds
        const draggedBelowHeader = deltaY > HEADER_HEIGHT
        const draggedAbovePanel = deltaY < -10
        const draggedOutsideHorizontally = Math.abs(deltaX) > panelWidth / 2

        if (draggedBelowHeader || draggedAbovePanel || draggedOutsideHorizontally) {
          // Dragged outside header - ungroup the tab
          onUngroupPanel(dragState.panelId)
          setTimeout(() => {
            const snapZone = detectSnapZone(
              finalX,
              finalY,
              panelWidth,
              panelHeight,
              containerSize.width,
              containerSize.height
            )
            if (snapZone) {
              onUpdatePosition(dragState.panelId, { snap: snapZone, x: 0, y: 0 })
            } else {
              onUpdatePosition(dragState.panelId, { x: finalX, y: finalY })
            }
          }, 0)
        } else if (dragState.groupId) {
          // Still within header area - move the entire group instead
          const group = layoutState.groups.find(g => g.id === dragState.groupId)
          const snapZone = detectSnapZone(
            finalX,
            finalY,
            panelWidth,
            panelHeight,
            containerSize.width,
            containerSize.height
          )
          if (snapZone) {
            onUpdateGroupPosition(dragState.groupId, {
              snap: snapZone,
              x: 0,
              y: 0,
              width: group?.position.width,
              height: group?.position.height
            })
          } else {
            onUpdateGroupPosition(dragState.groupId, {
              x: finalX,
              y: finalY,
              width: group?.position.width,
              height: group?.position.height
            })
          }
        }
      } else {
        // Regular drag - update position
        const snapZone = detectSnapZone(
          finalX,
          finalY,
          panelWidth,
          panelHeight,
          containerSize.width,
          containerSize.height
        )

        if (dragState.type === 'group' && dragState.groupId) {
          const group = layoutState.groups.find(g => g.id === dragState.groupId)
          if (snapZone) {
            onUpdateGroupPosition(dragState.groupId, {
              snap: snapZone,
              x: 0,
              y: 0,
              width: group?.position.width,
              height: group?.position.height
            })
          } else {
            onUpdateGroupPosition(dragState.groupId, {
              x: finalX,
              y: finalY,
              width: group?.position.width,
              height: group?.position.height
            })
          }
        } else if (dragState.type === 'panel') {
          const currentPosition = layoutState.standalone[dragState.panelId]
          if (snapZone) {
            onUpdatePosition(dragState.panelId, {
              snap: snapZone,
              x: 0,
              y: 0,
              width: currentPosition?.width,
              height: currentPosition?.height
            })
          } else {
            onUpdatePosition(dragState.panelId, {
              x: finalX,
              y: finalY,
              width: currentPosition?.width,
              height: currentPosition?.height
            })
          }
        }
      }

      // Cancel any pending RAF
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      // Clear refs
      dragPositionRef.current = null
      hoverSnapZoneRef.current = null
      hoverDropTargetRef.current = null

      setDragState(null)
      setDragPosition(null)
      setDragStarted(false)
      setHoverSnapZone(null)
      setHoverDropTarget(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      // Cancel any pending RAF on cleanup
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [dragState, dragStarted, containerSize, onUpdatePosition, onUpdateGroupPosition, onGroupPanels, onUngroupPanel, layoutState, getDimensions, findDropTarget, DRAG_THRESHOLD])

  // Handle mouse move during resize
  useEffect(() => {
    if (!resizeState) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeState.startX
      const deltaY = e.clientY - resizeState.startY

      // Get min dimensions
      let minWidth = 200
      let minHeight = 150
      if (resizeState.panelId) {
        const config = PANEL_CONFIGS[resizeState.panelId]
        minWidth = config.minWidth
        minHeight = config.minHeight
      } else if (resizeState.groupId) {
        const group = layoutState.groups.find(g => g.id === resizeState.groupId)
        if (group && group.activePanel) {
          const config = PANEL_CONFIGS[group.activePanel]
          minWidth = config.minWidth
          minHeight = config.minHeight
        }
      }

      let newWidth = resizeState.startWidth
      let newHeight = resizeState.startHeight
      let newX = resizeState.startPanelX
      let newY = resizeState.startPanelY

      if (resizeState.direction.includes('e')) {
        newWidth = Math.max(minWidth, resizeState.startWidth + deltaX)
      }
      if (resizeState.direction.includes('w')) {
        const widthDelta = Math.min(deltaX, resizeState.startWidth - minWidth)
        newWidth = resizeState.startWidth - widthDelta
        newX = resizeState.startPanelX + widthDelta
      }
      if (resizeState.direction.includes('s')) {
        newHeight = Math.max(minHeight, resizeState.startHeight + deltaY)
      }
      if (resizeState.direction.includes('n')) {
        const heightDelta = Math.min(deltaY, resizeState.startHeight - minHeight)
        newHeight = resizeState.startHeight - heightDelta
        newY = resizeState.startPanelY + heightDelta
      }

      setResizeSize({ width: newWidth, height: newHeight })
      setResizePosition({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      if (!resizeState || !resizeSize) return

      if (resizeState.type === 'group' && resizeState.groupId) {
        onUpdateGroupPosition(resizeState.groupId, {
          x: resizePosition?.x ?? 0,
          y: resizePosition?.y ?? 0,
          width: resizeSize.width,
          height: resizeSize.height
        })
      } else if (resizeState.type === 'panel' && resizeState.panelId) {
        const currentPosition = layoutState.standalone[resizeState.panelId]
        onUpdatePosition(resizeState.panelId, {
          ...currentPosition,
          x: resizePosition?.x ?? currentPosition?.x ?? 0,
          y: resizePosition?.y ?? currentPosition?.y ?? 0,
          width: resizeSize.width,
          height: resizeSize.height,
          snap: undefined
        })
      }

      setResizeState(null)
      setResizeSize(null)
      setResizePosition(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizeState, resizeSize, resizePosition, onUpdatePosition, onUpdateGroupPosition, layoutState])

  // Start dragging a standalone panel
  const handlePanelMouseDown = useCallback(
    (e: React.MouseEvent, panelId: PanelId) => {
      e.preventDefault()
      const position = layoutState.standalone[panelId]
      if (!position) return

      const config = PANEL_CONFIGS[panelId]
      const panelWidth = position.width || config.defaultWidth
      const panelHeight = position.height || config.defaultHeight
      let startPanelX: number
      let startPanelY: number

      if (position.snap) {
        const snapPos = getSnapPositionStyle(
          position.snap,
          containerSize.width,
          containerSize.height,
          panelWidth,
          panelHeight
        )
        startPanelX = snapPos.x
        startPanelY = snapPos.y
      } else {
        startPanelX = position.x
        startPanelY = position.y
      }

      setDragState({
        type: 'panel',
        panelId,
        startX: e.clientX,
        startY: e.clientY,
        startPanelX,
        startPanelY
      })
      setDragPosition({ x: startPanelX, y: startPanelY })
    },
    [layoutState.standalone, containerSize]
  )

  // Start dragging a group (from header)
  const handleGroupMouseDown = useCallback(
    (e: React.MouseEvent, groupId: string) => {
      e.preventDefault()
      const group = layoutState.groups.find(g => g.id === groupId)
      if (!group) return

      const activePanel = group.activePanel || group.panels[0]
      const config = PANEL_CONFIGS[activePanel]
      const panelWidth = group.position.width || config.defaultWidth
      const panelHeight = group.position.height || config.defaultHeight
      let startPanelX: number
      let startPanelY: number

      if (group.position.snap) {
        const snapPos = getSnapPositionStyle(
          group.position.snap,
          containerSize.width,
          containerSize.height,
          panelWidth,
          panelHeight
        )
        startPanelX = snapPos.x
        startPanelY = snapPos.y
      } else {
        startPanelX = group.position.x
        startPanelY = group.position.y
      }

      setDragState({
        type: 'group',
        panelId: activePanel,
        groupId,
        startX: e.clientX,
        startY: e.clientY,
        startPanelX,
        startPanelY
      })
      setDragPosition({ x: startPanelX, y: startPanelY })
    },
    [layoutState.groups, containerSize]
  )

  // Start dragging a tab (to ungroup)
  const handleTabMouseDown = useCallback(
    (e: React.MouseEvent, panelId: PanelId, groupId: string) => {
      e.preventDefault()
      e.stopPropagation()

      const group = layoutState.groups.find(g => g.id === groupId)
      if (!group) return

      const config = PANEL_CONFIGS[panelId]
      const panelWidth = group.position.width || config.defaultWidth
      const panelHeight = group.position.height || config.defaultHeight
      let startPanelX: number
      let startPanelY: number

      if (group.position.snap) {
        const snapPos = getSnapPositionStyle(
          group.position.snap,
          containerSize.width,
          containerSize.height,
          panelWidth,
          panelHeight
        )
        startPanelX = snapPos.x
        startPanelY = snapPos.y
      } else {
        startPanelX = group.position.x
        startPanelY = group.position.y
      }

      setDragState({
        type: 'tab',
        panelId,
        groupId,
        startX: e.clientX,
        startY: e.clientY,
        startPanelX,
        startPanelY
      })
      setDragPosition({ x: startPanelX, y: startPanelY })
    },
    [layoutState.groups, containerSize]
  )

  // Start resizing
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, panelId: PanelId | undefined, groupId: string | undefined, direction: ResizeDirection) => {
      e.preventDefault()
      e.stopPropagation()

      let position: PanelPosition | null = null
      let currentWidth = 400
      let currentHeight = 300

      if (groupId) {
        const group = layoutState.groups.find(g => g.id === groupId)
        if (!group) return
        position = group.position
        const activePanel = group.activePanel || group.panels[0]
        const config = PANEL_CONFIGS[activePanel]
        currentWidth = position.width || config.defaultWidth
        currentHeight = position.height || config.defaultHeight
      } else if (panelId) {
        position = layoutState.standalone[panelId]
        if (!position) return
        const config = PANEL_CONFIGS[panelId]
        currentWidth = position.width || config.defaultWidth
        currentHeight = position.height || config.defaultHeight
      }

      if (!position) return

      let startPanelX: number
      let startPanelY: number

      if (position.snap) {
        const snapPos = getSnapPositionStyle(
          position.snap,
          containerSize.width,
          containerSize.height,
          currentWidth,
          currentHeight
        )
        startPanelX = snapPos.x
        startPanelY = snapPos.y
      } else {
        startPanelX = position.x
        startPanelY = position.y
      }

      setResizeState({
        type: groupId ? 'group' : 'panel',
        panelId,
        groupId,
        direction,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: currentWidth,
        startHeight: currentHeight,
        startPanelX,
        startPanelY
      })
      setResizeSize({ width: currentWidth, height: currentHeight })
      setResizePosition({ x: startPanelX, y: startPanelY })
    },
    [layoutState, containerSize]
  )

  // Render panel content
  const renderPanelContent = (panelId: PanelId): JSX.Element => {
    switch (panelId) {
      case 'description':
        return <FeatureDescription featureId={featureId} />
      case 'spec':
        return <FeatureSpecViewer featureId={featureId} className="h-full" />
      case 'chat':
        return <FeatureChat featureId={featureId} onShowLogs={onShowLogs} />
      case 'task':
        return selectedTask ? (
          <TaskDetailsPanel
            task={selectedTask}
            session={taskSession}
            canStartTask={canStartTask}
            worktreePath={worktreePath}
            onAbortLoop={onAbortLoop}
            onStartTask={onStartTask}
            onDeleteTask={onDeleteTask}
            onClearLogs={onClearLogs}
            onAbortTask={onAbortTask}
          />
        ) : (
          <div className="dockable-panel__empty">No task selected</div>
        )
      default:
        return <div>Unknown panel</div>
    }
  }

  // Render resize handles
  const renderResizeHandles = (panelId: PanelId | undefined, groupId: string | undefined): JSX.Element => {
    const directions: ResizeDirection[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

    return (
      <>
        {directions.map((dir) => (
          <div
            key={dir}
            className={`dockable-panel__resize-handle dockable-panel__resize-handle--${dir}`}
            onMouseDown={(e) => handleResizeStart(e, panelId, groupId, dir)}
          />
        ))}
      </>
    )
  }

  // Constrain position and size to keep panel visible within container
  // Scales down panels that are too large for the viewport
  const constrainToViewport = useCallback((
    x: number,
    y: number,
    panelWidth: number,
    panelHeight: number,
    minWidth: number,
    minHeight: number
  ): { x: number; y: number; width: number; height: number } => {
    if (containerSize.width === 0 || containerSize.height === 0) {
      return { x, y, width: panelWidth, height: panelHeight }
    }

    const padding = 8
    const maxWidth = containerSize.width - padding * 2
    const maxHeight = containerSize.height - padding * 2

    // Scale down dimensions if too large for container
    let constrainedWidth = panelWidth
    let constrainedHeight = panelHeight

    if (constrainedWidth > maxWidth) {
      constrainedWidth = Math.max(minWidth, maxWidth)
    }
    if (constrainedHeight > maxHeight) {
      constrainedHeight = Math.max(minHeight, maxHeight)
    }

    // Constrain X position
    let constrainedX = x
    // Don't go past left edge
    if (constrainedX < padding) {
      constrainedX = padding
    }
    // Don't go past right edge
    if (constrainedX + constrainedWidth > containerSize.width - padding) {
      constrainedX = containerSize.width - constrainedWidth - padding
    }
    // Final check: ensure at least at padding
    if (constrainedX < padding) {
      constrainedX = padding
    }

    // Constrain Y position
    let constrainedY = y
    // Don't go past top edge
    if (constrainedY < padding) {
      constrainedY = padding
    }
    // Don't go past bottom edge
    if (constrainedY + constrainedHeight > containerSize.height - padding) {
      constrainedY = containerSize.height - constrainedHeight - padding
    }
    // Final check: ensure at least at padding
    if (constrainedY < padding) {
      constrainedY = padding
    }

    return { x: constrainedX, y: constrainedY, width: constrainedWidth, height: constrainedHeight }
  }, [containerSize])

  // Get style for a panel or group
  const getStyle = useCallback((
    position: PanelPosition,
    panelWidth: number,
    panelHeight: number,
    minWidth: number,
    minHeight: number,
    zIndex: number,
    isDragging: boolean,
    isResizing: boolean
  ): React.CSSProperties => {
    // If resizing, use resize dimensions
    if (isResizing && resizeSize && resizePosition) {
      return {
        position: 'absolute',
        left: resizePosition.x,
        top: resizePosition.y,
        width: resizeSize.width,
        height: resizeSize.height,
        zIndex: 1000 // Always on top while resizing
      }
    }

    // If dragging, use drag position (no constraints during drag)
    if (isDragging && dragPosition) {
      return {
        position: 'absolute',
        left: dragPosition.x,
        top: dragPosition.y,
        width: panelWidth,
        height: panelHeight,
        zIndex: 1000 // Always on top while dragging
      }
    }

    // Calculate position based on snap or free position
    let x: number
    let y: number
    let width = panelWidth
    let height = panelHeight

    if (position.snap) {
      const snapPos = getSnapPositionStyle(
        position.snap,
        containerSize.width,
        containerSize.height,
        panelWidth,
        panelHeight
      )
      x = snapPos.x
      y = snapPos.y
    } else {
      x = position.x
      y = position.y
    }

    // Constrain panels to viewport and scale down if needed
    const constrained = constrainToViewport(x, y, width, height, minWidth, minHeight)
    x = constrained.x
    y = constrained.y
    width = constrained.width
    height = constrained.height

    return {
      position: 'absolute',
      left: x,
      top: y,
      width,
      height,
      zIndex
    }
  }, [containerSize, dragPosition, resizeSize, resizePosition, constrainToViewport])

  // Render a standalone panel
  const renderStandalonePanel = (panelId: PanelId): JSX.Element => {
    const position = layoutState.standalone[panelId]
    if (!position) return <></>

    const config = PANEL_CONFIGS[panelId]
    const panelWidth = position.width || config.defaultWidth
    const panelHeight = position.height || config.defaultHeight
    const panelZIndex = position.zIndex || 1

    const isDragging = dragState?.type === 'panel' && dragState.panelId === panelId
    const isResizing = resizeState?.type === 'panel' && resizeState.panelId === panelId
    const isDropTarget = hoverDropTarget?.panelId === panelId

    // Update bounds for drop detection
    const style = getStyle(position, panelWidth, panelHeight, config.minWidth, config.minHeight, panelZIndex, isDragging, isResizing)
    const bounds: PanelBounds = {
      panelId,
      x: typeof style.left === 'number' ? style.left : 0,
      y: typeof style.top === 'number' ? style.top : 0,
      width: panelWidth,
      height: panelHeight
    }
    // Register bounds
    const existingIndex = panelBoundsRef.current.findIndex(b => b.panelId === panelId)
    if (existingIndex >= 0) {
      panelBoundsRef.current[existingIndex] = bounds
    } else {
      panelBoundsRef.current.push(bounds)
    }

    return (
      <div
        key={panelId}
        className={`dockable-panel__panel ${isDragging ? 'dockable-panel__panel--dragging' : ''} ${isResizing ? 'dockable-panel__panel--resizing' : ''} ${isDropTarget ? 'dockable-panel__panel--drop-target' : ''}`}
        style={style}
        onMouseDownCapture={() => onBringPanelToFront(panelId)}
      >
        {renderResizeHandles(panelId, undefined)}

        <div
          className="dockable-panel__panel-header"
          onMouseDown={(e) => handlePanelMouseDown(e, panelId)}
        >
          <span className="dockable-panel__panel-title">
            {config.title}
          </span>
          <div className="dockable-panel__panel-actions">
            <button
              onClick={() => onRemovePanel(panelId)}
              className="dockable-panel__action-btn"
              title="Remove panel"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="dockable-panel__panel-content">{renderPanelContent(panelId)}</div>
      </div>
    )
  }

  // Render a grouped panel (with tabs)
  const renderGroupedPanel = (group: PanelGroup): JSX.Element => {
    const activePanel = group.activePanel
    const config = PANEL_CONFIGS[activePanel]
    const panelWidth = group.position.width || config.defaultWidth
    const panelHeight = group.position.height || config.defaultHeight
    const groupZIndex = group.zIndex || 1

    const isDragging = dragState?.type === 'group' && dragState.groupId === group.id
    const isResizing = resizeState?.type === 'group' && resizeState.groupId === group.id
    const isDropTarget = hoverDropTarget?.groupId === group.id

    const style = getStyle(group.position, panelWidth, panelHeight, config.minWidth, config.minHeight, groupZIndex, isDragging, isResizing)

    // Update bounds for drop detection
    const bounds: PanelBounds = {
      groupId: group.id,
      x: typeof style.left === 'number' ? style.left : 0,
      y: typeof style.top === 'number' ? style.top : 0,
      width: panelWidth,
      height: panelHeight
    }
    const existingIndex = panelBoundsRef.current.findIndex(b => b.groupId === group.id)
    if (existingIndex >= 0) {
      panelBoundsRef.current[existingIndex] = bounds
    } else {
      panelBoundsRef.current.push(bounds)
    }

    return (
      <div
        key={group.id}
        className={`dockable-panel__panel dockable-panel__panel--grouped ${isDragging ? 'dockable-panel__panel--dragging' : ''} ${isResizing ? 'dockable-panel__panel--resizing' : ''} ${isDropTarget ? 'dockable-panel__panel--drop-target' : ''}`}
        style={style}
        onMouseDownCapture={() => onBringGroupToFront(group.id)}
      >
        {renderResizeHandles(undefined, group.id)}

        {/* Tab bar - clicking empty area drags the group */}
        <div
          className="dockable-panel__tabs"
          onMouseDown={(e) => {
            // If clicking on empty space in tab bar (not on a tab), drag the group
            const target = e.target as HTMLElement
            if (!target.closest('.dockable-panel__tab')) {
              handleGroupMouseDown(e, group.id)
            }
          }}
        >
          {group.panels.map((panelId) => {
            const panelConfig = PANEL_CONFIGS[panelId]
            const isActive = panelId === activePanel
            const isTabDragging = dragState?.type === 'tab' && dragState.panelId === panelId

            return (
              <div
                key={panelId}
                className={`dockable-panel__tab ${isActive ? 'dockable-panel__tab--active' : ''} ${isTabDragging ? 'dockable-panel__tab--dragging' : ''}`}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  // Only start tab drag if clicking on title text, not close button or padding
                  const target = e.target as HTMLElement
                  if (target.closest('.dockable-panel__tab-close')) return
                  // If clicking specifically on the title, start tab drag
                  if (target.closest('.dockable-panel__tab-title')) {
                    handleTabMouseDown(e, panelId, group.id)
                  } else {
                    // Clicking on padding area of tab - drag the group instead
                    handleGroupMouseDown(e, group.id)
                  }
                }}
                onClick={() => onSetActiveTab(group.id, panelId)}
              >
                <span className="dockable-panel__tab-title">{panelConfig.title}</span>
                <button
                  className="dockable-panel__tab-close"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemovePanel(panelId)
                  }}
                  title="Close tab"
                >
                  <CloseIcon />
                </button>
              </div>
            )
          })}
        </div>

        {/* Active panel content */}
        <div className="dockable-panel__panel-content">
          {renderPanelContent(activePanel)}
        </div>
      </div>
    )
  }

  // Render snap zone indicators
  const renderSnapZones = (): JSX.Element | null => {
    if (!dragState) return null

    const zones: SnapPosition[] = [
      'top-left',
      'top',
      'top-right',
      'left',
      'right',
      'bottom-left',
      'bottom',
      'bottom-right'
    ]

    return (
      <div className="dockable-panel__snap-zones">
        {zones.map((zone) => (
          <div
            key={zone}
            className={`dockable-panel__snap-zone dockable-panel__snap-zone--${zone} ${
              hoverSnapZone === zone ? 'dockable-panel__snap-zone--active' : ''
            }`}
          />
        ))}
      </div>
    )
  }

  // Clear stale bounds on layout change
  useEffect(() => {
    const validPanelIds = Object.keys(layoutState.standalone) as PanelId[]
    const validGroupIds = layoutState.groups.map(g => g.id)
    panelBoundsRef.current = panelBoundsRef.current.filter(b =>
      (b.panelId && validPanelIds.includes(b.panelId)) ||
      (b.groupId && validGroupIds.includes(b.groupId))
    )
  }, [layoutState])

  const standalonePanelIds = Object.keys(layoutState.standalone) as PanelId[]

  return (
    <div ref={containerRef} className="dockable-panel">
      {/* Snap zone indicators (shown during drag) */}
      {renderSnapZones()}

      {/* Standalone panels */}
      {standalonePanelIds.map((panelId) => renderStandalonePanel(panelId))}

      {/* Grouped panels */}
      {layoutState.groups.map((group) => renderGroupedPanel(group))}

      {/* Drag preview for tab being dragged out - only show when outside header area */}
      {dragState?.type === 'tab' && dragPosition && dragStarted && (() => {
        const deltaX = dragPosition.x - dragState.startPanelX
        const deltaY = dragPosition.y - dragState.startPanelY
        const { width: previewWidth } = getDimensions(dragState.panelId)
        const HEADER_HEIGHT = 40
        const isOutsideHeader = deltaY > HEADER_HEIGHT || deltaY < -10 || Math.abs(deltaX) > previewWidth / 2
        if (!isOutsideHeader) return null
        return (
          <div
            className="dockable-panel__drag-preview"
            style={{
              position: 'absolute',
              left: dragPosition.x,
              top: dragPosition.y,
              width: previewWidth,
              height: getDimensions(dragState.panelId).height,
              pointerEvents: 'none'
            }}
          >
            <div className="dockable-panel__panel-header">
              <span className="dockable-panel__panel-title">
                {PANEL_CONFIGS[dragState.panelId].title}
              </span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default DockablePanel
