import { useState, useCallback, useEffect, useMemo } from 'react'
import type { PanelId } from './DockablePanel'

// Snap positions for docking
export type SnapPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'center'

// Panel position - either snapped or free
export interface PanelPosition {
  snap?: SnapPosition // If set, panel snaps to this position
  x: number // X coordinate (used when not snapped, or as offset)
  y: number // Y coordinate (used when not snapped, or as offset)
  width?: number // Custom width (if not set, uses default)
  height?: number // Custom height (if not set, uses default)
}

// A group of panels displayed as tabs
export interface PanelGroup {
  id: string // Unique group ID
  panels: PanelId[] // Panels in this group (order matters for tab order)
  activePanel: PanelId // Currently active/visible panel
  position: PanelPosition // Position of the group
}

// Layout stores standalone panels and groups
export interface PanelLayoutState {
  standalone: Record<string, PanelPosition> // panelId -> position for standalone panels
  groups: PanelGroup[] // Groups of tabbed panels
}

// Legacy layout for backwards compatibility
export interface PanelLayout {
  [panelId: string]: PanelPosition
}

// Default positions for panels
const DEFAULT_POSITIONS: Record<PanelId, PanelPosition> = {
  chat: { snap: 'right', x: 0, y: 0 },
  description: { snap: 'top-left', x: 0, y: 0 },
  spec: { snap: 'left', x: 0, y: 0 },
  task: { snap: 'bottom-right', x: 0, y: 0 }
}

// Valid panel IDs
const VALID_PANEL_IDS: readonly string[] = ['description', 'spec', 'chat', 'task']

function isValidPanelId(id: unknown): id is PanelId {
  return typeof id === 'string' && VALID_PANEL_IDS.includes(id)
}

// Generate unique group ID
function generateGroupId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Validate new layout state
function isValidPanelLayoutState(state: unknown): state is PanelLayoutState {
  if (!state || typeof state !== 'object') return false
  const s = state as Record<string, unknown>

  // Check standalone
  if (!s.standalone || typeof s.standalone !== 'object') return false
  for (const [key, value] of Object.entries(s.standalone as Record<string, unknown>)) {
    if (!isValidPanelId(key)) return false
    if (!value || typeof value !== 'object') return false
    const pos = value as Record<string, unknown>
    if (typeof pos.x !== 'number' || typeof pos.y !== 'number') return false
  }

  // Check groups
  if (!Array.isArray(s.groups)) return false
  for (const group of s.groups) {
    if (!group || typeof group !== 'object') return false
    const g = group as Record<string, unknown>
    if (typeof g.id !== 'string') return false
    if (!Array.isArray(g.panels) || g.panels.length === 0) return false
    if (!g.panels.every(isValidPanelId)) return false
    if (!isValidPanelId(g.activePanel)) return false
    if (!g.position || typeof g.position !== 'object') return false
    const pos = g.position as Record<string, unknown>
    if (typeof pos.x !== 'number' || typeof pos.y !== 'number') return false
  }

  return true
}

// Migrate legacy layout to new format
function migrateLegacyLayout(legacy: PanelLayout): PanelLayoutState {
  const standalone: Record<string, PanelPosition> = {}
  for (const [key, value] of Object.entries(legacy)) {
    if (isValidPanelId(key)) {
      standalone[key] = value
    }
  }
  return { standalone, groups: [] }
}

export interface UsePanelLayoutResult {
  layoutState: PanelLayoutState
  panelLayout: PanelLayout // Computed flat layout for backwards compatibility
  activePanels: PanelId[]
  addPanel: (panelId: PanelId, position?: PanelPosition) => void
  removePanel: (panelId: PanelId) => void
  togglePanel: (panelId: PanelId) => void
  updatePanelPosition: (panelId: PanelId, position: PanelPosition) => void
  snapPanel: (panelId: PanelId, snap: SnapPosition) => void
  // Group operations
  groupPanels: (panelId1: PanelId, panelId2: PanelId) => void
  ungroupPanel: (panelId: PanelId) => void
  setActiveTab: (groupId: string, panelId: PanelId) => void
  updateGroupPosition: (groupId: string, position: PanelPosition) => void
  // Helpers
  findPanelGroup: (panelId: PanelId) => PanelGroup | null
  getPanelPosition: (panelId: PanelId) => PanelPosition | null
}

