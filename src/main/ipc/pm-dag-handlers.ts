/**
 * PM DAG Handler functions for DAGManager operations.
 * These handlers provide PM agent with access to DAGManager API for:
 * - Creating tasks with automatic layout
 * - Adding connections with cycle validation
 * - Removing nodes and connections
 *
 * All operations trigger automatic layout recalculation.
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
 * Add a new task node to the DAG.
 * Auto-layout is applied after adding the node and connections.
 */
export async function pmDAGAddNode(input: {
  title: string
  description: string
  dependsOn?: string[]
}): Promise<DAGOperationResult> {
  console.log(`[pmDAGAddNode] Called with title="${input.title}", deps=${JSON.stringify(input.dependsOn)}`)

  const context = await getFeatureContext()
  if (!context) {
    console.log('[pmDAGAddNode] Error: No feature context')
    return { success: false, error: 'No feature selected or project not initialized' }
  }

  console.log(`[pmDAGAddNode] Context: featureId=${context.featureId}, projectRoot=${context.projectRoot}`)

  try {
    // Import DAGManager access from dag-handlers
    const { getDAGManager } = await import('./dag-handlers')
    const manager = await getDAGManager(context.featureId, context.projectRoot)
    console.log(`[pmDAGAddNode] Got DAGManager`)

    const graph = manager.getGraph()

    // Determine initial status based on dependencies
    let status: TaskStatus = 'ready_for_dev'
    if (input.dependsOn && input.dependsOn.length > 0) {
      // Check if all dependencies are completed
      const allDepsCompleted = input.dependsOn.every((depId) => {
        const dep = graph.nodes.find((n) => n.id === depId)
        return dep && dep.status === 'completed'
      })
      status = allDepsCompleted ? 'ready_for_dev' : 'blocked'
    }

    // Create task object (position will be set by auto-layout)
    const taskId = randomUUID()
    const task: Partial<Task> = {
      id: taskId,
      title: input.title,
      description: input.description,
      status,
      locked: false,
      position: { x: 0, y: 0 } // Temporary, will be recalculated
    }

    // Add node via DAGManager
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

    // Apply auto-layout to recalculate all positions
    console.log(`[pmDAGAddNode] Applying auto-layout`)
    await manager.applyAutoLayout()
    console.log(`[pmDAGAddNode] Auto-layout applied, task ${addedTask.id} added successfully`)

    return { success: true, taskId: addedTask.id }
  } catch (error) {
    console.error('[pmDAGAddNode] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error adding node'
    }
  }
}

/**
 * Add a dependency connection between tasks with cycle validation.
 * Creates edge from source to target (source must complete before target starts).
 * Auto-layout is applied after adding the connection.
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

    // Apply auto-layout to recalculate positions based on new dependency
    await manager.applyAutoLayout()

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
 * Auto-layout is applied after removing the node.
 */
export async function pmDAGRemoveNode(input: { taskId: string }): Promise<DAGOperationResult> {
  console.log(`[pmDAGRemoveNode] Called with taskId=${input.taskId}`)

  const context = await getFeatureContext()
  if (!context) {
    console.log('[pmDAGRemoveNode] Error: No feature selected or project not initialized')
    return { success: false, error: 'No feature selected or project not initialized' }
  }

  console.log(`[pmDAGRemoveNode] Context: featureId=${context.featureId}`)

  try {
    const { getDAGManager } = await import('./dag-handlers')
    const manager = await getDAGManager(context.featureId, context.projectRoot)

    const graphBefore = manager.getGraph()
    console.log(`[pmDAGRemoveNode] Before: ${graphBefore.nodes.length} nodes: ${graphBefore.nodes.map(n => n.id).join(', ')}`)

    await manager.removeNode(input.taskId)

    // Apply auto-layout to recalculate positions
    await manager.applyAutoLayout()

    const graphAfter = manager.getGraph()
    console.log(`[pmDAGRemoveNode] After: ${graphAfter.nodes.length} nodes`)

    return { success: true }
  } catch (error) {
    console.error('[pmDAGRemoveNode] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error removing node'
    }
  }
}

/**
 * Remove a dependency connection between two tasks.
 * Auto-layout is applied after removing the connection.
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

    // Apply auto-layout to recalculate positions
    await manager.applyAutoLayout()

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error removing connection'
    }
  }
}
