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
  DeleteTaskResult,
  RemoveDependencyInput,
  RemoveDependencyResult
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
let removeDependencyHandler:
  | ((input: RemoveDependencyInput) => Promise<RemoveDependencyResult>)
  | null = null

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

export function setRemoveDependencyHandler(
  handler: (input: RemoveDependencyInput) => Promise<RemoveDependencyResult>
): void {
  removeDependencyHandler = handler
}

export function clearPMToolHandlers(): void {
  createTaskHandler = null
  listTasksHandler = null
  addDependencyHandler = null
  getTaskHandler = null
  updateTaskHandler = null
  deleteTaskHandler = null
  removeDependencyHandler = null
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
  if (toolName === 'RemoveDependency' && removeDependencyHandler) {
    return removeDependencyHandler(input as RemoveDependencyInput)
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
    toolName === 'DeleteTask' ||
    toolName === 'RemoveDependency'
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
  },
  {
    name: 'RemoveDependency',
    description:
      'Remove an existing dependency between two tasks. The toTask may become ready if it has no other incomplete dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        fromTaskId: {
          type: 'string',
          description: 'ID of the dependency task to remove'
        },
        toTaskId: {
          type: 'string',
          description: 'ID of the task that currently depends on fromTaskId'
        }
      },
      required: ['fromTaskId', 'toTaskId']
    },
    handler: async (input: unknown): Promise<RemoveDependencyResult> => {
      if (!removeDependencyHandler) {
        return { success: false, error: 'RemoveDependency handler not initialized' }
      }
      return removeDependencyHandler(input as RemoveDependencyInput)
    }
  }
]

/**
 * Get PM tool instructions for system prompt
 */
export function getPMToolInstructions(): string {
  return `## Tools
- ListTasks: Call FIRST to see existing tasks
- CreateTask(title, description, dependsOn?): Create task
- UpdateTask(taskId, title?, description?): Modify task
- DeleteTask(taskId, reassignDependents?): Remove task
- AddDependency(fromTaskId, toTaskId): Link tasks
- RemoveDependency(fromTaskId, toTaskId): Unlink tasks

## Workflow
1. ListTasks first
2. CreateTask with good description (all details go there)
3. Reply briefly: "Created task: [title]"`
}
