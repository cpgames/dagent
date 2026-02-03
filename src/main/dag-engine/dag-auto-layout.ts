/**
 * DAG Auto-Layout Algorithm
 *
 * Automatically positions nodes in a hierarchical tree structure based on dependencies.
 * Uses a layered approach:
 * 1. Assign layers using topological sort (root nodes at top)
 * 2. Position nodes within each layer, centered horizontally
 * 3. Minimize edge crossings through node ordering within layers
 */

import type { Task } from '@shared/types/task'
import type { DAGGraph } from '@shared/types/dag'

// Layout constants
const NODE_WIDTH = 280
const NODE_HEIGHT = 120
const HORIZONTAL_GAP = 60
const VERTICAL_GAP = 80
const CANVAS_PADDING = 100

/**
 * Compute automatic layout for a DAG graph.
 * Returns a map of node IDs to their computed positions.
 *
 * Preserves user's relative horizontal ordering within each layer:
 * If user positioned node A to the right of node B, that order is maintained.
 */
export function computeAutoLayout(graph: DAGGraph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()

  if (graph.nodes.length === 0) {
    return positions
  }

  // Build a map of node ID to current position for preserving user ordering
  const currentPositions = new Map<string, { x: number; y: number }>()
  for (const node of graph.nodes) {
    currentPositions.set(node.id, node.position)
  }

  // Build adjacency list for incoming edges (dependencies)
  const incoming = new Map<string, string[]>() // node -> parents (this node depends on)

  for (const node of graph.nodes) {
    incoming.set(node.id, [])
  }

  for (const conn of graph.connections) {
    incoming.get(conn.to)?.push(conn.from)
  }

  // Assign layers using longest path from roots (topological layering)
  const layers = assignLayers(graph.nodes, incoming)

  // Group nodes by layer
  const layerGroups = new Map<number, string[]>()
  let maxLayer = 0

  for (const [nodeId, layer] of layers) {
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, [])
    }
    layerGroups.get(layer)!.push(nodeId)
    maxLayer = Math.max(maxLayer, layer)
  }

  // Order nodes within each layer - preserve user's horizontal ordering
  for (let layer = 0; layer <= maxLayer; layer++) {
    const nodesInLayer = layerGroups.get(layer) || []
    if (nodesInLayer.length > 1) {
      // Sort by current X position to preserve user's left-to-right ordering
      nodesInLayer.sort((a, b) => {
        const aPos = currentPositions.get(a)
        const bPos = currentPositions.get(b)
        const aX = aPos?.x ?? 0
        const bX = bPos?.x ?? 0
        return aX - bX
      })
    }
    layerGroups.set(layer, nodesInLayer)
  }

  // Calculate positions
  // Find the widest layer to center others relative to it
  let maxLayerWidth = 0
  for (const [, nodes] of layerGroups) {
    const width = nodes.length * NODE_WIDTH + (nodes.length - 1) * HORIZONTAL_GAP
    maxLayerWidth = Math.max(maxLayerWidth, width)
  }

  // Position each layer
  for (let layer = 0; layer <= maxLayer; layer++) {
    const nodesInLayer = layerGroups.get(layer) || []
    const layerWidth = nodesInLayer.length * NODE_WIDTH + (nodesInLayer.length - 1) * HORIZONTAL_GAP

    // Center this layer relative to the widest layer
    const startX = CANVAS_PADDING + (maxLayerWidth - layerWidth) / 2
    const y = CANVAS_PADDING + layer * (NODE_HEIGHT + VERTICAL_GAP)

    for (let i = 0; i < nodesInLayer.length; i++) {
      const nodeId = nodesInLayer[i]
      const x = startX + i * (NODE_WIDTH + HORIZONTAL_GAP)
      positions.set(nodeId, { x, y })
    }
  }

  return positions
}

/**
 * Assign layers to nodes using longest path algorithm.
 * Root nodes (no dependencies) get layer 0.
 * Each node's layer is max(parent layers) + 1.
 */
function assignLayers(
  nodes: Task[],
  incoming: Map<string, string[]>
): Map<string, number> {
  const layers = new Map<string, number>()
  const visited = new Set<string>()

  // Find root nodes (no incoming edges)
  const roots = nodes.filter((n) => (incoming.get(n.id) || []).length === 0)

  // If no roots (all nodes have dependencies - shouldn't happen in valid DAG)
  // Pick nodes not yet layered as roots
  if (roots.length === 0 && nodes.length > 0) {
    roots.push(nodes[0])
  }

  // BFS from roots to assign layers
  function assignLayer(nodeId: string, minLayer: number): number {
    if (visited.has(nodeId)) {
      return layers.get(nodeId) || 0
    }

    // Get all parents and find max layer
    const parents = incoming.get(nodeId) || []
    let layer = minLayer

    for (const parentId of parents) {
      if (!visited.has(parentId)) {
        assignLayer(parentId, 0)
      }
      const parentLayer = layers.get(parentId) || 0
      layer = Math.max(layer, parentLayer + 1)
    }

    // If no parents, this is a root
    if (parents.length === 0) {
      layer = 0
    }

    visited.add(nodeId)
    layers.set(nodeId, layer)
    return layer
  }

  // Process all nodes
  for (const node of nodes) {
    assignLayer(node.id, 0)
  }

  return layers
}

/**
 * Apply auto-layout to a graph, returning a new graph with updated positions.
 */
export function applyAutoLayout(graph: DAGGraph): DAGGraph {
  const positions = computeAutoLayout(graph)

  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) || node.position
    })),
    connections: graph.connections
  }
}
