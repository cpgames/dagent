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
  agentType: 'feature' | 'project' | 'harness' | 'task' | 'merge' | 'qa'
}

/**
 * Agent type union for type safety.
 */
export type AgentType = 'feature' | 'project' | 'harness' | 'task' | 'merge' | 'qa'

/**
 * Map internal agent types to configurable AgentRole.
 * Returns null for types that aren't configurable (project, harness).
 */
function mapToAgentRole(agentType: AgentType): AgentRole | null {
  switch (agentType) {
    case 'feature':
      return 'feature'
    case 'project':
      return 'project'
    case 'task':
      return 'developer' // 'task' in code maps to 'developer' role
    case 'qa':
      return 'qa'
    case 'merge':
      return 'merge'
    default:
      // harness is internal, not configurable role
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
    // Feature and project agents use task management tools (different subsets via presets)
    const needsToolInstructions = ['feature', 'project'].includes(options.agentType)
    const toolSection = needsToolInstructions ? getPMToolInstructions() : ''

    return `${roleSection}\n\n${contextSection}\n\n${toolSection}`.trim()
  } catch (error) {
    console.error('[DAGent] Failed to build agent prompt with context:', error)
    return getBasicPrompt(options.agentType)
  }
}

/**
 * Get role-specific instructions for an agent type.
 * For configurable agents (feature, project, developer, qa, merge), loads from project config.
 * For internal modes (harness), returns hardcoded instructions.
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
  const needsToolInstructions = ['feature', 'project'].includes(agentType)
  const toolSection = needsToolInstructions ? getPMToolInstructions() : ''

  return `${roleSection}\n\n${toolSection}`.trim()
}
