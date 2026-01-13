import type { DAGGraph, Task, TaskStatus } from '@shared/types'
import type { DAGAnalysis, TaskDependencies } from './types'
import { topologicalSort, getTaskDependencies, getTaskDependents } from './topological-sort'

const COMPLETED_STATUSES: TaskStatus[] = ['completed']
const RUNNING_STATUSES: TaskStatus[] = ['running', 'merging']

/**
 * Analyzes a DAG to determine task dependencies and ready/blocked states.
 */
export function analyzeDAG(graph: DAGGraph): DAGAnalysis {
  const { nodes, connections } = graph

  // Perform topological sort
  const topologicalOrder = topologicalSort(graph)

  // Build dependency map for all tasks
  const taskDependencies = new Map<string, TaskDependencies>()

  for (const node of nodes) {
    const dependsOn = getTaskDependencies(node.id, connections)
    const dependents = getTaskDependents(node.id, connections)

    // Find which dependencies are not yet completed
    const blockedBy = dependsOn.filter((depId) => {
      const depNode = nodes.find((n) => n.id === depId)
      return depNode && !COMPLETED_STATUSES.includes(depNode.status)
    })

    taskDependencies.set(node.id, {
      taskId: node.id,
      dependsOn,
      blockedBy,
      dependents
    })
  }

  // Categorize tasks by current state
  const readyTasks: string[] = []
  const blockedTasks: string[] = []
  const completedTasks: string[] = []
  const runningTasks: string[] = []

  for (const node of nodes) {
    if (COMPLETED_STATUSES.includes(node.status)) {
      completedTasks.push(node.id)
    } else if (RUNNING_STATUSES.includes(node.status)) {
      runningTasks.push(node.id)
    } else {
      // Check if all dependencies are completed
      const deps = taskDependencies.get(node.id)
      if (deps && deps.blockedBy.length === 0) {
        readyTasks.push(node.id)
      } else {
        blockedTasks.push(node.id)
      }
    }
  }

  return {
    topologicalOrder,
    taskDependencies,
    readyTasks,
    blockedTasks,
    completedTasks,
    runningTasks
  }
}

/**
 * Gets tasks that are ready to execute (all dependencies completed, not running/completed).
 * Used by execution engine to find next tasks to assign agents.
 */
export function getReadyTasks(graph: DAGGraph): Task[] {
  const analysis = analyzeDAG(graph)
  return graph.nodes.filter((n) => analysis.readyTasks.includes(n.id) && n.status === 'ready')
}

/**
 * Checks if a specific task is ready to execute.
 */
export function isTaskReady(taskId: string, graph: DAGGraph): boolean {
  const task = graph.nodes.find((n) => n.id === taskId)
  if (!task) return false

  // Already running or completed
  if (['running', 'merging', 'completed'].includes(task.status)) {
    return false
  }

  // Check all dependencies are completed
  const dependencies = getTaskDependencies(taskId, graph.connections)
  return dependencies.every((depId) => {
    const depTask = graph.nodes.find((n) => n.id === depId)
    return depTask?.status === 'completed'
  })
}

/**
 * Updates task statuses based on dependency state.
 * Returns tasks whose status changed from blocked to ready.
 */
export function updateTaskStatuses(graph: DAGGraph): string[] {
  const newlyReady: string[] = []

  for (const node of graph.nodes) {
    // Only update blocked tasks
    if (node.status !== 'blocked') continue

    // Check if all dependencies are now completed
    const dependencies = getTaskDependencies(node.id, graph.connections)
    const allCompleted = dependencies.every((depId) => {
      const depTask = graph.nodes.find((n) => n.id === depId)
      return depTask?.status === 'completed'
    })

    if (allCompleted) {
      node.status = 'ready'
      newlyReady.push(node.id)
    }
  }

  return newlyReady
}
