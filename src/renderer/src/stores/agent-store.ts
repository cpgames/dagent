import { create } from 'zustand'
import type { AgentConfig, AgentRole, AgentRuntimeStatus } from '@shared/types'
import { DEFAULT_AGENT_CONFIGS } from '@shared/types'

interface AgentState {
  configs: Record<AgentRole, AgentConfig>
  runtimeStatus: Record<AgentRole, AgentRuntimeStatus>
  selectedRole: AgentRole | null
  isLoading: boolean
  error: string | null

  // Actions
  loadConfigs: () => Promise<void>
  updateConfig: (role: AgentRole, updates: Partial<AgentConfig>) => Promise<void>
  resetConfig: (role: AgentRole) => Promise<AgentConfig | null>
  selectRole: (role: AgentRole | null) => void
  updateRuntimeStatus: (status: AgentRuntimeStatus) => void
  loadRuntimeStatus: () => Promise<void>
}

const ALL_ROLES: AgentRole[] = ['feature', 'developer', 'qa', 'merge', 'project']

function createDefaultConfigs(): Record<AgentRole, AgentConfig> {
  const configs = {} as Record<AgentRole, AgentConfig>
  for (const role of ALL_ROLES) {
    configs[role] = { role, ...DEFAULT_AGENT_CONFIGS[role] }
  }
  return configs
}

function createDefaultRuntimeStatus(): Record<AgentRole, AgentRuntimeStatus> {
  const status = {} as Record<AgentRole, AgentRuntimeStatus>
  for (const role of ALL_ROLES) {
    status[role] = { role, status: 'offline' }
  }
  return status
}

/**
 * Zustand store for managing agent configurations and runtime status.
 * Provides state for the Agents View to display and configure AI agents.
 */
export const useAgentStore = create<AgentState>((set, get) => ({
  configs: createDefaultConfigs(),
  runtimeStatus: createDefaultRuntimeStatus(),
  selectedRole: null,
  isLoading: false,
  error: null,

  loadConfigs: async () => {
    set({ isLoading: true, error: null })
    try {
      const configs = await window.electronAPI.agentLoadConfigs()
      set({ configs, isLoading: false })
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  },

  updateConfig: async (role, updates) => {
    const { configs } = get()
    const current = configs[role]
    if (!current) return

    const updated = { ...current, ...updates }

    try {
      await window.electronAPI.agentSaveConfig(updated)
      set({ configs: { ...configs, [role]: updated } })
    } catch (err) {
      console.error('Failed to save agent config:', err)
    }
  },

  resetConfig: async (role) => {
    const { configs } = get()
    try {
      const defaultConfig = await window.electronAPI.agentResetConfig(role)
      set({ configs: { ...configs, [role]: defaultConfig } })
      return defaultConfig
    } catch (err) {
      console.error('Failed to reset agent config:', err)
      return null
    }
  },

  selectRole: (role) => set({ selectedRole: role }),

  updateRuntimeStatus: (status) => {
    const { runtimeStatus } = get()
    set({ runtimeStatus: { ...runtimeStatus, [status.role]: status } })
  },

  loadRuntimeStatus: async () => {
    try {
      const status = await window.electronAPI.agentGetRuntimeStatus()
      set({ runtimeStatus: status })
    } catch (err) {
      console.error('Failed to load agent runtime status:', err)
    }
  }
}))