export function usePanelLayout(): UsePanelLayoutResult {
  // Load panel layout from localStorage
  const [layoutState, setLayoutState] = useState<PanelLayoutState>(() => {
    try {
      const saved = localStorage.getItem('dagent.panelLayout.v2')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (isValidPanelLayoutState(parsed)) {
          return parsed
        }
      }
      // Try legacy format
      const legacy = localStorage.getItem('dagent.panelLayout')
      if (legacy) {
        const parsed = JSON.parse(legacy)
        if (parsed && typeof parsed === 'object') {
          return migrateLegacyLayout(parsed)
        }
      }
    } catch {
      // Ignore parse errors
    }
    // Default: just chat panel visible
    return {
      standalone: { chat: DEFAULT_POSITIONS.chat },
      groups: []
    }
  })

  // Save layout to localStorage
  useEffect(() => {
    localStorage.setItem('dagent.panelLayout.v2', JSON.stringify(layoutState))
  }, [layoutState])

  // Compute active panels (all panels in standalone + all panels in groups)
  const activePanels = useMemo<PanelId[]>(() => [
    ...Object.keys(layoutState.standalone).filter(isValidPanelId) as PanelId[],
    ...layoutState.groups.flatMap(g => g.panels)
  ], [layoutState.standalone, layoutState.groups])

  // Compute flat panelLayout for backwards compatibility
  const panelLayout = useMemo<PanelLayout>(() => ({
    ...layoutState.standalone,
    ...Object.fromEntries(
      layoutState.groups.flatMap(g => g.panels.map(p => [p, g.position]))
    )
  }), [layoutState.standalone, layoutState.groups])

  // Find which group a panel belongs to
  const findPanelGroup = useCallback((panelId: PanelId): PanelGroup | null => {
    return layoutState.groups.find(g => g.panels.includes(panelId)) || null
  }, [layoutState.groups])

  // Get panel position (whether standalone or in group)
  const getPanelPosition = useCallback((panelId: PanelId): PanelPosition | null => {
    if (layoutState.standalone[panelId]) {
      return layoutState.standalone[panelId]
    }
    const group = findPanelGroup(panelId)
    return group?.position || null
  }, [layoutState.standalone, findPanelGroup])

  const addPanel = useCallback((panelId: PanelId, position?: PanelPosition) => {
    setLayoutState((prev) => {
      // Check if already exists
      if (prev.standalone[panelId]) return prev
      if (prev.groups.some(g => g.panels.includes(panelId))) return prev

      return {
        ...prev,
        standalone: {
          ...prev.standalone,
          [panelId]: position || DEFAULT_POSITIONS[panelId] || { x: 100, y: 100 }
        }
      }
    })
  }, [])

  const removePanel = useCallback((panelId: PanelId) => {
    setLayoutState((prev) => {
      // Remove from standalone
      if (prev.standalone[panelId]) {
        const next = { ...prev.standalone }
        delete next[panelId]
        return { ...prev, standalone: next }
      }

      // Remove from groups
      const groupIndex = prev.groups.findIndex(g => g.panels.includes(panelId))
      if (groupIndex === -1) return prev

      const group = prev.groups[groupIndex]
      const newPanels = group.panels.filter(p => p !== panelId)

      if (newPanels.length === 0) {
        // Remove empty group
        return {
          ...prev,
          groups: prev.groups.filter((_, i) => i !== groupIndex)
        }
      } else if (newPanels.length === 1) {
        // Convert single-panel group back to standalone
        const remainingPanel = newPanels[0]
        return {
          standalone: {
            ...prev.standalone,
            [remainingPanel]: group.position
          },
          groups: prev.groups.filter((_, i) => i !== groupIndex)
        }
      } else {
        // Update group
        const newActivePanel = group.activePanel === panelId ? newPanels[0] : group.activePanel
        return {
          ...prev,
          groups: prev.groups.map((g, i) =>
            i === groupIndex
              ? { ...g, panels: newPanels, activePanel: newActivePanel }
              : g
          )
        }
      }
    })
  }, [])

  const togglePanel = useCallback((panelId: PanelId) => {
    setLayoutState((prev) => {
      const isActive = prev.standalone[panelId] || prev.groups.some(g => g.panels.includes(panelId))

      if (isActive) {
        // Remove panel
        if (prev.standalone[panelId]) {
          const next = { ...prev.standalone }
          delete next[panelId]
          return { ...prev, standalone: next }
        }
        // Handle group removal (same as removePanel)
        const groupIndex = prev.groups.findIndex(g => g.panels.includes(panelId))
        if (groupIndex === -1) return prev
        const group = prev.groups[groupIndex]
        const newPanels = group.panels.filter(p => p !== panelId)
        if (newPanels.length === 1) {
          return {
            standalone: { ...prev.standalone, [newPanels[0]]: group.position },
            groups: prev.groups.filter((_, i) => i !== groupIndex)
          }
        }
        const newActivePanel = group.activePanel === panelId ? newPanels[0] : group.activePanel
        return {
          ...prev,
          groups: prev.groups.map((g, i) =>
            i === groupIndex ? { ...g, panels: newPanels, activePanel: newActivePanel } : g
          )
        }
      }

      // Add panel
      return {
        ...prev,
        standalone: {
          ...prev.standalone,
          [panelId]: DEFAULT_POSITIONS[panelId] || { x: 100, y: 100 }
        }
      }
    })
  }, [])

  const updatePanelPosition = useCallback((panelId: PanelId, position: PanelPosition) => {
    setLayoutState((prev) => {
      if (prev.standalone[panelId]) {
        return {
          ...prev,
          standalone: { ...prev.standalone, [panelId]: position }
        }
      }
      // If in group, update group position
      const groupIndex = prev.groups.findIndex(g => g.panels.includes(panelId))
      if (groupIndex === -1) return prev
      return {
        ...prev,
        groups: prev.groups.map((g, i) =>
          i === groupIndex ? { ...g, position } : g
        )
      }
    })
  }, [])

  const snapPanel = useCallback((panelId: PanelId, snap: SnapPosition) => {
    setLayoutState((prev) => {
      if (prev.standalone[panelId]) {
        return {
          ...prev,
          standalone: {
            ...prev.standalone,
            [panelId]: { ...prev.standalone[panelId], snap }
          }
        }
      }
      const groupIndex = prev.groups.findIndex(g => g.panels.includes(panelId))
      if (groupIndex === -1) return prev
      return {
        ...prev,
        groups: prev.groups.map((g, i) =>
          i === groupIndex ? { ...g, position: { ...g.position, snap } } : g
        )
      }
    })
  }, [])

  // Group two panels into tabs
  const groupPanels = useCallback((panelId1: PanelId, panelId2: PanelId) => {
    if (panelId1 === panelId2) return

    setLayoutState((prev) => {
      const group1 = prev.groups.find(g => g.panels.includes(panelId1))
      const group2 = prev.groups.find(g => g.panels.includes(panelId2))

      // If both are in the same group, do nothing
      if (group1 && group2 && group1.id === group2.id) return prev

      // Get positions
      const pos1 = prev.standalone[panelId1] || group1?.position
      const pos2 = prev.standalone[panelId2] || group2?.position

      if (!pos1 && !pos2) return prev

      // Use target panel's position (panelId2 is the drop target)
      const position = pos2 || pos1!

      // Collect all panels to merge
      let allPanels: PanelId[] = []

      // Add panels from group1 or just panelId1
      if (group1) {
        allPanels = [...group1.panels]
      } else if (prev.standalone[panelId1]) {
        allPanels = [panelId1]
      }

      // Add panels from group2 or just panelId2
      if (group2) {
        allPanels = [...allPanels, ...group2.panels.filter(p => !allPanels.includes(p))]
      } else if (prev.standalone[panelId2]) {
        if (!allPanels.includes(panelId2)) {
          allPanels = [...allPanels, panelId2]
        }
      }

      if (allPanels.length < 2) return prev

      // Remove panels from standalone
      const newStandalone = { ...prev.standalone }
      for (const p of allPanels) {
        delete newStandalone[p]
      }

      // Remove old groups
      const newGroups = prev.groups.filter(g => g.id !== group1?.id && g.id !== group2?.id)

      // Create new merged group
      const newGroup: PanelGroup = {
        id: generateGroupId(),
        panels: allPanels,
        activePanel: panelId1, // The dragged panel becomes active
        position
      }

      return {
        standalone: newStandalone,
        groups: [...newGroups, newGroup]
      }
    })
  }, [])

  // Remove a panel from its group, making it standalone
  const ungroupPanel = useCallback((panelId: PanelId) => {
    setLayoutState((prev) => {
      const groupIndex = prev.groups.findIndex(g => g.panels.includes(panelId))
      if (groupIndex === -1) return prev

      const group = prev.groups[groupIndex]
      const newPanels = group.panels.filter(p => p !== panelId)

      // Create standalone panel at offset position
      const newStandalone = {
        ...prev.standalone,
        [panelId]: {
          x: group.position.x + 30,
          y: group.position.y + 30,
          width: group.position.width,
          height: group.position.height
        }
      }

      if (newPanels.length === 0) {
        // Remove empty group
        return {
          standalone: newStandalone,
          groups: prev.groups.filter((_, i) => i !== groupIndex)
        }
      } else if (newPanels.length === 1) {
        // Convert single-panel group to standalone
        return {
          standalone: {
            ...newStandalone,
            [newPanels[0]]: group.position
          },
          groups: prev.groups.filter((_, i) => i !== groupIndex)
        }
      } else {
        // Update group
        const newActivePanel = group.activePanel === panelId ? newPanels[0] : group.activePanel
        return {
          standalone: newStandalone,
          groups: prev.groups.map((g, i) =>
            i === groupIndex
              ? { ...g, panels: newPanels, activePanel: newActivePanel }
              : g
          )
        }
      }
    })
  }, [])

  // Set active tab in a group
  const setActiveTab = useCallback((groupId: string, panelId: PanelId) => {
    setLayoutState((prev) => ({
      ...prev,
      groups: prev.groups.map(g =>
        g.id === groupId && g.panels.includes(panelId)
          ? { ...g, activePanel: panelId }
          : g
      )
    }))
  }, [])

  // Update group position
  const updateGroupPosition = useCallback((groupId: string, position: PanelPosition) => {
    setLayoutState((prev) => ({
      ...prev,
      groups: prev.groups.map(g =>
        g.id === groupId ? { ...g, position } : g
      )
    }))
  }, [])

  return {
    layoutState,
    panelLayout,
    activePanels,
    addPanel,
    removePanel,
    togglePanel,
    updatePanelPosition,
    snapPanel,
    groupPanels,
    ungroupPanel,
    setActiveTab,
    updateGroupPosition,
    findPanelGroup,
    getPanelPosition
  }
}

