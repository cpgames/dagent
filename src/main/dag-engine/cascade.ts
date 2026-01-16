import type { DAGGraph, TaskStatus } from '@shared/types'
import type { TaskStateChange } from './task-controller'
import { getTaskDependents, getTaskDependencies } from './topological-sort'
import { transitionTask, createStateChangeRecord } from './task-controller'

export interface CascadeResult {
  changes: TaskStateChange[]
  errors: Array<{ taskId: string; error: string }>
}

/**
 * When a task completes, check and update dependent tasks.
 * Dependents may transition from 'blocked' to 'ready_for_dev'.
 */
export function cascadeTaskCompletion(completedTaskId: string, graph: DAGGraph): CascadeResult {
  const changes: TaskStateChange[] = []
  const errors: Array<{ taskId: string; error: string }> = []

  // Get tasks that depend on the completed task
  const dependentIds = getTaskDependents(completedTaskId, graph.connections)

  for (const depId of dependentIds) {
    const depTask = graph.nodes.find((n) => n.id === depId)
    if (!depTask || depTask.status !== 'blocked') continue

    // Check if ALL dependencies are now completed
    const allDependencies = getTaskDependencies(depId, graph.connections)
    const allMet = allDependencies.every((id) => {
      const task = graph.nodes.find((n) => n.id === id)
      return task?.status === 'completed'
    })

    if (allMet) {
      const result = transitionTask(depTask, 'DEPENDENCIES_MET')
      if (result.success) {
        changes.push(
          createStateChangeRecord(depId, result.previousStatus, result.newStatus, 'DEPENDENCIES_MET')
        )
      } else if (result.error) {
        errors.push({ taskId: depId, error: result.error })
      }
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
    if (task.status === 'blocked') continue

    const previousStatus = task.status
    const result = transitionTask(task, 'RESET')

    if (result.success) {
      changes.push(createStateChangeRecord(id, previousStatus, result.newStatus, 'RESET'))
    } else if (result.error) {
      errors.push({ taskId: id, error: result.error })
    }
  }

  return { changes, errors }
}

/**
 * Recalculates all task statuses based on current dependency state.
 * Useful after loading a graph or making structural changes.
 */
export function recalculateAllStatuses(graph: DAGGraph): CascadeResult {
  const changes: TaskStateChange[] = []
  const errors: Array<{ taskId: string; error: string }> = []

  for (const task of graph.nodes) {
    // Skip active and terminal states
    if (['in_progress', 'ready_for_qa', 'ready_for_merge', 'completed'].includes(task.status)) {
      continue
    }

    const dependencies = getTaskDependencies(task.id, graph.connections)

    // Check if all dependencies are completed
    const allMet =
      dependencies.length === 0 ||
      dependencies.every((depId) => {
        const depTask = graph.nodes.find((n) => n.id === depId)
        return depTask?.status === 'completed'
      })

    const targetStatus: TaskStatus = allMet ? 'ready_for_dev' : 'blocked'

    if (task.status !== targetStatus && task.status !== 'failed') {
      const previousStatus = task.status
      task.status = targetStatus

      changes.push(
        createStateChangeRecord(
          task.id,
          previousStatus,
          targetStatus,
          allMet ? 'DEPENDENCIES_MET' : 'DEPENDENCY_CHANGED'
        )
      )
    }
  }

  return { changes, errors }
}
