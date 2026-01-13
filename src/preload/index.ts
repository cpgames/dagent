import { contextBridge, ipcRenderer } from 'electron'
import type { Feature, DAGGraph, ChatHistory, AgentLog, Task } from '@shared/types'
import type { TopologicalResult, DAGAnalysisSerialized } from '../main/dag-engine/types'
import type { TransitionResult } from '../main/dag-engine/state-machine'
import type { CascadeResult } from '../main/dag-engine/cascade'
import type {
  ExecutionConfig,
  ExecutionState,
  ExecutionSnapshot,
  NextTasksResult
} from '../main/dag-engine/orchestrator-types'
import type { GitManagerConfig, BranchInfo, GitOperationResult } from '../main/git/types'

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
  },

  // Execution Orchestrator API
  execution: {
    initialize: (
      featureId: string,
      graph: DAGGraph
    ): Promise<ExecutionSnapshot> =>
      ipcRenderer.invoke('execution:initialize', featureId, graph),
    start: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('execution:start'),
    pause: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('execution:pause'),
    resume: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('execution:resume'),
    stop: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('execution:stop'),
    getState: (): Promise<ExecutionState> => ipcRenderer.invoke('execution:get-state'),
    getNextTasks: (): Promise<NextTasksResult> =>
      ipcRenderer.invoke('execution:get-next-tasks'),
    assignTask: (
      taskId: string,
      agentId?: string
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('execution:assign-task', taskId, agentId),
    completeTaskCode: (taskId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('execution:complete-task-code', taskId),
    completeMerge: (
      taskId: string
    ): Promise<{ success: boolean; unblocked: string[]; error?: string }> =>
      ipcRenderer.invoke('execution:complete-merge', taskId),
    failTask: (
      taskId: string,
      error?: string
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('execution:fail-task', taskId, error),
    getSnapshot: (): Promise<ExecutionSnapshot> =>
      ipcRenderer.invoke('execution:get-snapshot'),
    updateConfig: (config: Partial<ExecutionConfig>): Promise<ExecutionConfig> =>
      ipcRenderer.invoke('execution:update-config', config),
    reset: (): Promise<{ success: boolean }> => ipcRenderer.invoke('execution:reset')
  },

  // Git API
  git: {
    initialize: (projectRoot: string): Promise<GitOperationResult> =>
      ipcRenderer.invoke('git:initialize', projectRoot),
    isInitialized: (): Promise<boolean> => ipcRenderer.invoke('git:is-initialized'),
    getConfig: (): Promise<GitManagerConfig> => ipcRenderer.invoke('git:get-config'),
    getCurrentBranch: (): Promise<string> => ipcRenderer.invoke('git:get-current-branch'),
    listBranches: (): Promise<BranchInfo[]> => ipcRenderer.invoke('git:list-branches'),
    branchExists: (branchName: string): Promise<boolean> =>
      ipcRenderer.invoke('git:branch-exists', branchName),
    createBranch: (branchName: string, checkout?: boolean): Promise<GitOperationResult> =>
      ipcRenderer.invoke('git:create-branch', branchName, checkout),
    deleteBranch: (branchName: string, force?: boolean): Promise<GitOperationResult> =>
      ipcRenderer.invoke('git:delete-branch', branchName, force),
    getStatus: (): Promise<GitOperationResult> => ipcRenderer.invoke('git:get-status')
  }

  // TODO: Add auth methods (validateApiKey, getStoredKey, etc.)
  // TODO: Add agent methods (spawnAgent, terminateAgent, etc.)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
