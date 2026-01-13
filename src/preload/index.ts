import { contextBridge, ipcRenderer } from 'electron'
import type { Feature, DAGGraph, ChatHistory, AgentLog } from '@shared/types'

/**
 * Preload script for DAGent.
 * Uses contextBridge to securely expose IPC methods to the renderer.
 *
 * SECURITY: Never expose raw ipcRenderer directly.
 * Always wrap in specific, controlled methods.
 */

const electronAPI = {
  // Health check
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),

  // App info
  getAppInfo: (): Promise<{ version: string; platform: string; arch: string }> =>
    ipcRenderer.invoke('app:getInfo'),

  // Window controls
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),

  // Storage API
  storage: {
    // Feature operations
    saveFeature: (feature: Feature): Promise<boolean> =>
      ipcRenderer.invoke('storage:saveFeature', feature),
    loadFeature: (featureId: string): Promise<Feature | null> =>
      ipcRenderer.invoke('storage:loadFeature', featureId),
    deleteFeature: (featureId: string): Promise<boolean> =>
      ipcRenderer.invoke('storage:deleteFeature', featureId),
    listFeatures: (): Promise<string[]> => ipcRenderer.invoke('storage:listFeatures'),

    // DAG operations
    saveDag: (featureId: string, dag: DAGGraph): Promise<boolean> =>
      ipcRenderer.invoke('storage:saveDag', featureId, dag),
    loadDag: (featureId: string): Promise<DAGGraph | null> =>
      ipcRenderer.invoke('storage:loadDag', featureId),

    // Feature-level chat operations
    saveChat: (featureId: string, chat: ChatHistory): Promise<boolean> =>
      ipcRenderer.invoke('storage:saveChat', featureId, chat),
    loadChat: (featureId: string): Promise<ChatHistory | null> =>
      ipcRenderer.invoke('storage:loadChat', featureId),

    // Harness log operations
    saveHarnessLog: (featureId: string, log: AgentLog): Promise<boolean> =>
      ipcRenderer.invoke('storage:saveHarnessLog', featureId, log),
    loadHarnessLog: (featureId: string): Promise<AgentLog | null> =>
      ipcRenderer.invoke('storage:loadHarnessLog', featureId),

    // Node chat operations
    saveNodeChat: (featureId: string, nodeId: string, chat: ChatHistory): Promise<boolean> =>
      ipcRenderer.invoke('storage:saveNodeChat', featureId, nodeId, chat),
    loadNodeChat: (featureId: string, nodeId: string): Promise<ChatHistory | null> =>
      ipcRenderer.invoke('storage:loadNodeChat', featureId, nodeId),

    // Node logs operations
    saveNodeLogs: (featureId: string, nodeId: string, log: AgentLog): Promise<boolean> =>
      ipcRenderer.invoke('storage:saveNodeLogs', featureId, nodeId, log),
    loadNodeLogs: (featureId: string, nodeId: string): Promise<AgentLog | null> =>
      ipcRenderer.invoke('storage:loadNodeLogs', featureId, nodeId),

    // Node deletion
    deleteNode: (featureId: string, nodeId: string): Promise<boolean> =>
      ipcRenderer.invoke('storage:deleteNode', featureId, nodeId)
  }

  // TODO: Add auth methods (validateApiKey, getStoredKey, etc.)
  // TODO: Add git methods (getStatus, getBranches, etc.)
  // TODO: Add agent methods (spawnAgent, terminateAgent, etc.)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
