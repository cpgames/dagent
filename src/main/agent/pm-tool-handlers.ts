/**
 * PM Agent custom tool definitions.
 * These tools are executed via IPC when the PM Agent uses them.
 */

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
  DeleteTaskResult
} from '@shared/types'

/**
 * PM Tool handler interface
 */
export interface PMToolHandler {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (input: unknown) => Promise<unknown>
}

// Handler registry - populated when tool context is set
let createTaskHandler: ((input: CreateTaskInput) => Promise<CreateTaskResult>) | null = null
let listTasksHandler: (() => Promise<ListTasksResult>) | null = null
let addDependencyHandler: ((input: AddDependencyInput) => Promise<AddDependencyResult>) | null =
  null
let getTaskHandler: ((input: GetTaskInput) => Promise<GetTaskResult>) | null = null
let updateTaskHandler: ((input: UpdateTaskInput) => Promise<UpdateTaskResult>) | null = null
let deleteTaskHandler: ((input: DeleteTaskInput) => Promise<DeleteTaskResult>) | null = null

export function setCreateTaskHandler(
  handler: (input: CreateTaskInput) => Promise<CreateTaskResult>
): void {
  createTaskHandler = handler
}

export function setListTasksHandler(handler: () => Promise<ListTasksResult>): void {
  listTasksHandler = handler
}

export function setAddDependencyHandler(
  handler: (input: AddDependencyInput) => Promise<AddDependencyResult>
): void {
  addDependencyHandler = handler
}

export function setGetTaskHandler(handler: (input: GetTaskInput) => Promise<GetTaskResult>): void {
  getTaskHandler = handler
}

export function setUpdateTaskHandler(
  handler: (input: UpdateTaskInput) => Promise<UpdateTaskResult>
): void {
  updateTaskHandler = handler
}

export function setDeleteTaskHandler(
  handler: (input: DeleteTaskInput) => Promise<DeleteTaskResult>
): void {
  deleteTaskHandler = handler
}

export function clearPMToolHandlers(): void {
  createTaskHandler = null
  listTasksHandler = null
  addDependencyHandler = null
  getTaskHandler = null
  updateTaskHandler = null
  deleteTaskHandler = null
}

/**
 * Execute a PM tool by name
 */
export async function executePMTool(toolName: string, input: unknown): Promise<unknown> {
  if (toolName === 'CreateTask' && createTaskHandler) {
    return createTaskHandler(input as CreateTaskInput)
  }
  if (toolName === 'ListTasks' && listTasksHandler) {
    return listTasksHandler()
  }
  if (toolName === 'AddDependency' && addDependencyHandler) {
    return addDependencyHandler(input as AddDependencyInput)
  }
  if (toolName === 'GetTask' && getTaskHandler) {
    return getTaskHandler(input as GetTaskInput)
  }
  if (toolName === 'UpdateTask' && updateTaskHandler) {
    return updateTaskHandler(input as UpdateTaskInput)
  }
  if (toolName === 'DeleteTask' && deleteTaskHandler) {
    return deleteTaskHandler(input as DeleteTaskInput)
  }
  return { success: false, error: `Unknown PM tool: ${toolName}` }
}

/**
 * Check if a tool is a PM-specific tool
 */
export function isPMTool(toolName: string): boolean {
  return (
    toolName === 'CreateTask' ||
    toolName === 'ListTasks' ||
    toolName === 'AddDependency' ||
    toolName === 'GetTask' ||
    toolName === 'UpdateTask' ||
    toolName === 'DeleteTask'
  )
}

/**
 * PM tool definitions for documentation/schema purposes.
 * These describe the tools available to the PM Agent.
 */
