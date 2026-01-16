import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type { AgentInfo, AgentPoolConfig, AgentType, AgentSpawnOptions } from './types'
import { DEFAULT_POOL_CONFIG } from './types'

export class AgentPool extends EventEmitter {
  private agents: Map<string, AgentInfo> = new Map()
  private config: AgentPoolConfig
  private harnessId: string | null = null

  constructor(config: Partial<AgentPoolConfig> = {}) {
    super()
    this.config = { ...DEFAULT_POOL_CONFIG, ...config }
  }

  /**
   * Get current pool configuration.
   */
  getConfig(): AgentPoolConfig {
    return { ...this.config }
  }

  /**
   * Update pool configuration.
   */
  updateConfig(config: Partial<AgentPoolConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get all agents in the pool.
   */
  getAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).map((a) => ({
      ...a,
      process: undefined // Don't expose process in returned info
    }))
  }

  /**
   * Get agent by ID.
   */
  getAgent(id: string): AgentInfo | undefined {
    const agent = this.agents.get(id)
    if (!agent) return undefined
    return { ...agent, process: undefined }
  }

  /**
   * Get agents by type.
   */
  getAgentsByType(type: AgentType): AgentInfo[] {
    return this.getAgents().filter((a) => a.type === type)
  }

  /**
   * Get harness agent (if active).
   */
  getHarness(): AgentInfo | undefined {
    if (!this.harnessId) return undefined
    return this.getAgent(this.harnessId)
  }

  /**
   * Check if we can spawn a new agent of given type.
   * No limits for task/merge/qa agents - spawn as many as needed.
   * Only harness is limited to one instance.
   */
  canSpawn(type: AgentType): boolean {
    if (type === 'harness') {
      // Only one harness allowed
      return !this.harnessId || this.agents.get(this.harnessId)?.status === 'terminated'
    }

    // No limits for task, merge, or qa agents
    return true
  }

  /**
   * Count available slots for a given agent type.
   * Returns Infinity for task/merge/qa (unlimited), 1 or 0 for harness.
   */
  getAvailableSlots(type: AgentType): number {
    if (type === 'harness') return this.canSpawn('harness') ? 1 : 0

    // Unlimited slots for task, merge, and qa agents
    return Infinity
  }

  /**
   * Register an agent in the pool (without spawning a process).
   * Used when agents are managed externally (e.g., via Claude API).
   */
  registerAgent(options: AgentSpawnOptions): AgentInfo {
    const id = randomUUID()
    const agent: AgentInfo = {
      id,
      type: options.type,
      status: 'idle',
      taskId: options.taskId,
      featureId: options.featureId,
      startedAt: new Date().toISOString()
    }

    this.agents.set(id, agent)

    if (options.type === 'harness') {
      this.harnessId = id
    }

    this.emit('agent:registered', agent)
    return { ...agent }
  }

  /**
   * Update agent status.
   */
  updateAgentStatus(id: string, status: AgentInfo['status'], taskId?: string): boolean {
    const agent = this.agents.get(id)
    if (!agent) return false

    agent.status = status
    if (taskId !== undefined) {
      agent.taskId = taskId
    }

    this.emit('agent:status', { ...agent, process: undefined })
    return true
  }

  /**
   * Terminate an agent.
   */
  terminateAgent(id: string): boolean {
    const agent = this.agents.get(id)
    if (!agent) return false

    if (agent.process) {
      agent.process.kill()
    }

    agent.status = 'terminated'

    if (this.harnessId === id) {
      this.harnessId = null
    }

    this.emit('agent:terminated', { ...agent, process: undefined })
    return true
  }

  /**
   * Terminate all agents.
   */
  terminateAll(): void {
    for (const id of this.agents.keys()) {
      this.terminateAgent(id)
    }
    this.agents.clear()
    this.harnessId = null
  }

  /**
   * Remove terminated agents from pool.
   */
  cleanup(): number {
    let removed = 0
    for (const [id, agent] of this.agents.entries()) {
      if (agent.status === 'terminated') {
        this.agents.delete(id)
        removed++
      }
    }
    return removed
  }

  /**
   * Get pool status summary.
   */
  getStatus(): {
    total: number
    active: number
    idle: number
    busy: number
    terminated: number
    hasHarness: boolean
    taskAgents: number
    mergeAgents: number
    qaAgents: number
  } {
    const agents = Array.from(this.agents.values())
    return {
      total: agents.length,
      active: agents.filter((a) => a.status !== 'terminated').length,
      idle: agents.filter((a) => a.status === 'idle').length,
      busy: agents.filter((a) => a.status === 'busy').length,
      terminated: agents.filter((a) => a.status === 'terminated').length,
      hasHarness:
        this.harnessId !== null && this.agents.get(this.harnessId!)?.status !== 'terminated',
      taskAgents: agents.filter((a) => a.type === 'task' && a.status === 'busy').length,
      mergeAgents: agents.filter((a) => a.type === 'merge' && a.status === 'busy').length,
      qaAgents: agents.filter((a) => a.type === 'qa' && a.status === 'busy').length
    }
  }
}

// Singleton instance
let agentPoolInstance: AgentPool | null = null

export function getAgentPool(): AgentPool {
  if (!agentPoolInstance) {
    agentPoolInstance = new AgentPool()
  }
  return agentPoolInstance
}

export function resetAgentPool(): void {
  if (agentPoolInstance) {
    agentPoolInstance.terminateAll()
  }
  agentPoolInstance = null
}
