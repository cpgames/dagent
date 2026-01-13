import { contextBridge, ipcRenderer } from 'electron'
import type { Feature, DAGGraph, ChatHistory, AgentLog, Task } from '@shared/types'
import type {
  TopologicalResult,
  DAGAnalysisSerialized
} from '../main/dag-engine/types'
import type { TransitionResult } from '../main/dag-engine/state-machine'
import type { CascadeResult } from '../main/dag-engine/cascade'

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
  },

  // DAG Engine API
  dag: {
    topologicalSort: (graph: DAGGraph): Promise<TopologicalResult> =>
      ipcRenderer.invoke('dag:topological-sort', graph),
    analyze: (graph: DAGGraph): Promise<DAGAnalysisSerialized> =>
      ipcRenderer.invoke('dag:analyze', graph),
    getReadyTasks: (graph: DAGGraph): Promise<Task[]> =>
      ipcRenderer.invoke('dag:get-ready-tasks', graph),
    isTaskReady: (taskId: string, graph: DAGGraph): Promise<boolean> =>
      ipcRenderer.invoke('dag:is-task-ready', taskId, graph),
    updateStatuses: (graph: DAGGraph): Promise<string[]> =>
      ipcRenderer.invoke('dag:update-statuses', graph),

    // State machine methods
    isValidTransition: (from: string, to: string, event: string): Promise<boolean> =>
      ipcRenderer.invoke('dag:is-valid-transition', from, to, event),
    getNextStatus: (currentStatus: string, event: string): Promise<string | null> =>
      ipcRenderer.invoke('dag:get-next-status', currentStatus, event),
    getValidEvents: (currentStatus: string): Promise<string[]> =>
      ipcRenderer.invoke('dag:get-valid-events', currentStatus),
    transitionTask: (task: Task, event: string, graph?: DAGGraph): Promise<TransitionResult> =>
      ipcRenderer.invoke('dag:transition-task', task, event, graph),
    initializeStatuses: (graph: DAGGraph): Promise<DAGGraph> =>
      ipcRenderer.invoke('dag:initialize-statuses', graph),
    cascadeCompletion: (completedTaskId: string, graph: DAGGraph): Promise<CascadeResult> =>
      ipcRenderer.invoke('dag:cascade-completion', completedTaskId, graph),
    resetTask: (taskId: string, graph: DAGGraph): Promise<CascadeResult> =>
      ipcRenderer.invoke('dag:reset-task', taskId, graph),
    recalculateStatuses: (graph: DAGGraph): Promise<CascadeResult> =>
      ipcRenderer.invoke('dag:recalculate-statuses', graph)
  }

  // TODO: Add auth methods (validateApiKey, getStoredKey, etc.)
  // TODO: Add git methods (getStatus, getBranches, etc.)
  // TODO: Add agent methods (spawnAgent, terminateAgent, etc.)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