export const PM_TOOLS: PMToolHandler[] = [
  {
    name: 'CreateTask',
    description:
      'Create a new task in the current feature DAG. Use this when the user asks to add a task. You can specify dependencies using dependsOn with task IDs from ListTasks.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title of the task'
        },
        description: {
          type: 'string',
          description: 'Detailed description of what the task should accomplish'
        },
        dependsOn: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of task IDs that must complete before this task can start'
        }
      },
      required: ['title', 'description']
    },
    handler: async (input: unknown): Promise<CreateTaskResult> => {
      if (!createTaskHandler) {
        return { success: false, error: 'CreateTask handler not initialized' }
      }
      return createTaskHandler(input as CreateTaskInput)
    }
  },
  {
    name: 'ListTasks',
    description:
      'List all tasks in the current feature. ALWAYS call this before CreateTask to understand existing tasks and determine dependencies.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    handler: async (): Promise<ListTasksResult> => {
      if (!listTasksHandler) {
        return { tasks: [] }
      }
      return listTasksHandler()
    }
  },
  {
    name: 'AddDependency',
    description:
      'Add a dependency between two existing tasks. The fromTaskId must complete before toTaskId can start.',
    inputSchema: {
      type: 'object',
      properties: {
        fromTaskId: {
          type: 'string',
          description: 'ID of the task that must complete first'
        },
        toTaskId: {
          type: 'string',
          description: 'ID of the task that depends on fromTaskId'
        }
      },
      required: ['fromTaskId', 'toTaskId']
    },
    handler: async (input: unknown): Promise<AddDependencyResult> => {
      if (!addDependencyHandler) {
        return { success: false, error: 'AddDependency handler not initialized' }
      }
      return addDependencyHandler(input as AddDependencyInput)
    }
  },
  {
    name: 'GetTask',
    description:
      'Get detailed information about a specific task including its dependencies and dependents.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The ID of the task to retrieve'
        }
      },
      required: ['taskId']
    },
    handler: async (input: unknown): Promise<GetTaskResult> => {
      if (!getTaskHandler) {
        return { task: null, error: 'GetTask handler not initialized' }
      }
      return getTaskHandler(input as GetTaskInput)
    }
  },
  {
    name: 'UpdateTask',
    description:
      'Update an existing task. Use this to modify task title or description. Only provided fields will be updated.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The ID of the task to update'
        },
        title: {
          type: 'string',
          description: 'New title for the task (optional)'
        },
        description: {
          type: 'string',
          description: 'New description for the task (optional)'
        }
      },
      required: ['taskId']
    },
    handler: async (input: unknown): Promise<UpdateTaskResult> => {
      if (!updateTaskHandler) {
        return { success: false, error: 'UpdateTask handler not initialized' }
      }
      return updateTaskHandler(input as UpdateTaskInput)
    }
  },
  {
    name: 'DeleteTask',
    description:
      'Delete a task from the DAG. Use reassignDependents to control how dependent tasks are handled: "reconnect" (default) connects dependents to this task\'s dependencies, "cascade" deletes all transitive dependents, "orphan" leaves dependents with missing dependency.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The ID of the task to delete'
        },
        reassignDependents: {
          type: 'string',
          enum: ['cascade', 'orphan', 'reconnect'],
          description:
            'How to handle dependent tasks: reconnect (default), cascade (delete dependents), orphan (leave orphaned)'
        }
      },
      required: ['taskId']
    },
    handler: async (input: unknown): Promise<DeleteTaskResult> => {
      if (!deleteTaskHandler) {
        return { success: false, error: 'DeleteTask handler not initialized' }
      }
      return deleteTaskHandler(input as DeleteTaskInput)
    }
  }
]

/**
 * Get PM tool instructions for system prompt
 */
export function getPMToolInstructions(): string {
  return `
## Available Tools

You have access to the following task management tools:

### ListTasks
Lists all existing tasks in the current feature's DAG.
**ALWAYS call this first** before creating, updating, or deleting tasks to understand existing dependencies.

### CreateTask
Creates a new task in the current feature's DAG (Directed Acyclic Graph).
- title: Task title (required)
- description: Detailed description (required)
- dependsOn: Array of task IDs this task depends on (optional)

### UpdateTask
Updates an existing task's title or description.
- taskId: The ID of the task to update (required)
- title: New title for the task (optional)
- description: New description for the task (optional)
Only provided fields will be updated.

### DeleteTask
Deletes a task from the DAG with dependency handling.
- taskId: The ID of the task to delete (required)
- reassignDependents: How to handle dependent tasks (optional):
  - "reconnect" (default): Dependents inherit this task's dependencies
  - "cascade": Delete this task and all its transitive dependents
  - "orphan": Just delete this task, leave dependents with missing dependency

### AddDependency
Adds a dependency between two existing tasks.
- fromTaskId: Task that must complete first
- toTaskId: Task that depends on fromTaskId

### GetTask
Gets detailed information about a specific task including its dependencies.
- taskId: The task ID to retrieve

## Dependency Workflow

When asked to create tasks:
1. Call ListTasks to see existing tasks
2. Analyze which existing tasks the new task depends on based on:
   - Logical workflow order (setup before implementation)
   - File/module dependencies (data models before API)
   - Explicit mentions ("after X", "once Y is done")
3. Use dependsOn in CreateTask with relevant task IDs
4. Explain your dependency reasoning to the user

## Updating Tasks
When asked to modify a task:
1. Call ListTasks to find the task ID
2. Call UpdateTask with the taskId and the fields to change
3. Confirm the changes to the user

## Deleting Tasks
When asked to delete a task:
1. Call ListTasks to find the task ID and understand its dependencies
2. Call GetTask to see what depends on this task
3. Explain the deletion options if the task has dependents:
   - reconnect: Safest option, preserves dependency chain
   - cascade: Use when removing a whole feature branch
   - orphan: Use with caution, may leave tasks stuck as blocked
4. Call DeleteTask with appropriate reassignDependents option
5. Confirm what was deleted to the user
`
}
