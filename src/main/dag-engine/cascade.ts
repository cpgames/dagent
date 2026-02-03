import type { DAGGraph } from '@shared/types'
import type { TaskStateChange } from './task-controller'
import { getTaskDependents, getTaskDependencies } from './topological-sort'
import { createStateChangeRecord } from './task-controller'

export interface CascadeResult {
  changes: TaskStateChange[]
  errors: Array<{ taskId: string; error: string }>
}

/**
 * When a task completes (archives), check and update dependent tasks.
 * Dependents may have their blocked flag set to false.
 */
export function cascadeTaskCompletion(completedTaskId: string, graph: DAGGraph): CascadeResult {
  const changes: TaskStateChange[] = []
  const errors: Array<{ taskId: string; error: string }> = []

  // Get tasks that depend on the completed task
  const dependentIds = getTaskDependents(completedTaskId, graph.connections)

  for (const depId of dependentIds) {
    const depTask = graph.nodes.find((n) => n.id === depId)
    if (!depTask || !depTask.blocked) continue

    // Check if ALL dependencies are now completed (archived)
    const allDependencies = getTaskDependencies(depId, graph.connections)
    const allMet = allDependencies.every((id) => {
      const task = graph.nodes.find((n) => n.id === id)
      return task?.status === 'done'
    })

    if (allMet) {
      const previousStatus = depTask.status
      depTask.blocked = false
      changes.push(
        createStateChangeRecord(depId, previousStatus, depTask.status, 'DEPENDENCIES_MET')
      )
    }
  }

  return { changes, errors }
}

/**
 * When a task fails, optionally cascade failure status to dependents.
 * This is useful for showing which tasks are blocked by failures.
 * Does NOT actually change their status, just identifies affected tasks.
 */
export function getAffectedByFailure(failedTaskId: string, graph: DAGGraph): string[] {
  const affected: string[] = []
  const visited = new Set<string>()
  const queue = [failedTaskId]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)

    const dependents = getTaskDependents(current, graph.connections)
    for (const depId of dependents) {
      if (!visited.has(depId)) {
        affected.push(depId)
        queue.push(depId)
      }
    }
  }

  return affected
}

/**
 * Resets a task and all its dependents to blocked status.
 * Used when a task needs to be re-run.
 */
export function resetTaskAndDependents(taskId: string, graph: DAGGraph): CascadeResult {
  const changes: TaskStateChange[] = []
  const errors: Array<{ taskId: string; error: string }> = []

  // Get task and all downstream dependents
  const toReset = [taskId, ...getAffectedByFailure(taskId, graph)]

  for (const id of toReset) {
    const task = graph.nodes.find((n) => n.id === id)
    if (!task) continue

    // Skip already blocked tasks
    if (task.blocked) continue

    const previousStatus = task.status
    task.blocked = true
    task.status = 'ready'

    changes.push(createStateChangeRecord(id, previousStatus, 'ready', 'REANALYZE'))
  }

  return { changes, errors }
}

/**
 * Recalculates all task blocked flags based on current dependency state.
 * Useful after loading a graph or making structural changes.
 */
export function recalculateAllStatuses(graph: DAGGraph): CascadeResult {
  const changes: TaskStateChange[] = []
  const errors: Array<{ taskId: string; error: string }> = []

  for (const task of graph.nodes) {
    // Skip active and terminal states
    if (['analyzing', 'developing', 'verifying', 'archived'].includes(task.status)) {
      continue
    }

    const dependencies = getTaskDependencies(task.id, graph.connections)

    // Check if all dependencies are completed (archived)
    const allMet =
      dependencies.length === 0 ||
      dependencies.every((depId) => {
        const depTask = graph.nodes.find((n) => n.id === depId)
        return depTask?.status === 'done'
      })

    const previousBlocked = task.blocked
    task.blocked = !allMet

    if (previousBlocked !== task.blocked) {
      const previousStatus = task.status
      changes.push(
        createStateChangeRecord(
          task.id,
          previousStatus,
          task.status,
          allMet ? 'DEPENDENCIES_MET' : 'DEPENDENCY_CHANGED'
        )
      )
    }
  }

  return { changes, errors }
}
