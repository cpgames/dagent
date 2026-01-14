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
  UpdateTaskInput,
  UpdateTaskResult,
  DeleteTaskInput,
  DeleteTaskResult,
  RemoveDependencyInput,
  RemoveDependencyResult,
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

  // Update an existing task
  ipcMain.handle(
    'pm-tools:updateTask',
    async (_event, input: UpdateTaskInput): Promise<UpdateTaskResult> => {
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

        // Find the task
        const taskIndex = dag.nodes.findIndex((n) => n.id === input.taskId)
        if (taskIndex < 0) {
          return { success: false, error: 'Task not found' }
        }

        // Update only provided fields
        if (input.title !== undefined) {
          dag.nodes[taskIndex].title = input.title
        }
        if (input.description !== undefined) {
          dag.nodes[taskIndex].description = input.description
        }

        await storage.saveDag(currentFeatureId, dag)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )

  // Delete a task with dependency handling
  ipcMain.handle(
    'pm-tools:deleteTask',
    async (_event, input: DeleteTaskInput): Promise<DeleteTaskResult> => {
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

        // Find the task
        const task = dag.nodes.find((n) => n.id === input.taskId)
        if (!task) {
          return { success: false, error: 'Task not found' }
        }

        const mode = input.reassignDependents || 'reconnect'
        const deletedTaskIds: string[] = [input.taskId]

        // Get task's dependencies (tasks this depends on)
        const taskDependencies = dag.connections
          .filter((c) => c.to === input.taskId)
          .map((c) => c.from)

        // Get task's dependents (tasks that depend on this)
        const taskDependents = dag.connections
          .filter((c) => c.from === input.taskId)
          .map((c) => c.to)

        if (mode === 'cascade') {
          // Collect all transitive dependents
          const toDelete = new Set<string>([input.taskId])
          const queue = [...taskDependents]

          while (queue.length > 0) {
            const depId = queue.shift()!
            if (!toDelete.has(depId)) {
              toDelete.add(depId)
              deletedTaskIds.push(depId)
              // Add this task's dependents to queue
              const nextDeps = dag.connections.filter((c) => c.from === depId).map((c) => c.to)
              queue.push(...nextDeps)
            }
          }

          // Remove all tasks in toDelete set
          dag.nodes = dag.nodes.filter((n) => !toDelete.has(n.id))
          // Remove all connections involving deleted tasks
          dag.connections = dag.connections.filter(
            (c) => !toDelete.has(c.from) && !toDelete.has(c.to)
          )
        } else if (mode === 'reconnect') {
          // For each dependent, add connections to this task's dependencies
          for (const dependentId of taskDependents) {
            for (const depId of taskDependencies) {
              // Check if connection already exists
              const exists = dag.connections.some(
                (c) => c.from === depId && c.to === dependentId
              )
              if (!exists) {
                dag.connections.push({ from: depId, to: dependentId })
              }
            }
          }

          // Remove the task
          dag.nodes = dag.nodes.filter((n) => n.id !== input.taskId)
          // Remove all connections involving this task
          dag.connections = dag.connections.filter(
            (c) => c.from !== input.taskId && c.to !== input.taskId
          )
        } else {
          // orphan mode - just remove task and its connections
          dag.nodes = dag.nodes.filter((n) => n.id !== input.taskId)
          dag.connections = dag.connections.filter(
            (c) => c.from !== input.taskId && c.to !== input.taskId
          )
        }

        // Update status of tasks that may now be ready
        for (const node of dag.nodes) {
          if (node.status === 'blocked') {
            // Check if all dependencies are completed
            const nodeDeps = dag.connections.filter((c) => c.to === node.id).map((c) => c.from)
            const allDepsComplete = nodeDeps.every((depId) => {
              const dep = dag.nodes.find((n) => n.id === depId)
              return dep && dep.status === 'completed'
            })
            // If no dependencies or all complete, set to ready
            if (nodeDeps.length === 0 || allDepsComplete) {
              node.status = 'ready'
            }
          }
        }

        await storage.saveDag(currentFeatureId, dag)
        return { success: true, deletedTaskIds }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )

  // Remove a dependency between two tasks
  ipcMain.handle(
    'pm-tools:removeDependency',
    async (_event, input: RemoveDependencyInput): Promise<RemoveDependencyResult> => {
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

        // Find the connection
        const connectionIndex = dag.connections.findIndex(
          (c) => c.from === input.fromTaskId && c.to === input.toTaskId
        )
        if (connectionIndex < 0) {
          return { success: false, error: 'Dependency does not exist' }
        }

        // Remove the connection
        dag.connections.splice(connectionIndex, 1)

        // Check if toTask should become ready
        let statusChanged = false
        if (toTask.status === 'blocked') {
          // Check remaining dependencies
          const remainingDeps = dag.connections
            .filter((c) => c.to === input.toTaskId)
            .map((c) => c.from)

          // Check if all remaining deps are completed
          const allRemainingComplete = remainingDeps.every((depId) => {
            const dep = dag.nodes.find((n) => n.id === depId)
            return dep && dep.status === 'completed'
          })

          // If no remaining deps or all complete, set to ready
          if (remainingDeps.length === 0 || allRemainingComplete) {
            const toIndex = dag.nodes.findIndex((n) => n.id === input.toTaskId)
            if (toIndex >= 0) {
              dag.nodes[toIndex].status = 'ready'
              statusChanged = true
            }
          }
        }

        await storage.saveDag(currentFeatureId, dag)
        return { success: true, statusChanged }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )
}

/**
 * Direct function exports for MCP server (bypasses IPC)
 * These allow the PM MCP server to call the same logic without going through IPC
 */

export async function pmCreateTask(input: CreateTaskInput): Promise<CreateTaskResult> {
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

    const position = calculatePosition(dag, input)

    let status: TaskStatus = 'ready'
    if (input.dependsOn && input.dependsOn.length > 0) {
      const allDepsCompleted = input.dependsOn.every((depId) => {
        const dep = dag.nodes.find((n) => n.id === depId)
        return dep && dep.status === 'completed'
      })
      status = allDepsCompleted ? 'ready' : 'blocked'
    } else if (dag.nodes.length > 0) {
      status = 'blocked'
    }

    const newTask: Task = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      status,
      locked: false,
      position
    }

    dag.nodes.push(newTask)

    if (input.dependsOn) {
      for (const depId of input.dependsOn) {
        if (dag.nodes.find((n) => n.id === depId)) {
          dag.connections.push({ from: depId, to: newTask.id })
        }
      }
    }

    await storage.saveDag(currentFeatureId, dag)
    return { success: true, taskId: newTask.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function pmListTasks(): Promise<ListTasksResult> {
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
}

export async function pmGetTask(input: GetTaskInput): Promise<GetTaskResult> {
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

    const dependencies = dag.connections.filter((c) => c.to === input.taskId).map((c) => c.from)
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
}

export async function pmUpdateTask(input: UpdateTaskInput): Promise<UpdateTaskResult> {
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

    const taskIndex = dag.nodes.findIndex((n) => n.id === input.taskId)
    if (taskIndex < 0) {
      return { success: false, error: 'Task not found' }
    }

    if (input.title !== undefined) {
      dag.nodes[taskIndex].title = input.title
    }
    if (input.description !== undefined) {
      dag.nodes[taskIndex].description = input.description
    }

    await storage.saveDag(currentFeatureId, dag)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function pmDeleteTask(input: DeleteTaskInput): Promise<DeleteTaskResult> {
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

    const task = dag.nodes.find((n) => n.id === input.taskId)
    if (!task) {
      return { success: false, error: 'Task not found' }
    }

    const mode = input.reassignDependents || 'reconnect'
    const deletedTaskIds: string[] = [input.taskId]

    const taskDependencies = dag.connections
      .filter((c) => c.to === input.taskId)
      .map((c) => c.from)

    const taskDependents = dag.connections
      .filter((c) => c.from === input.taskId)
      .map((c) => c.to)

    if (mode === 'cascade') {
      const toDelete = new Set<string>([input.taskId])
      const queue = [...taskDependents]

      while (queue.length > 0) {
        const depId = queue.shift()!
        if (!toDelete.has(depId)) {
          toDelete.add(depId)
          deletedTaskIds.push(depId)
          const nextDeps = dag.connections.filter((c) => c.from === depId).map((c) => c.to)
          queue.push(...nextDeps)
        }
      }

      dag.nodes = dag.nodes.filter((n) => !toDelete.has(n.id))
      dag.connections = dag.connections.filter(
        (c) => !toDelete.has(c.from) && !toDelete.has(c.to)
      )
    } else if (mode === 'reconnect') {
      for (const dependentId of taskDependents) {
        for (const depId of taskDependencies) {
          const exists = dag.connections.some(
            (c) => c.from === depId && c.to === dependentId
          )
          if (!exists) {
            dag.connections.push({ from: depId, to: dependentId })
          }
        }
      }

      dag.nodes = dag.nodes.filter((n) => n.id !== input.taskId)
      dag.connections = dag.connections.filter(
        (c) => c.from !== input.taskId && c.to !== input.taskId
      )
    } else {
      dag.nodes = dag.nodes.filter((n) => n.id !== input.taskId)
      dag.connections = dag.connections.filter(
        (c) => c.from !== input.taskId && c.to !== input.taskId
      )
    }

    for (const node of dag.nodes) {
      if (node.status === 'blocked') {
        const nodeDeps = dag.connections.filter((c) => c.to === node.id).map((c) => c.from)
        const allDepsComplete = nodeDeps.every((depId) => {
          const dep = dag.nodes.find((n) => n.id === depId)
          return dep && dep.status === 'completed'
        })
        if (nodeDeps.length === 0 || allDepsComplete) {
          node.status = 'ready'
        }
      }
    }

    await storage.saveDag(currentFeatureId, dag)
    return { success: true, deletedTaskIds }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function pmAddDependency(input: AddDependencyInput): Promise<AddDependencyResult> {
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

    const fromTask = dag.nodes.find((n) => n.id === input.fromTaskId)
    const toTask = dag.nodes.find((n) => n.id === input.toTaskId)

    if (!fromTask) {
      return { success: false, error: `Task ${input.fromTaskId} not found` }
    }
    if (!toTask) {
      return { success: false, error: `Task ${input.toTaskId} not found` }
    }

    const exists = dag.connections.some(
      (c) => c.from === input.fromTaskId && c.to === input.toTaskId
    )
    if (exists) {
      return { success: false, error: 'Dependency already exists' }
    }

    dag.connections.push({ from: input.fromTaskId, to: input.toTaskId })

    if (toTask.status === 'ready' && fromTask.status !== 'completed') {
      const toIndex = dag.nodes.findIndex((n) => n.id === input.toTaskId)
      if (toIndex >= 0) {
        dag.nodes[toIndex].status = 'blocked'
      }
    }

    await storage.saveDag(currentFeatureId, dag)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function pmRemoveDependency(input: RemoveDependencyInput): Promise<RemoveDependencyResult> {
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

    const fromTask = dag.nodes.find((n) => n.id === input.fromTaskId)
    const toTask = dag.nodes.find((n) => n.id === input.toTaskId)

    if (!fromTask) {
      return { success: false, error: `Task ${input.fromTaskId} not found` }
    }
    if (!toTask) {
      return { success: false, error: `Task ${input.toTaskId} not found` }
    }

    const connectionIndex = dag.connections.findIndex(
      (c) => c.from === input.fromTaskId && c.to === input.toTaskId
    )
    if (connectionIndex < 0) {
      return { success: false, error: 'Dependency does not exist' }
    }

    dag.connections.splice(connectionIndex, 1)

    let statusChanged = false
    if (toTask.status === 'blocked') {
      const remainingDeps = dag.connections
        .filter((c) => c.to === input.toTaskId)
        .map((c) => c.from)

      const allRemainingComplete = remainingDeps.every((depId) => {
        const dep = dag.nodes.find((n) => n.id === depId)
        return dep && dep.status === 'completed'
      })

      if (remainingDeps.length === 0 || allRemainingComplete) {
        const toIndex = dag.nodes.findIndex((n) => n.id === input.toTaskId)
        if (toIndex >= 0) {
          dag.nodes[toIndex].status = 'ready'
          statusChanged = true
        }
      }
    }

    await storage.saveDag(currentFeatureId, dag)
    return { success: true, statusChanged }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
