/**
 * TypeScript declarations for the electronAPI exposed via contextBridge.
 * This enables type-safe IPC calls from the renderer process.
 */

import type { Feature, DAGGraph, ChatHistory, AgentLog, Task } from '@shared/types'
import type { TopologicalResult, DAGAnalysisSerialized, TaskDependencies } from '../main/dag-engine/types'

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  arch: string
}

/**
 * Storage API for persistent data operations.
 * Handles features, DAGs, chats, and logs.
 */
export interface StorageAPI {
  // Feature operations
  saveFeature: (feature: Feature) => Promise<boolean>
  loadFeature: (featureId: string) => Promise<Feature | null>
  deleteFeature: (featureId: string) => Promise<boolean>
  listFeatures: () => Promise<string[]>

  // DAG operations
  saveDag: (featureId: string, dag: DAGGraph) => Promise<boolean>
  loadDag: (featureId: string) => Promise<DAGGraph | null>

  // Feature-level chat operations
  saveChat: (featureId: string, chat: ChatHistory) => Promise<boolean>
  loadChat: (featureId: string) => Promise<ChatHistory | null>

  // Harness log operations
  saveHarnessLog: (featureId: string, log: AgentLog) => Promise<boolean>
  loadHarnessLog: (featureId: string) => Promise<AgentLog | null>

  // Node chat operations
  saveNodeChat: (featureId: string, nodeId: string, chat: ChatHistory) => Promise<boolean>
  loadNodeChat: (featureId: string, nodeId: string) => Promise<ChatHistory | null>

  // Node logs operations
  saveNodeLogs: (featureId: string, nodeId: string, log: AgentLog) => Promise<boolean>
  loadNodeLogs: (featureId: string, nodeId: string) => Promise<AgentLog | null>

  // Node deletion
  deleteNode: (featureId: string, nodeId: string) => Promise<boolean>
}

/**
 * DAG Engine API for topological sort and dependency analysis.
 * Enables correct execution ordering of tasks.
 */
export interface DagAPI {
  /**
   * Perform topological sort on DAG graph
   */
  topologicalSort: (graph: DAGGraph) => Promise<TopologicalResult>

  /**
   * Analyze DAG to get dependency information for all tasks
   */
  analyze: (graph: DAGGraph) => Promise<DAGAnalysisSerialized>

  /**
   * Get tasks that are ready to execute (all dependencies completed)
   */
  getReadyTasks: (graph: DAGGraph) => Promise<Task[]>

  /**
   * Check if a specific task is ready to execute
   */
  isTaskReady: (taskId: string, graph: DAGGraph) => Promise<boolean>

  /**
   * Update task statuses based on dependency completion
   */
  updateStatuses: (graph: DAGGraph) => Promise<string[]>
}

export interface ElectronAPI {
  /**
   * Test IPC connection - returns 'pong' from main process
   */
  ping: () => Promise<string>

  /**
   * Get application info (version, platform, arch)
   */
  getAppInfo: () => Promise<AppInfo>

  /**
   * Minimize the current window
   */
  minimizeWindow: () => Promise<void>

  /**
   * Toggle maximize/restore for the current window
   */
  maximizeWindow: () => Promise<void>

  /**
   * Close the current window
   */
  closeWindow: () => Promise<void>

  /**
   * Storage API for persistent data operations
   */
  storage: StorageAPI

  /**
   * DAG Engine API for topological sort and dependency analysis
   */
  dag: DagAPI

  // TODO: Add auth method types
  // TODO: Add git method types
  // TODO: Add agent method types
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
