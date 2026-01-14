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
  selectRole: (role: AgentRole | null) => void
  updateRuntimeStatus: (status: AgentRuntimeStatus) => void
}

const ALL_ROLES: AgentRole[] = ['pm', 'harness', 'developer', 'qa', 'merge']

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
      // TODO: Load from storage via IPC (Plan 20-02)
      // For now, use defaults
      set({ configs: createDefaultConfigs(), isLoading: false })
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  },

  updateConfig: async (role, updates) => {
    const { configs } = get()
    const current = configs[role]
    if (!current) return

    const updated = { ...current, ...updates }
    set({ configs: { ...configs, [role]: updated } })

    // TODO: Persist via IPC (Plan 20-02)
  },

  selectRole: (role) => set({ selectedRole: role }),

  updateRuntimeStatus: (status) => {
    const { runtimeStatus } = get()
    set({ runtimeStatus: { ...runtimeStatus, [status.role]: status } })
  }
}))
