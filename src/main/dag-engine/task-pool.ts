import type { DAGGraph } from '@shared/types'
import type { TaskStatus } from '@shared/types/task'

/**
 * TaskPoolManager - Organizes tasks by status into pools for O(1) lookups.
 *
 * Pool structure:
 * - blocked: Tasks waiting on dependencies
 * - ready: Tasks ready for assignment (priority pool for new work)
 * - dev: Tasks being developed (active)
 * - qa: Tasks being QA verified (active)
 * - merging: Tasks being merged (active, highest priority)
 * - completed: Done tasks
 * - failed: Error tasks
 *
 * Assignment Priority: merging > qa > ready
 * (Unblocks dependents fastest by prioritizing merging)
 */
export class TaskPoolManager {
  private pools: Map<TaskStatus, Set<string>> = new Map([
    ['blocked', new Set()],
    ['ready', new Set()],
    ['dev', new Set()],
    ['qa', new Set()],
    ['merging', new Set()],
    ['completed', new Set()],
    ['failed', new Set()]
  ])

  /**
   * Initialize pools from a DAG graph.
   * Clears existing pools and populates from current task statuses.
   */
  initializeFromGraph(graph: DAGGraph): void {
    // Clear all pools
    for (const pool of this.pools.values()) {
      pool.clear()
    }

    // Populate pools from graph nodes
    for (const node of graph.nodes) {
      const pool = this.pools.get(node.status)
      if (pool) {
        pool.add(node.id)
      }
    }
  }

  /**
   * Move a task between pools.
   * @returns true if move was successful, false if task wasn't in the from pool
   */
  moveTask(taskId: string, fromStatus: TaskStatus, toStatus: TaskStatus): boolean {
    const fromPool = this.pools.get(fromStatus)
    const toPool = this.pools.get(toStatus)

    if (!fromPool || !toPool) {
      return false
    }

    // Remove from old pool
    const existed = fromPool.delete(taskId)
    if (!existed) {
      return false
    }

    // Add to new pool
    toPool.add(taskId)
    return true
  }

  /**
   * Get all task IDs in a specific pool.
   */
  getPool(status: TaskStatus): string[] {
    const pool = this.pools.get(status)
    return pool ? Array.from(pool) : []
  }

  /**
   * Get the next task to assign based on priority.
   * Priority order: merging > qa > ready
   *
   * Returns the first task from the highest priority non-empty pool,
   * or null if no tasks are available for assignment.
   */
  getNextTask(): string | null {
    // Priority order: merging, qa, ready
    const priorityOrder: TaskStatus[] = ['merging', 'qa', 'ready']

    for (const status of priorityOrder) {
      const pool = this.pools.get(status)
      if (pool && pool.size > 0) {
        // Return first task from pool (Sets preserve insertion order)
        const iterator = pool.values()
        const first = iterator.next()
        if (!first.done) {
          return first.value
        }
      }
    }

    return null
  }

  /**
   * Get counts for all pools.
   */
  getCounts(): Record<TaskStatus, number> {
    const counts: Record<TaskStatus, number> = {
      blocked: 0,
      ready: 0,
      dev: 0,
      qa: 0,
      merging: 0,
      completed: 0,
      failed: 0
    }

    for (const [status, pool] of this.pools.entries()) {
      counts[status] = pool.size
    }

    return counts
  }

  /**
   * Check if a task exists in a specific pool.
   */
  hasTask(taskId: string, status: TaskStatus): boolean {
    const pool = this.pools.get(status)
    return pool ? pool.has(taskId) : false
  }

  /**
   * Get the current status of a task based on which pool it's in.
   * Returns null if task is not found in any pool.
   */
  getTaskStatus(taskId: string): TaskStatus | null {
    for (const [status, pool] of this.pools.entries()) {
      if (pool.has(taskId)) {
        return status
      }
    }
    return null
  }
}

// Singleton instance
let poolManagerInstance: TaskPoolManager | null = null

/**
 * Get the singleton TaskPoolManager instance.
 */
export function getTaskPoolManager(): TaskPoolManager {
  if (!poolManagerInstance) {
    poolManagerInstance = new TaskPoolManager()
  }
  return poolManagerInstance
}

/**
 * Reset the TaskPoolManager singleton (for testing).
 */
export function resetTaskPoolManager(): void {
  poolManagerInstance = null
}
