/**
 * PM Agent MCP Server for custom task management tools.
 * Uses createSdkMcpServer to register tools with the Claude Agent SDK.
 */

import { z } from 'zod'
import {
  pmListTasks,
  pmCreateTask,
  pmGetTask,
  pmUpdateTask,
  pmDeleteTask,
  pmAddDependency,
  pmRemoveDependency
} from '../ipc/pm-tools-handlers'

// Dynamic SDK imports for ES module compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdkModule: any = null

async function getSDK(): Promise<{
  createSdkMcpServer: (config: unknown) => unknown
  tool: (name: string, description: string, schema: unknown, handler: unknown) => unknown
} | null> {
  if (!sdkModule) {
    try {
      sdkModule = await import('@anthropic-ai/claude-agent-sdk')
    } catch (error) {
      console.error('[DAGent] Failed to load Claude Agent SDK for MCP server:', error)
      return null
    }
  }
  return sdkModule
}

/**
 * Create the PM MCP server with task management tools.
 */
export async function createPMMcpServer(): Promise<unknown | null> {
  const sdk = await getSDK()
  if (!sdk) {
    console.error('[DAGent] Cannot create PM MCP server: SDK not available')
    return null
  }

  const { createSdkMcpServer, tool } = sdk

  return createSdkMcpServer({
    name: 'pm-tools',
    version: '1.0.0',
    tools: [
      tool(
        'ListTasks',
        'List all tasks in the current feature DAG. ALWAYS call this first before creating, updating, or deleting tasks to understand existing tasks and dependencies.',
        {},
        async () => {
          const result = await pmListTasks()
          return {
            content: [{
              type: 'text',
              text: result.tasks.length === 0
                ? 'No tasks found in the current feature.'
                : `Found ${result.tasks.length} tasks:\n${result.tasks.map(t => `- [${t.id}] ${t.title} (${t.status}): ${t.description}`).join('\n')}`
            }]
          }
        }
      ),
      tool(
        'CreateTask',
        'Create a new task in the current feature DAG. Use this when the user asks to add a task or wants work to be done.',
        {
          title: z.string().describe('The title of the task'),
          description: z.string().describe('Detailed description of what the task should accomplish'),
          dependsOn: z.array(z.string()).optional().describe('Array of task IDs that must complete before this task can start')
        },
        async (args: { title: string; description: string; dependsOn?: string[] }) => {
          const result = await pmCreateTask(args)
          return {
            content: [{
              type: 'text',
              text: result.success
                ? `Task created successfully with ID: ${result.taskId}`
                : `Failed to create task: ${result.error}`
            }]
          }
        }
      ),
      tool(
        'GetTask',
        'Get detailed information about a specific task including its dependencies and dependents.',
        {
          taskId: z.string().describe('The ID of the task to retrieve')
        },
        async (args: { taskId: string }) => {
          const result = await pmGetTask(args)
          return {
            content: [{
              type: 'text',
              text: result.task
                ? `Task details:\n${JSON.stringify(result.task, null, 2)}`
                : `Task not found: ${result.error || 'Unknown error'}`
            }]
          }
        }
      ),
      tool(
        'UpdateTask',
        'Update an existing task. Use this to modify task title or description. Only provided fields will be updated.',
        {
          taskId: z.string().describe('The ID of the task to update'),
          title: z.string().optional().describe('New title for the task'),
          description: z.string().optional().describe('New description for the task')
        },
        async (args: { taskId: string; title?: string; description?: string }) => {
          const result = await pmUpdateTask(args)
          return {
            content: [{
              type: 'text',
              text: result.success
                ? `Task ${args.taskId} updated successfully`
                : `Failed to update task: ${result.error}`
            }]
          }
        }
      ),
      tool(
        'DeleteTask',
        'Delete a task from the DAG. Use reassignDependents to control how dependent tasks are handled: "reconnect" (default) connects dependents to this task\'s dependencies, "cascade" deletes all transitive dependents, "orphan" leaves dependents with missing dependency.',
        {
          taskId: z.string().describe('The ID of the task to delete'),
          reassignDependents: z.enum(['cascade', 'orphan', 'reconnect']).optional().describe('How to handle dependent tasks: reconnect (default), cascade (delete dependents), orphan (leave orphaned)')
        },
        async (args: { taskId: string; reassignDependents?: 'cascade' | 'orphan' | 'reconnect' }) => {
          const result = await pmDeleteTask(args)
          return {
            content: [{
              type: 'text',
              text: result.success
                ? `Task deleted successfully${result.deletedTaskIds && result.deletedTaskIds.length > 1 ? `. Deleted tasks: ${result.deletedTaskIds.join(', ')}` : ''}`
                : `Failed to delete task: ${result.error}`
            }]
          }
        }
      ),
      tool(
        'AddDependency',
        'Add a dependency between two existing tasks. The fromTaskId must complete before toTaskId can start.',
        {
          fromTaskId: z.string().describe('ID of the task that must complete first'),
          toTaskId: z.string().describe('ID of the task that depends on fromTaskId')
        },
        async (args: { fromTaskId: string; toTaskId: string }) => {
          const result = await pmAddDependency(args)
          return {
            content: [{
              type: 'text',
              text: result.success
                ? `Dependency added: ${args.fromTaskId} -> ${args.toTaskId}`
                : `Failed to add dependency: ${result.error}`
            }]
          }
        }
      ),
      tool(
        'RemoveDependency',
        'Remove an existing dependency between two tasks. The toTask may become ready if it has no other incomplete dependencies.',
        {
          fromTaskId: z.string().describe('ID of the dependency task to remove'),
          toTaskId: z.string().describe('ID of the task that currently depends on fromTaskId')
        },
        async (args: { fromTaskId: string; toTaskId: string }) => {
          const result = await pmRemoveDependency(args)
          return {
            content: [{
              type: 'text',
              text: result.success
                ? `Dependency removed: ${args.fromTaskId} -> ${args.toTaskId}`
                : `Failed to remove dependency: ${result.error}`
            }]
          }
        }
      )
    ]
  })
}

/**
 * Get the PM tool names with MCP prefix for allowedTools.
 */
export function getPMToolNamesForAllowedTools(): string[] {
  return [
    'mcp__pm-tools__ListTasks',
    'mcp__pm-tools__CreateTask',
    'mcp__pm-tools__GetTask',
    'mcp__pm-tools__UpdateTask',
    'mcp__pm-tools__DeleteTask',
    'mcp__pm-tools__AddDependency',
    'mcp__pm-tools__RemoveDependency'
  ]
}
