/**
 * PM DAG Handler functions for DAGManager operations.
 * These handlers provide PM agent with access to DAGManager API for:
 * - Creating tasks with automatic vertical placement
 * - Adding connections with cycle validation
 * - Removing nodes and connections
 */

import { randomUUID } from 'crypto'
import { getPMToolsFeatureContext } from './pm-tools-handlers'
import type { Task, TaskStatus } from '@shared/types'

/**
 * Get the current feature context and project root.
 * Returns null if no feature selected or context incomplete.
 */
async function getFeatureContext(): Promise<{ featureId: string; projectRoot: string } | null> {
  const featureId = getPMToolsFeatureContext()
  if (!featureId) {
    return null
  }

  // Get project root from storage handlers
  const { getProjectRoot } = await import('./storage-handlers')
  const projectRoot = getProjectRoot()
  if (!projectRoot) {
    return null
  }

  return { featureId, projectRoot }
}

/**
 * Result type for DAG operations.
 */
interface DAGOperationResult {
  success: boolean
  error?: string
  taskId?: string
  connectionId?: string
}

/**
 * Add a new task node to the DAG with automatic vertical placement.
 * DAGManager handles positioning in top-to-bottom flow.
 */
export async function pmDAGAddNode(input: {
  title: string
  description: string
  dependsOn?: string[]
}): Promise<DAGOperationResult> {
  const context = await getFeatureContext()
  if (!context) {
    return { success: false, error: 'No feature selected or project not initialized' }
  }

  try {
    // Import DAGManager access from dag-handlers
    const { getDAGManager } = await import('./dag-handlers')
    const manager = await getDAGManager(context.featureId, context.projectRoot)

    // Determine initial status based on dependencies
    let status: TaskStatus = 'ready_for_dev'
    if (input.dependsOn && input.dependsOn.length > 0) {
      // Check if all dependencies are completed
      const graph = manager.getGraph()
      const allDepsCompleted = input.dependsOn.every((depId) => {
        const dep = graph.nodes.find((n) => n.id === depId)
        return dep && dep.status === 'completed'
      })
      status = allDepsCompleted ? 'ready_for_dev' : 'blocked'
    }

    // Create task object
    const taskId = randomUUID()
    const task: Partial<Task> = {
      id: taskId,
      title: input.title,
      description: input.description,
      status,
      locked: false
      // Position will be calculated by DAGManager
    }

    // Add node via DAGManager (auto-placement)
    const addedTask = await manager.addNode(task)

    // Add connections for dependencies
    if (input.dependsOn && input.dependsOn.length > 0) {
      for (const depId of input.dependsOn) {
        const connection = await manager.addConnection(depId, addedTask.id)
        if (!connection) {
          console.warn(`[DAGent] Failed to add dependency ${depId} -> ${addedTask.id}`)
        }
      }
    }

    return { success: true, taskId: addedTask.id }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error adding node'
    }
  }
}

/**
 * Add a dependency connection between tasks with cycle validation.
 * Creates edge from source to target (source must complete before target starts).
 */
export async function pmDAGAddConnection(input: {
  sourceTaskId: string
  targetTaskId: string
}): Promise<DAGOperationResult> {
  const context = await getFeatureContext()
  if (!context) {
    return { success: false, error: 'No feature selected or project not initialized' }
  }

  try {
    const { getDAGManager } = await import('./dag-handlers')
    const manager = await getDAGManager(context.featureId, context.projectRoot)

    // Add connection with cycle validation
    const connection = await manager.addConnection(input.sourceTaskId, input.targetTaskId)

    if (!connection) {
      return {
        success: false,
        error: `Would create a cycle: adding ${input.sourceTaskId} -> ${input.targetTaskId} would create a circular dependency`
      }
    }

    const connectionId = `${input.sourceTaskId}->${input.targetTaskId}`
    return { success: true, connectionId }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error adding connection'
    }
  }
}

/**
 * Remove a task node and all connected edges from the DAG.
 */
export async function pmDAGRemoveNode(input: { taskId: string }): Promise<DAGOperationResult> {
  const context = await getFeatureContext()
  if (!context) {
    return { success: false, error: 'No feature selected or project not initialized' }
  }

  try {
    const { getDAGManager } = await import('./dag-handlers')
    const manager = await getDAGManager(context.featureId, context.projectRoot)

    await manager.removeNode(input.taskId)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error removing node'
    }
  }
}

/**
 * Remove a dependency connection between two tasks.
 */
export async function pmDAGRemoveConnection(input: {
  sourceTaskId: string
  targetTaskId: string
}): Promise<DAGOperationResult> {
  const context = await getFeatureContext()
  if (!context) {
    return { success: false, error: 'No feature selected or project not initialized' }
  }

  try {
    const { getDAGManager } = await import('./dag-handlers')
    const manager = await getDAGManager(context.featureId, context.projectRoot)

    // Build connectionId as "sourceTaskId->targetTaskId"
    const connectionId = `${input.sourceTaskId}->${input.targetTaskId}`
    await manager.removeConnection(connectionId)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error removing connection'
    }
  }
}
