import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { getFeatureStore } from './storage-handlers'
import type { CreateTaskInput, CreateTaskResult, ListTasksResult, Task, DAGGraph } from '@shared/types'

let currentFeatureId: string | null = null

/**
 * Set the feature context for PM tool operations.
 * Called from the renderer before starting an agent query.
 */
export function setPMToolsFeatureContext(featureId: string | null): void {
  currentFeatureId = featureId
}

/**
 * Get the current feature context.
 */
export function getPMToolsFeatureContext(): string | null {
  return currentFeatureId
}

/**
 * Calculate next available position for a new task.
 */
function calculateNextPosition(dag: DAGGraph): { x: number; y: number } {
  if (dag.nodes.length === 0) {
    return { x: 100, y: 100 }
  }

  // Find rightmost and bottommost positions
  let maxX = 0
  let maxY = 0
  for (const node of dag.nodes) {
    if (node.position.x > maxX) maxX = node.position.x
    if (node.position.y > maxY) maxY = node.position.y
  }

  // Place new task below existing tasks
  return { x: 100, y: maxY + 150 }
}

/**
 * Register PM Tools IPC handlers for task management.
 */
export function registerPMToolsHandlers(): void {
  // Set the feature context for PM operations
  ipcMain.handle('pm-tools:setContext', async (_event, featureId: string | null): Promise<void> => {
    setPMToolsFeatureContext(featureId)
  })

  // Get the current feature context
  ipcMain.handle('pm-tools:getContext', async (): Promise<string | null> => {
    return currentFeatureId
  })

  // Create a new task
  ipcMain.handle('pm-tools:createTask', async (_event, input: CreateTaskInput): Promise<CreateTaskResult> => {
    if (!currentFeatureId) {
      return { success: false, error: 'No feature selected' }
    }

    try {
      const storage = getFeatureStore()
      if (!storage) {
        return { success: false, error: 'Storage not initialized' }
      }

      // Load current DAG
      const dag = await storage.loadDag(currentFeatureId)
      if (!dag) {
        return { success: false, error: 'DAG not found' }
      }

      // Calculate position
      const position = input.positionX !== undefined && input.positionY !== undefined
        ? { x: input.positionX, y: input.positionY }
        : calculateNextPosition(dag)

      // Create new task
      const newTask: Task = {
        id: randomUUID(),
        title: input.title,
        description: input.description,
        status: dag.nodes.length === 0 ? 'ready' : 'blocked', // First task is ready
        locked: false,
        position
      }

      // Add to DAG
      dag.nodes.push(newTask)

      // Save DAG
      await storage.saveDag(currentFeatureId, dag)

      return { success: true, taskId: newTask.id }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // List all tasks for current feature
  ipcMain.handle('pm-tools:listTasks', async (): Promise<ListTasksResult> => {
    if (!currentFeatureId) {
      return { tasks: [] }
    }

    try {
      const storage = getFeatureStore()
      if (!storage) {
        return { tasks: [] }
      }

      const dag = await storage.loadDag(currentFeatureId)

      if (!dag) {
        return { tasks: [] }
      }

      return {
        tasks: dag.nodes.map(node => ({
          id: node.id,
          title: node.title,
          status: node.status,
          description: node.description
        }))
      }
    } catch {
      return { tasks: [] }
    }
  })
}
