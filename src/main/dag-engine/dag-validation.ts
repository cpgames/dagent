import type { DAGGraph } from '@shared/types/dag';

/**
 * Result of connection validation.
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Detects if adding a connection from source to target would create a cycle.
 * Uses DFS-based approach: adds temporary edge and checks if target can reach source.
 *
 * @param graph - Current DAG graph
 * @param source - Source node ID
 * @param target - Target node ID
 * @returns true if adding the connection would create a cycle, false otherwise
 */
export function detectCycle(graph: DAGGraph, source: string, target: string): boolean {
  // Create temporary adjacency list with new edge added
  const adjacency = new Map<string, string[]>();

  // Initialize all nodes
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }

  // Add existing connections
  for (const conn of graph.connections) {
    const neighbors = adjacency.get(conn.from) || [];
    neighbors.push(conn.to);
    adjacency.set(conn.from, neighbors);
  }

  // Add the proposed new connection
  const neighbors = adjacency.get(source) || [];
  neighbors.push(target);
  adjacency.set(source, neighbors);

  // Run DFS from target node to see if we can reach source
  // If we can reach source from target, then source -> target creates a cycle
  const visited = new Set<string>();
  const stack: string[] = [target];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current === source) {
      // Found a path from target back to source - cycle detected!
      return true;
    }

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    // Add neighbors to stack
    const currentNeighbors = adjacency.get(current) || [];
    for (const neighbor of currentNeighbors) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  // No path from target to source - no cycle
  return false;
}

/**
 * Validates if a connection can be added to the graph.
 * Checks:
 * - Source node exists
 * - Target node exists
 * - Connection doesn't already exist
 * - Adding connection won't create a cycle
 *
 * @param graph - Current DAG graph
 * @param source - Source node ID
 * @param target - Target node ID
 * @returns Validation result with success flag and optional reason
 */
export function validateConnection(
  graph: DAGGraph,
  source: string,
  target: string
): ValidationResult {
  // Check if source node exists
  const sourceNode = graph.nodes.find((n) => n.id === source);
  if (!sourceNode) {
    return {
      valid: false,
      reason: `Source node "${source}" does not exist in graph`
    };
  }

  // Check if target node exists
  const targetNode = graph.nodes.find((n) => n.id === target);
  if (!targetNode) {
    return {
      valid: false,
      reason: `Target node "${target}" does not exist in graph`
    };
  }

  // Check if connection already exists
  const connectionExists = graph.connections.some(
    (c) => c.from === source && c.to === target
  );
  if (connectionExists) {
    return {
      valid: false,
      reason: `Connection from "${source}" to "${target}" already exists`
    };
  }

  // Check if adding connection would create a cycle
  if (detectCycle(graph, source, target)) {
    return {
      valid: false,
      reason: `Adding connection from "${source}" to "${target}" would create a cycle`
    };
  }

  return { valid: true };
}
