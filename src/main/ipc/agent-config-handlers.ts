import { ipcMain } from 'electron'
import { readJson, writeJson } from '../storage/json-store'
import { getAgentConfigsPath } from '../storage/paths'
import type { AgentConfig, AgentRole, AgentRuntimeStatus } from '@shared/types'
import { DEFAULT_AGENT_CONFIGS } from '@shared/types'

let currentProjectRoot: string | null = null

const ALL_ROLES: AgentRole[] = ['pm', 'harness', 'developer', 'qa', 'merge']

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
 * Load agent configs from storage, falling back to defaults
 */
async function loadAgentConfigs(): Promise<Record<AgentRole, AgentConfig>> {
  const projectRoot = getProjectRoot()
  const configPath = getAgentConfigsPath(projectRoot)
  const configs = {} as Record<AgentRole, AgentConfig>

  try {
    const stored = await readJson<Record<AgentRole, AgentConfig>>(configPath)
    if (stored) {
      // Merge with defaults to ensure all roles exist
      for (const role of ALL_ROLES) {
        if (stored[role]) {
          configs[role] = stored[role]
        } else {
          configs[role] = { role, ...DEFAULT_AGENT_CONFIGS[role] }
        }
      }
      return configs
    }
  } catch {
    // Fall through to defaults
  }

  // No stored configs, use defaults
  for (const role of ALL_ROLES) {
    configs[role] = { role, ...DEFAULT_AGENT_CONFIGS[role] }
  }
  return configs
}

/**
 * Save agent config to storage
 */
async function saveAgentConfig(config: AgentConfig): Promise<void> {
  const projectRoot = getProjectRoot()
  const configPath = getAgentConfigsPath(projectRoot)

  // Load existing configs
  let configs: Record<string, AgentConfig> = {}
  try {
    const stored = await readJson<Record<string, AgentConfig>>(configPath)
    if (stored) {
      configs = stored
    }
  } catch {
    // Start fresh
  }

  // Update config for this role
  configs[config.role] = config
  await writeJson(configPath, configs)
}

/**
 * Get runtime status for all agents from the agent pool.
 * Maps pool agent types to configured roles.
 */
async function getRuntimeStatus(): Promise<Record<AgentRole, AgentRuntimeStatus>> {
  // Default all roles to offline
  const status: Record<AgentRole, AgentRuntimeStatus> = {
    pm: { role: 'pm', status: 'offline' },
    harness: { role: 'harness', status: 'idle' },
    developer: { role: 'developer', status: 'offline' },
    qa: { role: 'qa', status: 'offline' },
    merge: { role: 'merge', status: 'offline' }
  }

  // Try to get live status from agent pool
  try {
    const { getAgentPool } = await import('../agents')
    const pool = getAgentPool()
    if (pool) {
      const poolStatus = pool.getStatus()

      // Harness agent status
      if (poolStatus.hasHarness) {
        status.harness.status = 'idle'
      }

      // Check running agents
      const agents = pool.getAgents()
      for (const agent of agents) {
        if (agent.status === 'terminated') continue

        // Map old agent types to new roles
        let role: AgentRole | null = null
        if (agent.type === 'harness') role = 'harness'
        else if (agent.type === 'task') role = 'developer'
        else if (agent.type === 'merge') role = 'merge'

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
