import { ipcMain } from 'electron'
import { readJson, writeJson } from '../storage/json-store'
import { getAgentConfigPath, ensureAgentsDir } from '../storage/paths'
import type { AgentConfig, AgentRole, AgentRuntimeStatus } from '@shared/types'
import { DEFAULT_AGENT_CONFIGS } from '@shared/types'

let currentProjectRoot: string | null = null

const ALL_ROLES: AgentRole[] = ['feature', 'developer', 'qa', 'merge', 'project']

/**
 * Set the project root for agent config operations.
 * Called when project is loaded/switched.
 */
export function setAgentConfigProjectRoot(projectRoot: string): void {
  currentProjectRoot = projectRoot
}

function getProjectRoot(): string {
  if (!currentProjectRoot) {
    throw new Error('Agent config project root not set')
  }
  return currentProjectRoot
}

/**
 * Load a single agent config from .dagent/agents/{role}.json
 * Returns the stored config or creates from defaults if not found/empty.
 */
async function loadAgentConfig(projectRoot: string, role: AgentRole): Promise<AgentConfig> {
  const configPath = getAgentConfigPath(projectRoot, role)

  try {
    const stored = await readJson<AgentConfig>(configPath)
    if (stored && stored.instructions) {
      // Ensure role is set correctly
      return { ...stored, role }
    }
  } catch {
    // File doesn't exist or is invalid
  }

  // No valid stored config, return default
  return { role, ...DEFAULT_AGENT_CONFIGS[role] }
}

/**
 * Save a single agent config to .dagent/agents/{role}.json
 */
async function saveAgentConfigToFile(projectRoot: string, config: AgentConfig): Promise<void> {
  await ensureAgentsDir(projectRoot)
  const configPath = getAgentConfigPath(projectRoot, config.role)
  await writeJson(configPath, config)
}

/**
 * Initialize agent configs for a project.
 * Creates config files from defaults for any missing agents.
 * Called when a project is opened.
 */
export async function initializeAgentConfigs(projectRoot: string): Promise<void> {
  await ensureAgentsDir(projectRoot)

  for (const role of ALL_ROLES) {
    const configPath = getAgentConfigPath(projectRoot, role)
    try {
      const stored = await readJson<AgentConfig>(configPath)
      if (!stored || !stored.instructions) {
        // File is empty or missing instructions, create from defaults
        const defaultConfig: AgentConfig = { role, ...DEFAULT_AGENT_CONFIGS[role] }
        await writeJson(configPath, defaultConfig)
      }
    } catch {
      // File doesn't exist, create from defaults
      const defaultConfig: AgentConfig = { role, ...DEFAULT_AGENT_CONFIGS[role] }
      await writeJson(configPath, defaultConfig)
    }
  }
}

/**
 * Load agent configs from .dagent/agents/ directory.
 * Each role has its own {role}.json file.
 */
async function loadAgentConfigs(): Promise<Record<AgentRole, AgentConfig>> {
  const projectRoot = getProjectRoot()
  const configs = {} as Record<AgentRole, AgentConfig>

  for (const role of ALL_ROLES) {
    configs[role] = await loadAgentConfig(projectRoot, role)
  }

  return configs
}

/**
 * Save agent config to .dagent/agents/{role}.json
 */
async function saveAgentConfig(config: AgentConfig): Promise<void> {
  const projectRoot = getProjectRoot()
  await saveAgentConfigToFile(projectRoot, config)
}

/**
 * Get the instructions for a specific agent role.
 * This is used by prompt-builders to get the configured prompt.
 */
export async function getAgentInstructions(role: AgentRole): Promise<string> {
  if (!currentProjectRoot) {
    // No project loaded, use defaults
    return DEFAULT_AGENT_CONFIGS[role].instructions
  }

  const config = await loadAgentConfig(currentProjectRoot, role)
  return config.instructions
}

/**
 * Get the full config for a specific agent role.
 * Returns model, instructions, permissionMode, etc.
 */
export async function getAgentConfig(role: AgentRole): Promise<AgentConfig> {
  if (!currentProjectRoot) {
    // No project loaded, return defaults
    return { role, ...DEFAULT_AGENT_CONFIGS[role] }
  }

  return loadAgentConfig(currentProjectRoot, role)
}

/**
 * Get runtime status for all agents from the agent pool.
 * Maps pool agent types to configured roles.
 */
async function getRuntimeStatus(): Promise<Record<AgentRole, AgentRuntimeStatus>> {
  // Default all roles to offline
  const status: Record<AgentRole, AgentRuntimeStatus> = {
    feature: { role: 'feature', status: 'idle' }, // Feature is always "idle" - it's MCP tools, not a spawned agent
    developer: { role: 'developer', status: 'offline' },
    qa: { role: 'qa', status: 'offline' },
    merge: { role: 'merge', status: 'offline' },
    project: { role: 'project', status: 'idle' } // Project is always "idle" - it's chat-based, not a spawned agent
  }

  // Try to get live status from agent pool
  try {
    const { getAgentPool } = await import('../agents')
    const pool = getAgentPool()
    if (pool) {
      // Check running agents
      const agents = pool.getAgents()
      for (const agent of agents) {
        if (agent.status === 'terminated') continue

        // Map pool agent types to UI roles
        let role: AgentRole | null = null
        if (agent.type === 'task') role = 'developer'
        else if (agent.type === 'merge') role = 'merge'
        else if (agent.type === 'qa') role = 'qa'

        if (role) {
          status[role] = {
            role,
            status: agent.status === 'busy' ? 'busy' : 'idle',
            currentTaskId: agent.taskId
          }
        }
      }
    }
  } catch {
    // Pool not available, use defaults
  }

  return status
}

/**
 * Register agent configuration IPC handlers.
 */
export function registerAgentConfigHandlers(): void {
  ipcMain.handle('agent:loadConfigs', async () => {
    return loadAgentConfigs()
  })

  ipcMain.handle('agent:saveConfig', async (_event, config: AgentConfig) => {
    await saveAgentConfig(config)
    return { success: true }
  })

  ipcMain.handle('agent:resetConfig', async (_event, role: AgentRole) => {
    const defaultConfig: AgentConfig = { role, ...DEFAULT_AGENT_CONFIGS[role] }
    await saveAgentConfig(defaultConfig)
    return defaultConfig
  })

  ipcMain.handle('agent:getRuntimeStatus', async () => {
    return getRuntimeStatus()
  })
}
