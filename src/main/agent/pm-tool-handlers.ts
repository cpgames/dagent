/**
 * PM Agent custom tool definitions.
 * These tools are executed via IPC when the PM Agent uses them.
 */

import type { CreateTaskInput, CreateTaskResult, ListTasksResult } from '@shared/types'

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

export function setCreateTaskHandler(handler: (input: CreateTaskInput) => Promise<CreateTaskResult>): void {
  createTaskHandler = handler
}

export function setListTasksHandler(handler: () => Promise<ListTasksResult>): void {
  listTasksHandler = handler
}

export function clearPMToolHandlers(): void {
  createTaskHandler = null
  listTasksHandler = null
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
  return { success: false, error: `Unknown PM tool: ${toolName}` }
}

/**
 * Check if a tool is a PM-specific tool
 */
export function isPMTool(toolName: string): boolean {
  return toolName === 'CreateTask' || toolName === 'ListTasks'
}

/**
 * PM tool definitions for documentation/schema purposes.
 * These describe the tools available to the PM Agent.
 */
export const PM_TOOLS: PMToolHandler[] = [
  {
    name: 'CreateTask',
    description: 'Create a new task in the current feature DAG. Use this when the user asks to add a task, create a task, or add something to the task list.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title of the task (required)'
        },
        description: {
          type: 'string',
          description: 'Detailed description of what the task should accomplish (required)'
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
    description: 'List all tasks in the current feature DAG. Use this to understand what tasks already exist before creating new ones.',
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
  }
]

/**
 * Get PM tool instructions for system prompt
 */
export function getPMToolInstructions(): string {
  return `
## Available Tools

You have access to the following task management tools:

### CreateTask
Creates a new task in the current feature's DAG (Directed Acyclic Graph).

When the user asks you to create a task, add a task, or add something to the task list, use this tool.

To use this tool, output:
\`\`\`tool:CreateTask
{
  "title": "Task title here",
  "description": "Detailed description of what the task should accomplish"
}
\`\`\`

### ListTasks
Lists all existing tasks in the current feature's DAG.

Use this to see what tasks already exist before creating new ones.

To use this tool, output:
\`\`\`tool:ListTasks
{}
\`\`\`

After outputting a tool call, wait for the result before continuing.
`
}
