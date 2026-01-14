import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { getFeatureStore } from './storage-handlers'
import type {
  CreateTaskInput,
  CreateTaskResult,
  ListTasksResult,
  AddDependencyInput,
  AddDependencyResult,
  GetTaskInput,
  GetTaskResult,
  Task,
  TaskStatus,
  DAGGraph
} from '@shared/types'

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
 * Calculate position for a new task based on dependencies.
 */
function calculatePosition(dag: DAGGraph, input: CreateTaskInput): { x: number; y: number } {
  // If position explicitly provided, use it
  if (input.positionX !== undefined && input.positionY !== undefined) {
    return { x: input.positionX, y: input.positionY }
  }

  // Empty DAG - start at origin
  if (dag.nodes.length === 0) {
    return { x: 100, y: 100 }
  }

  // If has dependencies, position below them
  if (input.dependsOn && input.dependsOn.length > 0) {
    let maxY = 0
    let avgX = 0
    let count = 0

    for (const depId of input.dependsOn) {
      const dep = dag.nodes.find((n) => n.id === depId)
      if (dep) {
        if (dep.position.y > maxY) maxY = dep.position.y
        avgX += dep.position.x
        count++
      }
    }

    return {
      x: count > 0 ? avgX / count : 100,
      y: maxY + 150
    }
  }

  // No dependencies - place at bottom
  let maxY = 0
  for (const node of dag.nodes) {
    if (node.position.y > maxY) maxY = node.position.y
  }
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

      // Calculate position based on dependencies
      const position = calculatePosition(dag, input)

      // Determine initial status based on dependencies
      let status: TaskStatus = 'ready'
      if (input.dependsOn && input.dependsOn.length > 0) {
        // Check if all dependencies are completed
        const allDepsCompleted = input.dependsOn.every((depId) => {
          const dep = dag.nodes.find((n) => n.id === depId)
          return dep && dep.status === 'completed'
        })
        status = allDepsCompleted ? 'ready' : 'blocked'
      } else if (dag.nodes.length > 0) {
        // No explicit deps but other tasks exist - default blocked
        status = 'blocked'
      }

      // Create new task
      const newTask: Task = {
        id: randomUUID(),
        title: input.title,
        description: input.description,
        status,
        locked: false,
        position
      }

      // Add to DAG
      dag.nodes.push(newTask)

      // Add connections for dependencies
      if (input.dependsOn) {
        for (const depId of input.dependsOn) {
          // Verify dependency exists
          if (dag.nodes.find((n) => n.id === depId)) {
            dag.connections.push({
              from: depId,
              to: newTask.id
            })
          }
        }
      }

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
        tasks: dag.nodes.map((node) => ({
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

  // Add a dependency between two existing tasks
  ipcMain.handle(
    'pm-tools:addDependency',
    async (_event, input: AddDependencyInput): Promise<AddDependencyResult> => {
      if (!currentFeatureId) {
        return { success: false, error: 'No feature selected' }
      }

      try {
        const storage = getFeatureStore()
        if (!storage) {
          return { success: false, error: 'Storage not initialized' }
        }

        const dag = await storage.loadDag(currentFeatureId)
        if (!dag) {
          return { success: false, error: 'DAG not found' }
        }

        // Verify both tasks exist
        const fromTask = dag.nodes.find((n) => n.id === input.fromTaskId)
        const toTask = dag.nodes.find((n) => n.id === input.toTaskId)

        if (!fromTask) {
          return { success: false, error: `Task ${input.fromTaskId} not found` }
        }
        if (!toTask) {
          return { success: false, error: `Task ${input.toTaskId} not found` }
        }

        // Check for existing connection
        const exists = dag.connections.some(
          (c) => c.from === input.fromTaskId && c.to === input.toTaskId
        )
        if (exists) {
          return { success: false, error: 'Dependency already exists' }
        }

        // Check for cycle (simple check - would create reverse path)
        const wouldCreateCycle = dag.connections.some(
          (c) => c.from === input.toTaskId && c.to === input.fromTaskId
        )
        if (wouldCreateCycle) {
          return { success: false, error: 'Would create circular dependency' }
        }

        // Add connection
        dag.connections.push({
          from: input.fromTaskId,
          to: input.toTaskId
        })

        // Update toTask status if fromTask not completed
        if (fromTask.status !== 'completed') {
          const toIndex = dag.nodes.findIndex((n) => n.id === input.toTaskId)
          if (toIndex >= 0 && dag.nodes[toIndex].status === 'ready') {
            dag.nodes[toIndex].status = 'blocked'
          }
        }

        await storage.saveDag(currentFeatureId, dag)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )

  // Get detailed information about a specific task
  ipcMain.handle('pm-tools:getTask', async (_event, input: GetTaskInput): Promise<GetTaskResult> => {
    if (!currentFeatureId) {
      return { task: null, error: 'No feature selected' }
    }

    try {
      const storage = getFeatureStore()
      if (!storage) {
        return { task: null, error: 'Storage not initialized' }
      }

      const dag = await storage.loadDag(currentFeatureId)
      if (!dag) {
        return { task: null, error: 'DAG not found' }
      }

      const task = dag.nodes.find((n) => n.id === input.taskId)
      if (!task) {
        return { task: null, error: 'Task not found' }
      }

      // Find dependencies (tasks this task depends on)
      const dependencies = dag.connections.filter((c) => c.to === input.taskId).map((c) => c.from)

      // Find dependents (tasks that depend on this task)
      const dependents = dag.connections.filter((c) => c.from === input.taskId).map((c) => c.to)

      return {
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          description: task.description,
          dependencies,
          dependents
        }
      }
    } catch (error) {
      return { task: null, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
}
