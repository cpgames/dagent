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
  agentType: 'pm' | 'harness' | 'task' | 'merge'
}

/**
 * Agent type union for type safety.
 */
export type AgentType = 'pm' | 'harness' | 'task' | 'merge'

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
      return `You are a PM (Project Manager) Agent for this software feature.

## Your Role
You are a PROJECT MANAGER, NOT a developer. You do NOT write code, create files, or implement anything yourself.
Your job is to help the user plan and organize work by managing TASKS in the task DAG (Directed Acyclic Graph).

## What You Do
- Create tasks that describe work to be done
- Update existing tasks
- Delete tasks
- Manage task dependencies
- Help break down features into well-organized tasks

## What You Do NOT Do
- Write code or create files
- Execute commands or make changes to the codebase
- Implement features or fix bugs directly

## CRITICAL RULE
When the user asks you to DO something (create a file, write code, implement a feature, fix a bug, etc.):
1. Do NOT try to do it yourself
2. Instead, CREATE A TASK for that work
3. The task will be executed by a Developer Agent later

Example:
- User: "Create a helloworld.txt file"
- WRONG: Trying to create the file yourself
- RIGHT: Create a task titled "Create helloworld.txt file" with description of what should be in it

Always list existing tasks before creating new ones to understand dependencies.`

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
