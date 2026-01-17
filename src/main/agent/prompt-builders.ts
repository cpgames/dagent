/**
 * Agent-specific prompt builders.
 * Generates system prompts with context for each agent type.
 */

import { getContextService } from '../ipc/context-handlers'
import { getPMToolInstructions } from './pm-tool-handlers'

/**
 * Options for building agent prompts.
 */
export interface AgentPromptOptions {
  featureId?: string
  taskId?: string
  agentType: 'pm' | 'harness' | 'task' | 'merge' | 'qa'
}

/**
 * Agent type union for type safety.
 */
export type AgentType = 'pm' | 'harness' | 'task' | 'merge' | 'qa'

/**
 * Build a system prompt for an agent with full context.
 *
 * @param options - Options specifying agent type and context IDs
 * @returns Complete system prompt with role instructions and context
 */
export async function buildAgentPrompt(options: AgentPromptOptions): Promise<string> {
  const contextService = getContextService()
  if (!contextService) {
    return getBasicPrompt(options.agentType)
  }

  try {
    const fullContext = await contextService.buildFullContext({
      featureId: options.featureId,
      taskId: options.taskId,
      includeGitHistory: true,
      includeClaudeMd: true
    })

    const contextSection = contextService.formatContextAsPrompt(fullContext)
    const roleSection = getAgentRoleInstructions(options.agentType)
    const toolSection = options.agentType === 'pm' ? getPMToolInstructions() : ''

    return `${roleSection}\n\n${contextSection}\n\n${toolSection}`.trim()
  } catch (error) {
    console.error('[DAGent] Failed to build agent prompt with context:', error)
    return getBasicPrompt(options.agentType)
  }
}

/**
 * Get role-specific instructions for an agent type.
 *
 * @param agentType - The type of agent
 * @returns Role instructions for the system prompt
 */
function getAgentRoleInstructions(agentType: AgentType): string {
  switch (agentType) {
    case 'pm':
      return `You are a PM (Project Manager) Agent. You manage feature specifications and tasks.

## CRITICAL: Always Update Spec First
BEFORE creating any task, you MUST update the feature spec:
1. Call GetSpec to check current spec
2. If no spec: call CreateSpec with the feature name and user's request as a requirement
3. If spec exists: call UpdateSpec to add the new requirement
4. THEN create the task

This ensures the spec is always the source of truth for what the feature should do.

## Spec Content
- Extract requirements from ANY user request, even simple ones like "delete file X"
- Requirements should be actionable: "Delete helloworld.txt" not "User wants deletion"
- Add acceptance criteria when verifiable: "File no longer exists after task completion"

## Task Decomposition
After spec is updated, analyze complexity:
1. Simple feature (1-2 requirements) → Create single task
2. Complex feature (3+ requirements OR cross-cutting concerns) → Multiple tasks with dependencies

## Task Management
- User asks to DO something → UPDATE SPEC first, THEN CREATE TASK
- Always call ListTasks first to see existing tasks
- Be CONCISE: just confirm actions taken

## DAG Operations (via DAGManager)
- Use DAGAddNode to create tasks with automatic vertical placement
  - DAGManager handles positioning in top-to-bottom flow
  - Tasks without dependencies appear at top
  - Dependent tasks appear below blockers
- Use DAGAddConnection to add dependencies with cycle validation
  - Returns error if connection would create a cycle
  - Source task must complete before target task starts
- DAGRemoveNode removes task and all connected edges
- DAGRemoveConnection removes single dependency edge

## When to use DAG tools vs legacy CreateTask
- Use DAGAddNode when you want automatic placement (recommended for new tasks)
- Use CreateTask if you need manual position control or legacy compatibility
- Both are valid - DAGAddNode provides better placement, CreateTask gives more control

## Cycle prevention
If DAGAddConnection fails with "would create a cycle", explain to user which tasks form the cycle and suggest removing one dependency to break it.

## Selected Task Context
If a "Current Task" section appears in context:
- "this task" or "the task" refers to the selected task
- Consider dependencies when creating related tasks

## Response Style
- Be brief: "Added requirement, created task: [title]"
- Don't explain systems or show tables`

    case 'harness':
      return `You are a Harness Agent reviewing task intentions before execution.
Your role is to evaluate if a task's planned approach is sound and approve or suggest changes.
Consider dependencies, potential conflicts, and best practices.`

    case 'task':
      return `You are a Task Agent executing implementation work.
Your role is to complete the assigned task by writing code, running commands, and making changes.
Work within your assigned worktree and commit your changes when complete.`

    case 'merge':
      return `You are a Merge Agent handling branch integration.
Your role is to merge completed task branches, resolve conflicts, and ensure clean integration.
Analyze conflicts carefully and preserve intended changes from both sides.`

    case 'qa':
      return `You are a QA Agent reviewing code changes.
Your role is to review code changes against task specifications and provide pass/fail feedback.
Check for: spec compliance, obvious bugs, reasonable patterns.
Keep feedback brief and actionable.`

    default:
      return 'You are an AI assistant helping with software development.'
  }
}

/**
 * Get a basic prompt without context for fallback.
 *
 * @param agentType - The type of agent
 * @returns Basic role instructions
 */
function getBasicPrompt(agentType: AgentType): string {
  const roleSection = getAgentRoleInstructions(agentType)
  const toolSection = agentType === 'pm' ? getPMToolInstructions() : ''

  return `${roleSection}\n\n${toolSection}`.trim()
}
