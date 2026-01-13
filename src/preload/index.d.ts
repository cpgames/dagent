/**
 * TypeScript declarations for the electronAPI exposed via contextBridge.
 * This enables type-safe IPC calls from the renderer process.
 */

import type { Feature, DAGGraph, ChatHistory, AgentLog } from '@shared/types'

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

  // TODO: Add auth method types
  // TODO: Add git method types
  // TODO: Add agent method types
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
