import { contextBridge, ipcRenderer } from 'electron'
import type {
  Feature,
  DAGGraph,
  ChatHistory,
  AgentLog,
  Task,
  AuthState,
  HistoryState
} from '@shared/types'
import type { TopologicalResult, DAGAnalysisSerialized } from '../main/dag-engine/types'
import type { TransitionResult } from '../main/dag-engine/state-machine'
import type { CascadeResult } from '../main/dag-engine/cascade'
import type {
  ExecutionConfig,
  ExecutionState,
  ExecutionSnapshot,
  NextTasksResult
} from '../main/dag-engine/orchestrator-types'
import type {
  GitManagerConfig,
  BranchInfo,
  GitOperationResult,
  WorktreeInfo,
  FeatureWorktreeResult,
  TaskWorktreeResult,
  MergeResult,
  MergeConflict,
  TaskMergeResult,
  CommitInfo,
  DiffSummary
} from '../main/git/types'
import type {
  AgentType,
  AgentInfo,
  AgentPoolConfig,
  AgentSpawnOptions
} from '../main/agents/types'
import type {
  HarnessStatus,
  TaskExecutionState,
  PendingIntention,
  HarnessMessage,
  IntentionDecision
} from '../main/agents/harness-types'
import type {
  TaskAgentState,
  TaskAgentStatus,
  TaskAgentConfig,
  TaskExecutionResult
} from '../main/agents/task-types'
import type { MergeAgentState, MergeAgentStatus } from '../main/agents/merge-types'

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
  setWindowTitle: (title: string): Promise<void> => ipcRenderer.invoke('window:setTitle', title),

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
    createFeature: (name: string): Promise<Feature> =>
      ipcRenderer.invoke('storage:createFeature', name),

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
  // Flow: initialize(featureId, graph) -> start() -> pause/resume/stop
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
    getStatus: (): Promise<GitOperationResult> => ipcRenderer.invoke('git:get-status'),
    initRepo: (projectRoot: string): Promise<GitOperationResult> =>
      ipcRenderer.invoke('git:init-repo', projectRoot),

    // Worktree operations
    listWorktrees: (): Promise<WorktreeInfo[]> => ipcRenderer.invoke('git:list-worktrees'),
    getWorktree: (worktreePath: string): Promise<WorktreeInfo | null> =>
      ipcRenderer.invoke('git:get-worktree', worktreePath),
    worktreeExists: (worktreePath: string): Promise<boolean> =>
      ipcRenderer.invoke('git:worktree-exists', worktreePath),
    createFeatureWorktree: (featureId: string): Promise<FeatureWorktreeResult> =>
      ipcRenderer.invoke('git:create-feature-worktree', featureId),
    createTaskWorktree: (featureId: string, taskId: string): Promise<TaskWorktreeResult> =>
      ipcRenderer.invoke('git:create-task-worktree', featureId, taskId),
    removeWorktree: (worktreePath: string, deleteBranch?: boolean): Promise<GitOperationResult> =>
      ipcRenderer.invoke('git:remove-worktree', worktreePath, deleteBranch),

    // Merge operations
    mergeBranch: (branchName: string, message?: string): Promise<MergeResult> =>
      ipcRenderer.invoke('git:merge-branch', branchName, message),
    getConflicts: (): Promise<MergeConflict[]> => ipcRenderer.invoke('git:get-conflicts'),
    abortMerge: (): Promise<GitOperationResult> => ipcRenderer.invoke('git:abort-merge'),
    isMergeInProgress: (): Promise<boolean> => ipcRenderer.invoke('git:is-merge-in-progress'),
    mergeTaskIntoFeature: (
      featureId: string,
      taskId: string,
      removeWorktreeOnSuccess?: boolean
    ): Promise<TaskMergeResult> =>
      ipcRenderer.invoke('git:merge-task-into-feature', featureId, taskId, removeWorktreeOnSuccess),
    getLog: (maxCount?: number, branch?: string): Promise<CommitInfo[]> =>
      ipcRenderer.invoke('git:get-log', maxCount, branch),
    getDiffSummary: (from: string, to: string): Promise<DiffSummary> =>
      ipcRenderer.invoke('git:get-diff-summary', from, to),
    checkout: (branchName: string): Promise<GitOperationResult> =>
      ipcRenderer.invoke('git:checkout', branchName)
  },

  // Agent Pool API
  agent: {
    getConfig: (): Promise<AgentPoolConfig> => ipcRenderer.invoke('agent:get-config'),
    updateConfig: (config: Partial<AgentPoolConfig>): Promise<AgentPoolConfig> =>
      ipcRenderer.invoke('agent:update-config', config),
    getAll: (): Promise<AgentInfo[]> => ipcRenderer.invoke('agent:get-all'),
    getById: (id: string): Promise<AgentInfo | undefined> =>
      ipcRenderer.invoke('agent:get-by-id', id),
    getByType: (type: AgentType): Promise<AgentInfo[]> =>
      ipcRenderer.invoke('agent:get-by-type', type),
    getHarness: (): Promise<AgentInfo | undefined> => ipcRenderer.invoke('agent:get-harness'),
    canSpawn: (type: AgentType): Promise<boolean> => ipcRenderer.invoke('agent:can-spawn', type),
    getAvailableSlots: (type: AgentType): Promise<number> =>
      ipcRenderer.invoke('agent:get-available-slots', type),
    register: (options: AgentSpawnOptions): Promise<AgentInfo> =>
      ipcRenderer.invoke('agent:register', options),
    updateStatus: (
      id: string,
      status: 'idle' | 'busy' | 'terminated',
      taskId?: string
    ): Promise<boolean> => ipcRenderer.invoke('agent:update-status', id, status, taskId),
    terminate: (id: string): Promise<boolean> => ipcRenderer.invoke('agent:terminate', id),
    terminateAll: (): Promise<boolean> => ipcRenderer.invoke('agent:terminate-all'),
    cleanup: (): Promise<number> => ipcRenderer.invoke('agent:cleanup'),
    getStatus: (): Promise<{
      total: number
      active: number
      idle: number
      busy: number
      terminated: number
      hasHarness: boolean
      taskAgents: number
      mergeAgents: number
    }> => ipcRenderer.invoke('agent:get-status')
  },

  // Harness Agent API
  harness: {
    initialize: (
      featureId: string,
      featureGoal: string,
      graph: DAGGraph,
      claudeMd?: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('harness:initialize', featureId, featureGoal, graph, claudeMd),
    start: (): Promise<boolean> => ipcRenderer.invoke('harness:start'),
    pause: (): Promise<boolean> => ipcRenderer.invoke('harness:pause'),
    resume: (): Promise<boolean> => ipcRenderer.invoke('harness:resume'),
    stop: (): Promise<boolean> => ipcRenderer.invoke('harness:stop'),
    getState: (): Promise<{
      status: HarnessStatus
      featureId: string | null
      featureGoal: string | null
      claudeMd: string | null
      activeTasks: TaskExecutionState[]
      pendingIntentions: PendingIntention[]
      messageHistory: HarnessMessage[]
      startedAt: string | null
      stoppedAt: string | null
    }> => ipcRenderer.invoke('harness:get-state'),
    getStatus: (): Promise<HarnessStatus> => ipcRenderer.invoke('harness:get-status'),
    registerTaskAssignment: (taskId: string, agentId: string): Promise<boolean> =>
      ipcRenderer.invoke('harness:register-task-assignment', taskId, agentId),
    receiveIntention: (
      agentId: string,
      taskId: string,
      intention: string,
      files?: string[]
    ): Promise<boolean> =>
      ipcRenderer.invoke('harness:receive-intention', agentId, taskId, intention, files),
    processIntention: (taskId: string): Promise<IntentionDecision | null> =>
      ipcRenderer.invoke('harness:process-intention', taskId),
    markTaskWorking: (taskId: string): Promise<boolean> =>
      ipcRenderer.invoke('harness:mark-task-working', taskId),
    markTaskMerging: (taskId: string): Promise<boolean> =>
      ipcRenderer.invoke('harness:mark-task-merging', taskId),
    completeTask: (taskId: string): Promise<boolean> =>
      ipcRenderer.invoke('harness:complete-task', taskId),
    failTask: (taskId: string, error: string): Promise<boolean> =>
      ipcRenderer.invoke('harness:fail-task', taskId, error),
    getMessageHistory: (): Promise<HarnessMessage[]> =>
      ipcRenderer.invoke('harness:get-message-history'),
    reset: (): Promise<boolean> => ipcRenderer.invoke('harness:reset')
  },

  // Task Agent API
  taskAgent: {
    create: (
      featureId: string,
      taskId: string,
      task: Task,
      graph: DAGGraph,
      claudeMd?: string,
      featureGoal?: string,
      config?: Partial<TaskAgentConfig>
    ): Promise<{ success: boolean; state: TaskAgentState }> =>
      ipcRenderer.invoke(
        'task-agent:create',
        featureId,
        taskId,
        task,
        graph,
        claudeMd,
        featureGoal,
        config
      ),
    getState: (taskId: string): Promise<TaskAgentState | null> =>
      ipcRenderer.invoke('task-agent:get-state', taskId),
    getStatus: (taskId: string): Promise<TaskAgentStatus | null> =>
      ipcRenderer.invoke('task-agent:get-status', taskId),
    getAll: (): Promise<TaskAgentState[]> => ipcRenderer.invoke('task-agent:get-all'),
    proposeIntention: (taskId: string, intention?: string): Promise<boolean> =>
      ipcRenderer.invoke('task-agent:propose-intention', taskId, intention),
    receiveApproval: (taskId: string, decision: IntentionDecision): Promise<boolean> =>
      ipcRenderer.invoke('task-agent:receive-approval', taskId, decision),
    execute: (taskId: string): Promise<TaskExecutionResult> =>
      ipcRenderer.invoke('task-agent:execute', taskId),
    cleanup: (taskId: string, removeWorktree?: boolean): Promise<boolean> =>
      ipcRenderer.invoke('task-agent:cleanup', taskId, removeWorktree),
    clearAll: (): Promise<boolean> => ipcRenderer.invoke('task-agent:clear-all')
  },

  // Merge Agent API
  mergeAgent: {
    create: (
      featureId: string,
      taskId: string,
      taskTitle: string
    ): Promise<{ success: boolean; state: MergeAgentState }> =>
      ipcRenderer.invoke('merge-agent:create', featureId, taskId, taskTitle),
    getState: (taskId: string): Promise<MergeAgentState | null> =>
      ipcRenderer.invoke('merge-agent:get-state', taskId),
    getStatus: (taskId: string): Promise<MergeAgentStatus | null> =>
      ipcRenderer.invoke('merge-agent:get-status', taskId),
    getAll: (): Promise<MergeAgentState[]> => ipcRenderer.invoke('merge-agent:get-all'),
    proposeIntention: (taskId: string): Promise<boolean> =>
      ipcRenderer.invoke('merge-agent:propose-intention', taskId),
    receiveApproval: (taskId: string, decision: IntentionDecision): Promise<boolean> =>
      ipcRenderer.invoke('merge-agent:receive-approval', taskId, decision),
    execute: (taskId: string): Promise<TaskMergeResult> =>
      ipcRenderer.invoke('merge-agent:execute', taskId),
    abort: (taskId: string): Promise<boolean> => ipcRenderer.invoke('merge-agent:abort', taskId),
    cleanup: (taskId: string): Promise<boolean> =>
      ipcRenderer.invoke('merge-agent:cleanup', taskId),
    clearAll: (): Promise<boolean> => ipcRenderer.invoke('merge-agent:clear-all')
  },

  // Auth API
  auth: {
    initialize: (): Promise<AuthState> => ipcRenderer.invoke('auth:initialize'),
    getState: (): Promise<AuthState> => ipcRenderer.invoke('auth:getState'),
    setCredentials: (type: 'oauth' | 'api_key', value: string): Promise<AuthState> =>
      ipcRenderer.invoke('auth:setCredentials', type, value),
    clearCredentials: (): Promise<AuthState> => ipcRenderer.invoke('auth:clearCredentials'),
    isAuthenticated: (): Promise<boolean> => ipcRenderer.invoke('auth:isAuthenticated')
  },

  // Project API
  project: {
    openDialog: (): Promise<string | null> => ipcRenderer.invoke('project:open-dialog'),
    setProject: (path: string): Promise<{ success: boolean; hasGit?: boolean; error?: string }> =>
      ipcRenderer.invoke('project:set-project', path),
    getCurrent: (): Promise<string> => ipcRenderer.invoke('project:get-current'),
    create: (
      parentPath: string,
      projectName: string
    ): Promise<{ success: boolean; projectPath?: string; error?: string }> =>
      ipcRenderer.invoke('project:create', { parentPath, projectName }),
    selectParentDialog: (): Promise<string | null> =>
      ipcRenderer.invoke('project:select-parent-dialog'),
    getRecent: (): Promise<Array<{ path: string; name: string; lastOpened: string }>> =>
      ipcRenderer.invoke('project:get-recent'),
    removeRecent: (path: string): Promise<void> =>
      ipcRenderer.invoke('project:remove-recent', path),
    clearRecent: (): Promise<void> => ipcRenderer.invoke('project:clear-recent')
  },

  // Chat API (AI chat integration)
  chat: {
    send: (request) => ipcRenderer.invoke('chat:send', request),
    getContext: (featureId: string) => ipcRenderer.invoke('chat:getContext', featureId)
  },

  // History API (undo/redo)
  history: {
    pushVersion: (
      featureId: string,
      graph: DAGGraph,
      description?: string
    ): Promise<{ success: boolean; state?: HistoryState; error?: string }> =>
      ipcRenderer.invoke('history:pushVersion', featureId, graph, description),
    undo: (
      featureId: string
    ): Promise<{ success: boolean; graph?: DAGGraph; state?: HistoryState; error?: string }> =>
      ipcRenderer.invoke('history:undo', featureId),
    redo: (
      featureId: string
    ): Promise<{ success: boolean; graph?: DAGGraph; state?: HistoryState; error?: string }> =>
      ipcRenderer.invoke('history:redo', featureId),
    getState: (featureId: string): Promise<HistoryState> =>
      ipcRenderer.invoke('history:getState', featureId)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
