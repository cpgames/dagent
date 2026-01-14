import type { ChildProcess } from 'child_process'

export type AgentType = 'harness' | 'task' | 'merge'

export type AgentStatus = 'idle' | 'busy' | 'terminated'

export interface AgentInfo {
  id: string
  type: AgentType
  status: AgentStatus
  taskId?: string // For task/merge agents, which task they're handling
  featureId?: string // Which feature this agent is working on
  process?: ChildProcess
  startedAt?: string // ISO timestamp
}

export interface AgentPoolConfig {
  maxAgents: number // Total pool size (default: 4)
  maxTaskAgents: number // Max concurrent task agents (default: 2)
  maxMergeAgents: number // Max concurrent merge agents (default: 1)
  // Note: 1 agent always reserved for harness
}

export interface AgentSpawnOptions {
  type: AgentType
  featureId: string
  taskId?: string // Required for task/merge agents
  context?: AgentContext
}

export interface AgentContext {
  claudeMd?: string // CLAUDE.md content
  taskDescription?: string
  dependencyContext?: string[] // Context from completed dependencies
  featureGoal?: string
  additionalInstructions?: string
}

export interface AgentMessage {
  type: 'intention' | 'approval' | 'rejection' | 'modification' | 'action' | 'error' | 'complete'
  agentId: string
  taskId?: string
  content: string
  timestamp: string
}

export interface IntentionMessage {
  agentId: string
  taskId: string
  intention: string // What the agent intends to do
  files?: string[] // Files it plans to modify
}

export interface ApprovalMessage {
  agentId: string
  taskId: string
  approved: boolean
  notes?: string // Guidance for the task agent
  modifications?: string // If approach should change
}

export const DEFAULT_POOL_CONFIG: AgentPoolConfig = {
  maxAgents: 5,
  maxTaskAgents: 3,
  maxMergeAgents: 1
}
