import type { DAGGraph, Connection } from '@shared/types'
import type { TopologicalResult } from './types'

/**
 * Performs topological sort using Kahn's algorithm.
 * Returns tasks in execution order (dependencies before dependents).
 * Detects cycles in the graph.
 */
export function topologicalSort(graph: DAGGraph): TopologicalResult {
  const { nodes, connections } = graph

  // Build adjacency list and in-degree count
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  // Initialize all nodes
  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  // Build graph structure from connections
  // Connection: from → to means "to" depends on "from"
  // So "from" must execute before "to"
  for (const conn of connections) {
    const neighbors = adjacency.get(conn.from) || []
    neighbors.push(conn.to)
    adjacency.set(conn.from, neighbors)

    const currentDegree = inDegree.get(conn.to) || 0
    inDegree.set(conn.to, currentDegree + 1)
  }

  // Queue nodes with no incoming edges (no dependencies)
  const queue: string[] = []
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId)
    }
  }

  // Process queue
  const sorted: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    sorted.push(current)

    // Reduce in-degree for neighbors
    const neighbors = adjacency.get(current) || []
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1
      inDegree.set(neighbor, newDegree)

      if (newDegree === 0) {
        queue.push(neighbor)
      }
    }
  }

  // Check for cycle
  if (sorted.length !== nodes.length) {
    // Find nodes involved in cycle (remaining nodes with in-degree > 0)
    const cycleNodes = nodes.filter((n) => !sorted.includes(n.id)).map((n) => n.id)

    return {
      sorted,
      hasCycle: true,
      cycleNodes
    }
  }

  return {
    sorted,
    hasCycle: false
  }
}

/**
 * Gets direct dependencies for a task (tasks it depends on).
 */
export function getTaskDependencies(taskId: string, connections: Connection[]): string[] {
  // Connection from → to means "to" depends on "from"
  return connections.filter((c) => c.to === taskId).map((c) => c.from)
}

/**
 * Gets direct dependents for a task (tasks that depend on it).
 */
export function getTaskDependents(taskId: string, connections: Connection[]): string[] {
  // Connection from → to means "to" depends on "from"
  return connections.filter((c) => c.from === taskId).map((c) => c.to)
}
