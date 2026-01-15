import type { Task, DAGGraph, TaskStatus } from '@shared/types'
import type { TransitionResult, StateTransitionEvent } from './state-machine'
import { getNextStatus } from './state-machine'
import { getTaskDependencies } from './topological-sort'

export interface TaskStateChange {
  taskId: string
  previousStatus: TaskStatus
  newStatus: TaskStatus
  event: StateTransitionEvent
  timestamp: string
}

/**
 * Attempts to transition a task to a new status.
 * Returns the result of the transition attempt.
 */
export function transitionTask(
  task: Task,
  event: StateTransitionEvent,
  graph?: DAGGraph
): TransitionResult {
  const previousStatus = task.status
  const nextStatus = getNextStatus(previousStatus, event)

  if (nextStatus === null) {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: `Invalid transition: cannot trigger '${event}' from '${previousStatus}'`
    }
  }

  // Special validation for RETRY event
  if (event === 'RETRY' && graph) {
    const dependencies = getTaskDependencies(task.id, graph.connections)
    const allDependenciesMet = dependencies.every((depId) => {
      const depTask = graph.nodes.find((n) => n.id === depId)
      return depTask?.status === 'completed'
    })

    if (!allDependenciesMet) {
      return {
        success: false,
        previousStatus,
        newStatus: previousStatus,
        error: 'Cannot retry: not all dependencies are completed'
      }
    }
  }

  // Apply the transition
  task.status = nextStatus

  return {
    success: true,
    previousStatus,
    newStatus: nextStatus
  }
}

/**
 * Batch transition: applies an event to multiple tasks.
 * Returns results for each task.
 */
export function transitionTasks(
  tasks: Task[],
  event: StateTransitionEvent,
  graph?: DAGGraph
): Map<string, TransitionResult> {
  const results = new Map<string, TransitionResult>()

  for (const task of tasks) {
    results.set(task.id, transitionTask(task, event, graph))
  }

  return results
}

/**
 * Gets all tasks that can receive a specific event.
 */
export function getTasksForEvent(graph: DAGGraph, event: StateTransitionEvent): Task[] {
  return graph.nodes.filter((task) => {
    const nextStatus = getNextStatus(task.status, event)
    return nextStatus !== null
  })
}

/**
 * Initializes task statuses based on dependencies.
 * Tasks with no dependencies start as 'ready', others as 'blocked'.
 */
export function initializeTaskStatuses(graph: DAGGraph): void {
  for (const task of graph.nodes) {
    // Skip active and terminal states
    if (['completed', 'dev', 'qa', 'merging'].includes(task.status)) {
      continue
    }

    const dependencies = getTaskDependencies(task.id, graph.connections)

    if (dependencies.length === 0) {
      task.status = 'ready'
    } else {
      const allDependenciesMet = dependencies.every((depId) => {
        const depTask = graph.nodes.find((n) => n.id === depId)
        return depTask?.status === 'completed'
      })

      task.status = allDependenciesMet ? 'ready' : 'blocked'
    }
  }
}

/**
 * Creates a state change record for logging.
 */
export function createStateChangeRecord(
  taskId: string,
  previousStatus: TaskStatus,
  newStatus: TaskStatus,
  event: StateTransitionEvent
): TaskStateChange {
  return {
    taskId,
    previousStatus,
    newStatus,
    event,
    timestamp: new Date().toISOString()
  }
}
