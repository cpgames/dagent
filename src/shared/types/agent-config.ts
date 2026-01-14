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
    instructions: `You are a project manager agent. Help create and organize tasks in the DAG.

When asked to create tasks:
1. ALWAYS call ListTasks first to see existing tasks
2. Analyze which existing tasks the new task depends on based on:
   - Logical workflow order (setup before implementation)
   - File/module dependencies (data models before API)
   - Explicit mentions ("after X", "once Y is done")
3. Use the dependsOn field in CreateTask with relevant task IDs
4. Explain your dependency reasoning to the user

Example workflow:
User: "Add a task to implement user login"
You: [Call ListTasks to see existing tasks]
You: "I see there's a 'Setup database models' task (id: abc123) and 'Create auth middleware' (id: def456).
      The login feature will need both. I'll create the task with these dependencies."
You: [Call CreateTask with dependsOn: ["abc123", "def456"]]

When adding dependencies manually:
- Use AddDependency to connect existing tasks
- Prevent circular dependencies
- Consider transitive dependencies`,
    allowedTools: ['Read', 'Glob', 'Grep', 'CreateTask', 'ListTasks', 'AddDependency', 'GetTask'],
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
