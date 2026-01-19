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
  pmRemoveDependency,
  getPMToolsFeatureContext
} from '../ipc/pm-tools-handlers'
import {
  pmCreateSpec,
  pmUpdateSpec,
  pmGetSpec
} from '../ipc/pm-spec-handlers'
import {
  pmDAGAddNode,
  pmDAGAddConnection,
  pmDAGRemoveNode,
  pmDAGRemoveConnection
} from '../ipc/pm-dag-handlers'

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
      ),
      tool(
        'CreateSpec',
        'Create a new feature specification. Call this when user describes a new feature to capture goals, requirements, and acceptance criteria.',
        {
          featureName: z.string().describe('Human-readable name for the feature'),
          initialGoals: z.array(z.string()).optional().describe('Initial high-level goals'),
          initialRequirements: z.array(z.string()).optional().describe('Initial specific requirements'),
          initialConstraints: z.array(z.string()).optional().describe('Any constraints or limitations'),
          initialAcceptanceCriteria: z.array(z.string()).optional().describe('How to verify the feature is done')
        },
        async (args: {
          featureName: string
          initialGoals?: string[]
          initialRequirements?: string[]
          initialConstraints?: string[]
          initialAcceptanceCriteria?: string[]
        }) => {
          const featureId = getPMToolsFeatureContext()
          if (!featureId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No feature selected. Cannot create spec.'
              }]
            }
          }
          const result = await pmCreateSpec({
            featureId,
            featureName: args.featureName,
            initialGoals: args.initialGoals,
            initialRequirements: args.initialRequirements,
            initialConstraints: args.initialConstraints,
            initialAcceptanceCriteria: args.initialAcceptanceCriteria
          })
          return {
            content: [{
              type: 'text',
              text: result.success
                ? `Spec created for feature: ${args.featureName}`
                : `Failed to create spec: ${result.error}`
            }]
          }
        }
      ),
      tool(
        'UpdateSpec',
        'Update an existing feature specification. Use when user refines requirements in conversation.',
        {
          addGoals: z.array(z.string()).optional().describe('Goals to add'),
          addRequirements: z.array(z.string()).optional().describe('Requirements to add'),
          addConstraints: z.array(z.string()).optional().describe('Constraints to add'),
          addAcceptanceCriteria: z.array(z.string()).optional().describe('Acceptance criteria to add'),
          historyNote: z.string().optional().describe('Note about what changed (for history)')
        },
        async (args: {
          addGoals?: string[]
          addRequirements?: string[]
          addConstraints?: string[]
          addAcceptanceCriteria?: string[]
          historyNote?: string
        }) => {
          const featureId = getPMToolsFeatureContext()
          if (!featureId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No feature selected. Cannot update spec.'
              }]
            }
          }
          const result = await pmUpdateSpec({
            featureId,
            addGoals: args.addGoals,
            addRequirements: args.addRequirements,
            addConstraints: args.addConstraints,
            addAcceptanceCriteria: args.addAcceptanceCriteria,
            historyNote: args.historyNote
          })
          if (result.success) {
            const parts: string[] = ['Spec updated.']
            if (result.addedRequirementIds?.length) {
              parts.push(`Added requirements: ${result.addedRequirementIds.join(', ')}`)
            }
            if (result.addedCriterionIds?.length) {
              parts.push(`Added criteria: ${result.addedCriterionIds.join(', ')}`)
            }
            return { content: [{ type: 'text', text: parts.join(' ') }] }
          }
          return {
            content: [{
              type: 'text',
              text: `Failed to update spec: ${result.error}`
            }]
          }
        }
      ),
      tool(
        'GetSpec',
        'Get the current feature specification to understand requirements.',
        {},
        async () => {
          const featureId = getPMToolsFeatureContext()
          if (!featureId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No feature selected. Cannot get spec.'
              }]
            }
          }
          const result = await pmGetSpec({ featureId })
          if (result.spec) {
            const spec = result.spec
            const lines = [
              `Feature: ${spec.featureName}`,
              '',
              'Goals:',
              spec.goals.length > 0 ? spec.goals.map(g => `- ${g}`).join('\n') : '  (none)',
              '',
              'Requirements:',
              spec.requirements.length > 0
                ? spec.requirements.map(r => `- [${r.completed ? 'x' : ' '}] ${r.id}: ${r.description}`).join('\n')
                : '  (none)',
              '',
              'Constraints:',
              spec.constraints.length > 0 ? spec.constraints.map(c => `- ${c}`).join('\n') : '  (none)',
              '',
              'Acceptance Criteria:',
              spec.acceptanceCriteria.length > 0
                ? spec.acceptanceCriteria.map(ac => `- [${ac.passed ? 'x' : ' '}] ${ac.id}: ${ac.description}`).join('\n')
                : '  (none)'
            ]
            return { content: [{ type: 'text', text: lines.join('\n') }] }
          }
          return {
            content: [{
              type: 'text',
              text: result.error || 'No spec found for this feature.'
            }]
          }
        }
      ),
      tool(
        'DecomposeSpec',
        'Analyze the feature spec and suggest task decomposition. Only use for complex features with 5+ requirements or multiple distinct system layers (API + UI + database). For simple features, always recommend a single task.',
        {
          forceDecompose: z.boolean().optional().describe('Force decomposition even for simple specs')
        },
        async (args: { forceDecompose?: boolean }) => {
          const featureId = getPMToolsFeatureContext()
          if (!featureId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No feature selected. Cannot analyze spec.'
              }]
            }
          }
          const result = await pmGetSpec({ featureId })
          if (!result.spec) {
            return {
              content: [{
                type: 'text',
                text: 'No spec found. Create a spec first with CreateSpec.'
              }]
            }
          }

          const spec = result.spec
          const requirementCount = spec.requirements.length

          // Only detect truly distinct system layers (need at least 3 different layers)
          const layerKeywords = {
            api: ['api', 'endpoint', 'rest', 'graphql'],
            ui: ['ui', 'component', 'frontend', 'display', 'view', 'page'],
            database: ['database', 'migration', 'schema', 'model', 'table']
          }
          const layersFound = new Set<string>()
          for (const req of spec.requirements) {
            const lower = req.description.toLowerCase()
            for (const [layer, keywords] of Object.entries(layerKeywords)) {
              if (keywords.some(kw => lower.includes(kw))) {
                layersFound.add(layer)
              }
            }
          }
          // Only consider it cross-cutting if we have 3+ distinct layers
          const hasCrossCuttingConcerns = layersFound.size >= 3

          // Be much more conservative - only decompose for truly complex features
          // Require 5+ requirements OR forced OR all 3 layers present
          const isComplex = args.forceDecompose || requirementCount >= 5 || hasCrossCuttingConcerns

          let reason: string
          if (args.forceDecompose) {
            reason = 'Forced decomposition requested'
          } else if (requirementCount >= 5) {
            reason = `${requirementCount} requirements detected (5+ = complex)`
          } else if (hasCrossCuttingConcerns) {
            reason = `Multiple system layers detected: ${Array.from(layersFound).join(', ')}`
          } else {
            reason = `Simple feature with ${requirementCount} requirement(s) - use single task`
          }

          // Format response - prefer single task recommendation
          const lines = [
            `## Complexity Analysis`,
            '',
            `**Complex:** ${isComplex ? 'Yes' : 'No'}`,
            `**Reason:** ${reason}`,
            '',
            '## Recommendation',
            ''
          ]

          if (!isComplex) {
            lines.push('**Create a single task** covering all requirements.')
            lines.push('')
            lines.push('Remember: Each task has built-in QA verification. Do NOT create separate verification tasks.')
          } else {
            lines.push('This feature may benefit from multiple tasks. Group by system layer:')
            if (layersFound.has('database')) lines.push('- Data layer task')
            if (layersFound.has('api')) lines.push('- API layer task')
            if (layersFound.has('ui')) lines.push('- UI layer task')
            lines.push('')
            lines.push('Keep task count minimal. Each task has built-in QA - no separate verification tasks needed.')
          }

          return {
            content: [{
              type: 'text',
              text: lines.join('\n')
            }]
          }
        }
      ),
      tool(
        'DAGAddNode',
        'Add a new task node to the DAG. Nodes are automatically positioned in a tree layout based on dependencies. Use this for all task creation.',
        {
          title: z.string().describe('The title of the task'),
          description: z.string().describe('Detailed description of what the task should accomplish'),
          dependsOn: z.array(z.string()).optional().describe('Array of task IDs that must complete before this task can start')
        },
        async (args: { title: string; description: string; dependsOn?: string[] }) => {
          const result = await pmDAGAddNode(args)
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
        'DAGAddConnection',
        'Add a dependency connection between tasks with cycle validation. Creates edge from source to target (source must complete before target starts).',
        {
          sourceTaskId: z.string().describe('ID of the task that must complete first'),
          targetTaskId: z.string().describe('ID of the task that depends on sourceTaskId')
        },
        async (args: { sourceTaskId: string; targetTaskId: string }) => {
          const result = await pmDAGAddConnection(args)
          return {
            content: [{
              type: 'text',
              text: result.success
                ? `Connection added: ${args.sourceTaskId} -> ${args.targetTaskId}`
                : `Failed to add connection: ${result.error}`
            }]
          }
        }
      ),
      tool(
        'DAGRemoveNode',
        'Remove a task node and all connected edges from the DAG.',
        {
          taskId: z.string().describe('The ID of the task to remove')
        },
        async (args: { taskId: string }) => {
          const result = await pmDAGRemoveNode(args)
          return {
            content: [{
              type: 'text',
              text: result.success
                ? `Task ${args.taskId} removed successfully`
                : `Failed to remove task: ${result.error}`
            }]
          }
        }
      ),
      tool(
        'DAGRemoveConnection',
        'Remove a dependency connection between two tasks.',
        {
          sourceTaskId: z.string().describe('ID of the dependency task to remove'),
          targetTaskId: z.string().describe('ID of the task that currently depends on sourceTaskId')
        },
        async (args: { sourceTaskId: string; targetTaskId: string }) => {
          const result = await pmDAGRemoveConnection(args)
          return {
            content: [{
              type: 'text',
              text: result.success
                ? `Connection removed: ${args.sourceTaskId} -> ${args.targetTaskId}`
                : `Failed to remove connection: ${result.error}`
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
    'mcp__pm-tools__RemoveDependency',
    'mcp__pm-tools__CreateSpec',
    'mcp__pm-tools__UpdateSpec',
    'mcp__pm-tools__GetSpec',
    'mcp__pm-tools__DecomposeSpec',
    'mcp__pm-tools__DAGAddNode',
    'mcp__pm-tools__DAGAddConnection',
    'mcp__pm-tools__DAGRemoveNode',
    'mcp__pm-tools__DAGRemoveConnection'
  ]
}
