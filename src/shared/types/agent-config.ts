/**
 * Configurable agent roles for the system
 */
export type AgentRole = 'pm' | 'harness' | 'developer' | 'qa' | 'merge'

/**
 * Agent configuration stored per-project
 */
export interface AgentConfig {
  role: AgentRole
  name: string
  instructions: string // System prompt / custom instructions
  allowedTools: string[] // Tool preset names
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions'
  model?: string // Optional model override
  enabled: boolean // Whether this agent role is active
}

/**
 * Agent runtime status (from pool)
 */
export interface AgentRuntimeStatus {
  role: AgentRole
  status: 'idle' | 'busy' | 'offline'
  currentTaskId?: string
  currentTaskTitle?: string
}

/**
 * Default configurations for each agent role
 */
export const DEFAULT_AGENT_CONFIGS: Record<AgentRole, Omit<AgentConfig, 'role'>> = {
  pm: {
    name: 'PM Agent',
    instructions:
      'You are a project manager. Help create and organize tasks, manage dependencies, and plan work.',
    allowedTools: ['Read', 'Glob', 'Grep'],
    permissionMode: 'default',
    enabled: true
  },
  harness: {
    name: 'Harness Agent',
    instructions: 'You review task intentions and approve or reject them based on project context.',
    allowedTools: ['Read', 'Glob', 'Grep'],
    permissionMode: 'default',
    enabled: true
  },
  developer: {
    name: 'Developer Agent',
    instructions: 'You implement tasks by writing and modifying code. Follow project conventions.',
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    permissionMode: 'acceptEdits',
    enabled: true
  },
  qa: {
    name: 'QA Agent',
    instructions: 'You verify implementations by running tests and checking requirements.',
    allowedTools: ['Read', 'Bash', 'Glob', 'Grep'],
    permissionMode: 'default',
    enabled: true
  },
  merge: {
    name: 'Merge Agent',
    instructions: 'You handle branch integration and resolve merge conflicts.',
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    permissionMode: 'acceptEdits',
    enabled: true
  }
}
