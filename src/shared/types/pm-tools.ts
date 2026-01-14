/**
 * PM Agent tool types for task management
 */

/**
 * Input for creating a task
 */
export interface CreateTaskInput {
  title: string
  description: string
  // Optional position (defaults to automatic placement)
  positionX?: number
  positionY?: number
  // Dependency inference - task IDs this task depends on
  dependsOn?: string[]
}

/**
 * Result of task creation
 */
export interface CreateTaskResult {
  success: boolean
  taskId?: string
  error?: string
}

/**
 * Input for listing tasks
 */
export interface ListTasksInput {
  featureId?: string // Optional filter
}

/**
 * Result of listing tasks
 */
export interface ListTasksResult {
  tasks: Array<{
    id: string
    title: string
    status: string
    description: string
  }>
}

/**
 * Input for adding a dependency between tasks
 */
export interface AddDependencyInput {
  fromTaskId: string // Task that must complete first
  toTaskId: string // Task that depends on fromTaskId
}

/**
 * Result of adding a dependency
 */
export interface AddDependencyResult {
  success: boolean
  error?: string
}

/**
 * Input for getting task details
 */
export interface GetTaskInput {
  taskId: string
}

/**
 * Result with full task details
 */
export interface GetTaskResult {
  task: {
    id: string
    title: string
    status: string
    description: string
    dependencies: string[] // IDs of tasks this depends on
    dependents: string[] // IDs of tasks that depend on this
  } | null
  error?: string
}
