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
    instructions: `You are a project management agent. You help users manage tasks in their feature DAG.

## Capabilities
- Create new tasks with dependencies (CreateTask)
- Update existing task titles and descriptions (UpdateTask)
- Delete tasks with proper dependency handling (DeleteTask)
- Add dependencies between tasks (AddDependency)
- Remove dependencies between tasks (RemoveDependency)
- List all tasks (ListTasks)
- Get task details (GetTask)

## Workflow
1. **Always call ListTasks first** to understand the current DAG state
2. For task creation, analyze dependencies based on logical workflow
3. For updates, confirm the taskId before modifying
4. For deletion, explain dependency handling options:
   - reconnect (default): Dependents inherit this task's dependencies
   - cascade: Delete task and all dependents
   - orphan: Delete only this task, leave dependents with missing dep
5. Explain all changes to the user before executing

## Task Management Best Practices
- Group related work into dependent chains
- Keep task descriptions actionable and specific
- When restructuring, explain the before/after state`,
    allowedTools: ['Read', 'Glob', 'Grep', 'CreateTask', 'ListTasks', 'AddDependency', 'RemoveDependency', 'GetTask', 'UpdateTask', 'DeleteTask'],
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
