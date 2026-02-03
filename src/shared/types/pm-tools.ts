/**
 * PM Agent tool types for task management
 */

/**
 * Input for creating a task
 */
export interface CreateTaskInput {
  title: string
  spec: string
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
    spec: string
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
    spec: string
    dependencies: string[] // IDs of tasks this depends on
    dependents: string[] // IDs of tasks that depend on this
  } | null
  error?: string
}

/**
 * Input for updating a task
 */
export interface UpdateTaskInput {
  taskId: string
  title?: string // New title (optional)
  spec?: string // New spec (optional)
}

/**
 * Result of task update
 */
export interface UpdateTaskResult {
  success: boolean
  error?: string
}

/**
 * Input for deleting a task
 */
export interface DeleteTaskInput {
  taskId: string
  reassignDependents?: 'cascade' | 'orphan' | 'reconnect'
  // cascade: Delete dependent tasks too
  // orphan: Leave dependent tasks with missing dependency
  // reconnect: Connect dependents to this task's dependencies (default)
}

/**
 * Result of task deletion
 */
export interface DeleteTaskResult {
  success: boolean
  deletedTaskIds?: string[] // For cascade deletes
  error?: string
}

/**
 * Input for removing a dependency between tasks
 */
export interface RemoveDependencyInput {
  fromTaskId: string
  toTaskId: string
}

/**
 * Result of dependency removal
 */
export interface RemoveDependencyResult {
  success: boolean
  statusChanged?: boolean // True if toTask status changed (blocked → ready)
  error?: string
}
