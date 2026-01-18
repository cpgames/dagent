import { contextBridge, ipcRenderer } from 'electron'
import type {
  Feature,
  DAGGraph,
  ChatHistory,
  AgentLog,
  Task,
  Connection,
  AuthState,
  HistoryState,
  AgentConfig,
  AgentRole,
  AgentRuntimeStatus,
  CreateTaskInput,
  CreateTaskResult,
  ListTasksResult,
  AddDependencyInput,
  AddDependencyResult,
  GetTaskInput,
  GetTaskResult,
  UpdateTaskInput,
  UpdateTaskResult,
  DeleteTaskInput,
  DeleteTaskResult,
  RemoveDependencyInput,
  RemoveDependencyResult,
  DevAgentSession
} from '@shared/types'
import type {
  ProjectContext,
  ContextOptions,
  FullContext
} from '../main/context'
import type { TopologicalResult, DAGAnalysisSerialized } from '../main/dag-engine/types'
import type { TransitionResult } from '../main/dag-engine/state-machine'
import type { CascadeResult } from '../main/dag-engine/cascade'
import type {
  ExecutionConfig,
  ExecutionState,
  ExecutionSnapshot,
  NextTasksResult,
  TaskLoopStatus
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
import type { AgentQueryOptions, AgentStreamEvent } from '../main/agent/types'
import type {
  DevAgentState,
  DevAgentStatus,
  DevAgentConfig,
  TaskExecutionResult
} from '../main/agents/dev-types'
import type { MergeAgentState, MergeAgentStatus } from '../main/agents/merge-types'
import type { CreatePRRequest, CreatePRResult, GhCliStatus } from '../main/github'
import type { FeatureMergeAgentState, FeatureMergeResult } from '../main/agents/feature-merge-types'
import type {
  CreateSpecInput,
  CreateSpecResult,
  UpdateSpecInput,
  UpdateSpecResult,
  GetSpecInput,
  GetSpecResult
} from '../main/agents/feature-spec-types'
import type { AppSettings } from '@shared/types/settings'

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
    createFeature: (name: string, options?: {description?: string, attachments?: string[], autoMerge?: boolean}): Promise<Feature> =>
      ipcRenderer.invoke('storage:createFeature', name, options),
    featureExists: (name: string): Promise<boolean> =>
      ipcRenderer.invoke('storage:featureExists', name),

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
      ipcRenderer.invoke('storage:deleteNode', featureId, nodeId),

    // Task session operations
    loadTaskSession: (featureId: string, taskId: string): Promise<DevAgentSession | null> =>
      ipcRenderer.invoke('storage:loadTaskSession', featureId, taskId),
    listTaskSessions: (featureId: string): Promise<string[]> =>
      ipcRenderer.invoke('storage:listTaskSessions', featureId)
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
      ipcRenderer.invoke('dag:recalculate-statuses', graph),

    // Listen for DAG updates from orchestrator
    onUpdated: (
      callback: (data: { featureId: string; graph: DAGGraph }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { featureId: string; graph: DAGGraph }
      ): void => callback(data)
      ipcRenderer.on('dag:updated', handler)
      return () => ipcRenderer.removeListener('dag:updated', handler)
    }
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
    reset: (): Promise<{ success: boolean }> => ipcRenderer.invoke('execution:reset'),

    // Loop status methods (Ralph Loop)
    getLoopStatus: (taskId: string): Promise<TaskLoopStatus | null> =>
      ipcRenderer.invoke('execution:get-loop-status', taskId),
    getAllLoopStatuses: (): Promise<Record<string, TaskLoopStatus>> =>
      ipcRenderer.invoke('execution:get-all-loop-statuses'),
    abortLoop: (taskId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('execution:abort-loop', taskId),
    onLoopStatusUpdated: (callback: (status: TaskLoopStatus) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: TaskLoopStatus): void =>
        callback(status)
      ipcRenderer.on('task:loop-status-updated', handler)
      return () => ipcRenderer.removeListener('task:loop-status-updated', handler)
    }
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
      claudeMd?: string,
      projectRoot?: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('harness:initialize', featureId, featureGoal, graph, claudeMd, projectRoot),
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

  // Dev Agent API
  devAgent: {
    create: (
      featureId: string,
      taskId: string,
      task: Task,
      graph: DAGGraph,
      claudeMd?: string,
      featureGoal?: string,
      config?: Partial<DevAgentConfig>
    ): Promise<{ success: boolean; state: DevAgentState }> =>
      ipcRenderer.invoke(
        'dev-agent:create',
        featureId,
        taskId,
        task,
        graph,
        claudeMd,
        featureGoal,
        config
      ),
    getState: (taskId: string): Promise<DevAgentState | null> =>
      ipcRenderer.invoke('dev-agent:get-state', taskId),
    getStatus: (taskId: string): Promise<DevAgentStatus | null> =>
      ipcRenderer.invoke('dev-agent:get-status', taskId),
    getAll: (): Promise<DevAgentState[]> => ipcRenderer.invoke('dev-agent:get-all'),
    proposeIntention: (taskId: string, intention?: string): Promise<boolean> =>
      ipcRenderer.invoke('dev-agent:propose-intention', taskId, intention),
    receiveApproval: (taskId: string, decision: IntentionDecision): Promise<boolean> =>
      ipcRenderer.invoke('dev-agent:receive-approval', taskId, decision),
    execute: (taskId: string): Promise<TaskExecutionResult> =>
      ipcRenderer.invoke('dev-agent:execute', taskId),
    cleanup: (taskId: string, removeWorktree?: boolean): Promise<boolean> =>
      ipcRenderer.invoke('dev-agent:cleanup', taskId, removeWorktree),
    clearAll: (): Promise<boolean> => ipcRenderer.invoke('dev-agent:clear-all')
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
    isAuthenticated: (): Promise<boolean> => ipcRenderer.invoke('auth:isAuthenticated'),
    getSDKStatus: (): Promise<{
      available: boolean
      claudeCodeInstalled: boolean
      hasCredentials: boolean
      message: string
    }> => ipcRenderer.invoke('auth:getSDKStatus')
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
    getContext: (featureId: string) => ipcRenderer.invoke('chat:getContext', featureId),
    onUpdated: (callback: (data: { featureId: string }) => void) => {
      const handler = (_event: unknown, data: { featureId: string }) => callback(data)
      ipcRenderer.on('chat:updated', handler)
      return () => ipcRenderer.removeListener('chat:updated', handler)
    }
  },

  // SDK Agent API (Agent SDK streaming)
  sdkAgent: {
    query: (options: AgentQueryOptions): Promise<void> =>
      ipcRenderer.invoke('sdk-agent:query', options),
    abort: (): Promise<void> => ipcRenderer.invoke('sdk-agent:abort'),
    onStream: (callback: (event: AgentStreamEvent) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: AgentStreamEvent): void =>
        callback(data)
      ipcRenderer.on('sdk-agent:stream', handler)
      return () => ipcRenderer.removeListener('sdk-agent:stream', handler)
    }
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
  },

  // Agent Config API (agent roles, persistence)
  agentLoadConfigs: (): Promise<Record<AgentRole, AgentConfig>> =>
    ipcRenderer.invoke('agent:loadConfigs'),
  agentSaveConfig: (config: AgentConfig): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('agent:saveConfig', config),
  agentResetConfig: (role: AgentRole): Promise<AgentConfig> =>
    ipcRenderer.invoke('agent:resetConfig', role),
  agentGetRuntimeStatus: (): Promise<Record<AgentRole, AgentRuntimeStatus>> =>
    ipcRenderer.invoke('agent:getRuntimeStatus'),

  // PM Tools API (task management for PM Agent)
  pmTools: {
    setContext: (featureId: string | null): Promise<void> =>
      ipcRenderer.invoke('pm-tools:setContext', featureId),
    getContext: (): Promise<string | null> => ipcRenderer.invoke('pm-tools:getContext'),
    createTask: (input: CreateTaskInput): Promise<CreateTaskResult> =>
      ipcRenderer.invoke('pm-tools:createTask', input),
    listTasks: (): Promise<ListTasksResult> => ipcRenderer.invoke('pm-tools:listTasks'),
    addDependency: (input: AddDependencyInput): Promise<AddDependencyResult> =>
      ipcRenderer.invoke('pm-tools:addDependency', input),
    getTask: (input: GetTaskInput): Promise<GetTaskResult> =>
      ipcRenderer.invoke('pm-tools:getTask', input),
    updateTask: (input: UpdateTaskInput): Promise<UpdateTaskResult> =>
      ipcRenderer.invoke('pm-tools:updateTask', input),
    deleteTask: (input: DeleteTaskInput): Promise<DeleteTaskResult> =>
      ipcRenderer.invoke('pm-tools:deleteTask', input),
    removeDependency: (input: RemoveDependencyInput): Promise<RemoveDependencyResult> =>
      ipcRenderer.invoke('pm-tools:removeDependency', input)
  },

  // Feature API (feature-level operations)
  feature: {
    delete: (
      featureId: string,
      options?: { deleteBranch?: boolean; force?: boolean }
    ): Promise<{
      success: boolean
      deletedBranch?: boolean
      deletedWorktrees?: number
      terminatedAgents?: number
      error?: string
    }> => ipcRenderer.invoke('feature:delete', featureId, options),

    // Update feature status with validation
    updateStatus: (
      featureId: string,
      newStatus: string
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('feature:updateStatus', featureId, newStatus),

    // Listen for feature status changes from orchestrator
    onStatusChanged: (
      callback: (data: { featureId: string; status: string }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { featureId: string; status: string }
      ): void => callback(data)
      ipcRenderer.on('feature:status-changed', handler)
      return () => ipcRenderer.removeListener('feature:status-changed', handler)
    },

    // Save an attachment file for a feature
    saveAttachment: (
      featureId: string,
      fileName: string,
      fileBuffer: ArrayBuffer
    ): Promise<string> =>
      ipcRenderer.invoke('feature:saveAttachment', featureId, fileName, fileBuffer),

    // List all attachments for a feature
    listAttachments: (featureId: string): Promise<string[]> =>
      ipcRenderer.invoke('feature:listAttachments', featureId),

    // Start PM agent planning for a feature
    startPlanning: (
      featureId: string,
      featureName: string,
      description?: string,
      attachments?: string[]
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('feature:startPlanning', featureId, featureName, description, attachments),

    // Upload attachment files to feature worktree
    uploadAttachments: async (featureId: string, files: File[]): Promise<string[]> => {
      // Convert File objects to ArrayBuffers for IPC transfer
      const fileData = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          buffer: await file.arrayBuffer()
        }))
      )
      return ipcRenderer.invoke('feature:uploadAttachments', featureId, fileData)
    }
  },

  // Context API (project/feature/task context for agents)
  context: {
    getProjectContext: (): Promise<ProjectContext | { error: string }> =>
      ipcRenderer.invoke('context:getProjectContext'),
    getFullContext: (options: ContextOptions): Promise<FullContext | { error: string }> =>
      ipcRenderer.invoke('context:getFullContext', options),
    getFormattedPrompt: (context: FullContext): Promise<string | { error: string }> =>
      ipcRenderer.invoke('context:getFormattedPrompt', context)
  },

  // PR API (GitHub PR operations via gh CLI)
  pr: {
    checkGhCli: (): Promise<GhCliStatus> => ipcRenderer.invoke('pr:check-gh-cli'),
    create: (request: CreatePRRequest): Promise<CreatePRResult> =>
      ipcRenderer.invoke('pr:create', request)
  },

  // Feature Merge API (merging completed features into main)
  featureMerge: {
    create: (featureId: string, targetBranch?: string): Promise<{ success: boolean; state: FeatureMergeAgentState }> =>
      ipcRenderer.invoke('feature-merge:create', featureId, targetBranch),
    getState: (featureId: string): Promise<FeatureMergeAgentState | null> =>
      ipcRenderer.invoke('feature-merge:get-state', featureId),
    checkBranches: (featureId: string): Promise<{ success: boolean; state?: FeatureMergeAgentState; error?: string }> =>
      ipcRenderer.invoke('feature-merge:check-branches', featureId),
    execute: (featureId: string, deleteBranchOnSuccess?: boolean): Promise<FeatureMergeResult> =>
      ipcRenderer.invoke('feature-merge:execute', featureId, deleteBranchOnSuccess),
    cleanup: (featureId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('feature-merge:cleanup', featureId)
  },

  // PM Spec API (feature specification management for PM Agent)
  pmSpec: {
    createSpec: (input: CreateSpecInput): Promise<CreateSpecResult> =>
      ipcRenderer.invoke('pm-spec:createSpec', input),
    updateSpec: (input: UpdateSpecInput): Promise<UpdateSpecResult> =>
      ipcRenderer.invoke('pm-spec:updateSpec', input),
    getSpec: (input: GetSpecInput): Promise<GetSpecResult> =>
      ipcRenderer.invoke('pm-spec:getSpec', input)
  },

  // DAGManager API (validated DAG operations with cycle detection)
  dagManager: {
    create: (featureId: string, projectRoot: string): Promise<{ success: boolean; graph: DAGGraph }> =>
      ipcRenderer.invoke('dag-manager:create', featureId, projectRoot),
    addNode: (featureId: string, projectRoot: string, task: Partial<Task>): Promise<Task> =>
      ipcRenderer.invoke('dag-manager:add-node', featureId, projectRoot, task),
    removeNode: (featureId: string, projectRoot: string, nodeId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('dag-manager:remove-node', featureId, projectRoot, nodeId),
    addConnection: (featureId: string, projectRoot: string, sourceId: string, targetId: string): Promise<Connection | null> =>
      ipcRenderer.invoke('dag-manager:add-connection', featureId, projectRoot, sourceId, targetId),
    removeConnection: (featureId: string, projectRoot: string, connectionId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('dag-manager:remove-connection', featureId, projectRoot, connectionId),
    moveNode: (featureId: string, projectRoot: string, nodeId: string, position: { x: number; y: number }): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('dag-manager:move-node', featureId, projectRoot, nodeId, position),
    getGraph: (featureId: string, projectRoot: string): Promise<DAGGraph> =>
      ipcRenderer.invoke('dag-manager:get-graph', featureId, projectRoot),
    resetGraph: (featureId: string, projectRoot: string, graph: DAGGraph): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('dag-manager:reset-graph', featureId, projectRoot, graph),
    onEvent: (callback: (data: { featureId: string; event: any }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { featureId: string; event: any }): void =>
        callback(data)
      ipcRenderer.on('dag-manager:event', handler)
      return () => ipcRenderer.removeListener('dag-manager:event', handler)
    }
  },

  // DAG Layout API (layout persistence)
  dagLayout: {
    save: (featureId: string, positions: Record<string, { x: number; y: number }>): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('dag-layout:save', featureId, positions),
    load: (featureId: string): Promise<{ success: boolean; layout: { featureId: string; positions: Record<string, { x: number; y: number }>; updatedAt: string } | null; error?: string }> =>
      ipcRenderer.invoke('dag-layout:load', featureId),
    delete: (featureId: string): Promise<{ success: boolean; deleted: boolean; error?: string }> =>
      ipcRenderer.invoke('dag-layout:delete', featureId)
  },

  // Session API (session & checkpoint management)
  session: {
    getOrCreate: (projectRoot: string, options: any): Promise<any> =>
      ipcRenderer.invoke('session:getOrCreate', projectRoot, options),
    getById: (projectRoot: string, sessionId: string, featureId: string): Promise<any> =>
      ipcRenderer.invoke('session:getById', projectRoot, sessionId, featureId),
    archive: (projectRoot: string, sessionId: string, featureId: string): Promise<void> =>
      ipcRenderer.invoke('session:archive', projectRoot, sessionId, featureId),
    addMessage: (projectRoot: string, sessionId: string, featureId: string, message: any): Promise<any> =>
      ipcRenderer.invoke('session:addMessage', projectRoot, sessionId, featureId, message),
    loadMessages: (projectRoot: string, sessionId: string, featureId: string): Promise<any[]> =>
      ipcRenderer.invoke('session:loadMessages', projectRoot, sessionId, featureId),
    addUserMessage: (projectRoot: string, sessionId: string, featureId: string, content: string): Promise<void> =>
      ipcRenderer.invoke('session:addUserMessage', projectRoot, sessionId, featureId, content),
    addAssistantMessage: (
      projectRoot: string,
      sessionId: string,
      featureId: string,
      content: string,
      metadata?: Record<string, unknown>
    ): Promise<void> =>
      ipcRenderer.invoke('session:addAssistantMessage', projectRoot, sessionId, featureId, content, metadata),
    getRecentMessages: (projectRoot: string, sessionId: string, featureId: string, limit?: number): Promise<any[]> =>
      ipcRenderer.invoke('session:getRecentMessages', projectRoot, sessionId, featureId, limit),
    getAllMessages: (projectRoot: string, sessionId: string, featureId: string): Promise<any[]> =>
      ipcRenderer.invoke('session:getAllMessages', projectRoot, sessionId, featureId),
    clearMessages: (projectRoot: string, sessionId: string, featureId: string): Promise<void> =>
      ipcRenderer.invoke('session:clearMessages', projectRoot, sessionId, featureId),
    getCheckpoint: (projectRoot: string, sessionId: string, featureId: string): Promise<any> =>
      ipcRenderer.invoke('session:getCheckpoint', projectRoot, sessionId, featureId),
    updateCheckpoint: (projectRoot: string, sessionId: string, featureId: string, checkpoint: any): Promise<void> =>
      ipcRenderer.invoke('session:updateCheckpoint', projectRoot, sessionId, featureId, checkpoint),
    getContext: (projectRoot: string, sessionId: string, featureId: string): Promise<any> =>
      ipcRenderer.invoke('session:getContext', projectRoot, sessionId, featureId),
    updateContext: (projectRoot: string, sessionId: string, featureId: string, context: any): Promise<void> =>
      ipcRenderer.invoke('session:updateContext', projectRoot, sessionId, featureId, context),
    getAgentDescription: (projectRoot: string, sessionId: string, featureId: string): Promise<any> =>
      ipcRenderer.invoke('session:getAgentDescription', projectRoot, sessionId, featureId),
    setAgentDescription: (projectRoot: string, sessionId: string, featureId: string, description: any): Promise<void> =>
      ipcRenderer.invoke('session:setAgentDescription', projectRoot, sessionId, featureId, description),
    getMetrics: (projectRoot: string, sessionId: string, featureId: string): Promise<any> =>
      ipcRenderer.invoke('session:getMetrics', projectRoot, sessionId, featureId),
    forceCompact: (projectRoot: string, sessionId: string, featureId: string): Promise<void> =>
      ipcRenderer.invoke('session:forceCompact', projectRoot, sessionId, featureId),
    buildRequest: (
      projectRoot: string,
      sessionId: string,
      featureId: string,
      userMessage: string
    ): Promise<any> =>
      ipcRenderer.invoke('session:buildRequest', projectRoot, sessionId, featureId, userMessage),
    previewRequest: (
      projectRoot: string,
      sessionId: string,
      featureId: string,
      userMessage?: string
    ): Promise<any> =>
      ipcRenderer.invoke('session:previewRequest', projectRoot, sessionId, featureId, userMessage),
    onCompactionStart: (callback: (data: any) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any): void => callback(data)
      ipcRenderer.on('session:compaction-start', handler)
      return () => ipcRenderer.removeListener('session:compaction-start', handler)
    },
    onCompactionComplete: (callback: (data: any) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any): void => callback(data)
      ipcRenderer.on('session:compaction-complete', handler)
      return () => ipcRenderer.removeListener('session:compaction-complete', handler)
    },
    onCompactionError: (callback: (data: any) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any): void => callback(data)
      ipcRenderer.on('session:compaction-error', handler)
      return () => ipcRenderer.removeListener('session:compaction-error', handler)
    },
    onUpdated: (callback: (event: any) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any): void => callback(data)
      ipcRenderer.on('session:updated', handler)
      return () => ipcRenderer.removeListener('session:updated', handler)
    },
    migratePMChat: (projectRoot: string, featureId: string): Promise<any> =>
      ipcRenderer.invoke('session:migratePMChat', projectRoot, featureId),
    migrateAllPMChats: (projectRoot: string): Promise<any[]> =>
      ipcRenderer.invoke('session:migrateAllPMChats', projectRoot),
    needsMigration: (projectRoot: string, featureId: string): Promise<boolean> =>
      ipcRenderer.invoke('session:needsMigration', projectRoot, featureId),
    migrateDevSession: (projectRoot: string, featureId: string, taskId: string): Promise<any> =>
      ipcRenderer.invoke('session:migrateDevSession', projectRoot, featureId, taskId),
    migrateAllDevSessions: (projectRoot: string, featureId: string): Promise<any> =>
      ipcRenderer.invoke('session:migrateAllDevSessions', projectRoot, featureId),
    needsDevSessionMigration: (projectRoot: string, featureId: string, taskId: string): Promise<boolean> =>
      ipcRenderer.invoke('session:needsDevSessionMigration', projectRoot, featureId, taskId)
  },

  // Analysis API (task analysis orchestration)
  analysis: {
    start: (featureId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('analysis:start', featureId),
    status: (featureId: string): Promise<{ running: boolean }> =>
      ipcRenderer.invoke('analysis:status', featureId),
    pending: (featureId: string): Promise<{ count: number }> =>
      ipcRenderer.invoke('analysis:pending', featureId),
    onEvent: (
      callback: (data: { featureId: string; event: { type: string; taskId?: string; taskTitle?: string; decision?: string; newTaskCount?: number; error?: string } }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { featureId: string; event: { type: string; taskId?: string; taskTitle?: string; decision?: string; newTaskCount?: number; error?: string } }
      ): void => callback(data)
      ipcRenderer.on('analysis:event', handler)
      return () => ipcRenderer.removeListener('analysis:event', handler)
    }
  },

  // Settings API (app-wide configuration)
  settings: {
    load: (): Promise<AppSettings> => ipcRenderer.invoke('settings:load'),
    save: (settings: AppSettings): Promise<void> => ipcRenderer.invoke('settings:save', settings),
    get: <K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> =>
      ipcRenderer.invoke('settings:get', key),
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> =>
      ipcRenderer.invoke('settings:set', key, value)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
