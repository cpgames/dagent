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
