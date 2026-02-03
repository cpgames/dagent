/**
 * Agent-specific prompt builders.
 * Generates system prompts with context for each agent type.
 */

import { getContextService } from '../ipc/context-handlers'
import { getPMToolInstructions } from './pm-tool-handlers'
import { getAgentInstructions } from '../ipc/agent-config-handlers'
import type { AgentRole } from '@shared/types'
import { DEFAULT_AGENT_CONFIGS } from '@shared/types'

/**
 * Options for building agent prompts.
 */
export interface AgentPromptOptions {
  featureId?: string
  taskId?: string
  agentType: 'pm' | 'investigation' | 'harness' | 'task' | 'merge' | 'qa'
}

/**
 * Agent type union for type safety.
 */
export type AgentType = 'pm' | 'investigation' | 'harness' | 'task' | 'merge' | 'qa'

/**
 * Map internal agent types to configurable AgentRole.
 * Returns null for types that aren't configurable (investigation, harness).
 */
function mapToAgentRole(agentType: AgentType): AgentRole | null {
  switch (agentType) {
    case 'pm':
      return 'pm'
    case 'task':
      return 'developer' // 'task' in code maps to 'developer' role
    case 'qa':
      return 'qa'
    case 'merge':
      return 'merge'
    default:
      // investigation, harness are internal, not configurable roles
      return null
  }
}

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
    const roleSection = await getAgentRoleInstructions(options.agentType)
    // PM and investigation agents use PM tools (different subsets via presets)
    const needsToolInstructions = ['pm', 'investigation'].includes(options.agentType)
    const toolSection = needsToolInstructions ? getPMToolInstructions() : ''

    return `${roleSection}\n\n${contextSection}\n\n${toolSection}`.trim()
  } catch (error) {
    console.error('[DAGent] Failed to build agent prompt with context:', error)
    return getBasicPrompt(options.agentType)
  }
}

/**
 * Get role-specific instructions for an agent type.
 * For configurable agents (pm, developer, qa, merge), loads from project config.
 * For internal modes (investigation, harness), returns hardcoded instructions.
 *
 * @param agentType - The type of agent
 * @returns Role instructions for the system prompt
 */
async function getAgentRoleInstructions(agentType: AgentType): Promise<string> {
  // Check if this is a configurable agent role
  const role = mapToAgentRole(agentType)
  if (role) {
    // Load from project config (falls back to DEFAULT_AGENT_CONFIGS)
    return getAgentInstructions(role)
  }

  // Non-configurable internal agents - return hardcoded instructions
  switch (agentType) {
    case 'harness':
      // Harness is internal orchestration - not user-configurable
      return `You are a Harness Agent coordinating task execution.
Your role is to track task progress and log events.`

    case 'investigation':
      return `You are an Investigation Agent analyzing a new feature request.

## Your Role
Explore the codebase to understand how to implement the feature, then write a complete specification.

## Tools Available
- **Read, Glob, Grep**: Explore the codebase
- **CreateSpec, UpdateSpec, GetSpec**: Manage the feature specification

## Workflow
1. **Research First**: ALWAYS search the codebase before asking questions
2. **Ask Clarifying Questions**: When you need user input, ask ONE question at a time
3. **Update Spec**: As you learn information, update the spec using UpdateSpec

## Response Markers
- UNCERTAIN: [question] - When you need to ask the user
- CONFIDENT: Ready to proceed - When spec is complete

## Critical Rules
- Search the codebase before asking "what is X?"
- Update spec immediately when you learn something concrete
- The spec must be complete enough for task creation
- NEVER update or delete existing tasks without explicit user permission`

    default:
      return 'You are an AI assistant helping with software development.'
  }
}

/**
 * Get role instructions synchronously using defaults.
 * Used when we can't await (fallback scenarios).
 */
function getDefaultRoleInstructions(agentType: AgentType): string {
  const role = mapToAgentRole(agentType)
  if (role) {
    return DEFAULT_AGENT_CONFIGS[role].instructions
  }

  // Non-configurable internal agents
  switch (agentType) {
    case 'harness':
      return `You are a Harness Agent coordinating task execution.
Your role is to track task progress and log events.`

    case 'investigation':
      return `You are an Investigation Agent analyzing a new feature request.

## Your Role
Explore the codebase to understand how to implement the feature, then write a complete specification.

## Tools Available
- **Read, Glob, Grep**: Explore the codebase
- **CreateSpec, UpdateSpec, GetSpec**: Manage the feature specification

## Workflow
1. **Research First**: ALWAYS search the codebase before asking questions
2. **Ask Clarifying Questions**: When you need user input, ask ONE question at a time
3. **Update Spec**: As you learn information, update the spec using UpdateSpec

## Response Markers
- UNCERTAIN: [question] - When you need to ask the user
- CONFIDENT: Ready to proceed - When spec is complete

## Critical Rules
- Search the codebase before asking "what is X?"
- Update spec immediately when you learn something concrete
- The spec must be complete enough for task creation
- NEVER update or delete existing tasks without explicit user permission`

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
  const roleSection = getDefaultRoleInstructions(agentType)
  const needsToolInstructions = ['pm', 'investigation'].includes(agentType)
  const toolSection = needsToolInstructions ? getPMToolInstructions() : ''

  return `${roleSection}\n\n${toolSection}`.trim()
}