// Helper to get CSS position from snap position
export function getSnapPositionStyle(
  snap: SnapPosition,
  containerWidth: number,
  containerHeight: number,
  panelWidth: number,
  panelHeight: number
): { x: number; y: number } {
  const padding = 8

  switch (snap) {
    case 'top-left':
      return { x: padding, y: padding }
    case 'top-right':
      return { x: containerWidth - panelWidth - padding, y: padding }
    case 'bottom-left':
      return { x: padding, y: containerHeight - panelHeight - padding }
    case 'bottom-right':
      return { x: containerWidth - panelWidth - padding, y: containerHeight - panelHeight - padding }
    case 'top':
      return { x: (containerWidth - panelWidth) / 2, y: padding }
    case 'bottom':
      return { x: (containerWidth - panelWidth) / 2, y: containerHeight - panelHeight - padding }
    case 'left':
      return { x: padding, y: (containerHeight - panelHeight) / 2 }
    case 'right':
      return { x: containerWidth - panelWidth - padding, y: (containerHeight - panelHeight) / 2 }
    case 'center':
      return { x: (containerWidth - panelWidth) / 2, y: (containerHeight - panelHeight) / 2 }
    default:
      return { x: padding, y: padding }
  }
}

// Helper to detect which snap zone a panel intersects with
// Uses distance-based selection: when multiple zones overlap, picks the closest one
export function detectSnapZone(
  x: number,
  y: number,
  panelWidth: number,
  panelHeight: number,
  containerWidth: number,
  containerHeight: number
): SnapPosition | null {
  const edgeThreshold = 80 // snap zone size from edge
  const cornerSize = 120 // corner zone size

  // Panel bounding box
  const left = x
  const right = x + panelWidth
  const top = y
  const bottom = y + panelHeight

  // Panel center (this is what we compare distances to)
  const panelCenterX = x + panelWidth / 2
  const panelCenterY = y + panelHeight / 2

  // Define zone centers for distance comparison
  const zoneCenters: Record<SnapPosition, { x: number; y: number }> = {
    'top-left': { x: cornerSize / 2, y: cornerSize / 2 },
    'top-right': { x: containerWidth - cornerSize / 2, y: cornerSize / 2 },
    'bottom-left': { x: cornerSize / 2, y: containerHeight - cornerSize / 2 },
    'bottom-right': { x: containerWidth - cornerSize / 2, y: containerHeight - cornerSize / 2 },
    'top': { x: containerWidth / 2, y: edgeThreshold / 2 },
    'bottom': { x: containerWidth / 2, y: containerHeight - edgeThreshold / 2 },
    'left': { x: edgeThreshold / 2, y: containerHeight / 2 },
    'right': { x: containerWidth - edgeThreshold / 2, y: containerHeight / 2 },
    'center': { x: containerWidth / 2, y: containerHeight / 2 }
  }

  // Calculate distance from panel center to a zone center
  const distanceTo = (zone: SnapPosition): number => {
    const center = zoneCenters[zone]
    const dx = panelCenterX - center.x
    const dy = panelCenterY - center.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Check which zones the panel intersects with
  const intersectingZones: SnapPosition[] = []

  // Corner zones
  if (left < cornerSize && top < cornerSize) {
    intersectingZones.push('top-left')
  }
  if (right > containerWidth - cornerSize && top < cornerSize) {
    intersectingZones.push('top-right')
  }
  if (left < cornerSize && bottom > containerHeight - cornerSize) {
    intersectingZones.push('bottom-left')
  }
  if (right > containerWidth - cornerSize && bottom > containerHeight - cornerSize) {
    intersectingZones.push('bottom-right')
  }

  // Edge zones
  if (top < edgeThreshold) {
    intersectingZones.push('top')
  }
  if (bottom > containerHeight - edgeThreshold) {
    intersectingZones.push('bottom')
  }
  if (left < edgeThreshold) {
    intersectingZones.push('left')
  }
  if (right > containerWidth - edgeThreshold) {
    intersectingZones.push('right')
  }

  // No intersecting zones
  if (intersectingZones.length === 0) {
    return null
  }

  // Single zone - return it
  if (intersectingZones.length === 1) {
    return intersectingZones[0]
  }

  // Multiple zones - pick the closest one based on panel center distance
  let closestZone = intersectingZones[0]
  let closestDistance = distanceTo(closestZone)

  for (let i = 1; i < intersectingZones.length; i++) {
    const zone = intersectingZones[i]
    const distance = distanceTo(zone)
    if (distance < closestDistance) {
      closestZone = zone
      closestDistance = distance
    }
  }

  return closestZone
}
