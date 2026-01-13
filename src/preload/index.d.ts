/**
 * TypeScript declarations for the electronAPI exposed via contextBridge.
 * This enables type-safe IPC calls from the renderer process.
 */

import type {
  Feature,
  DAGGraph,
  ChatHistory,
  AgentLog,
  Task,
  AuthState,
  HistoryState
} from '@shared/types'
import type {
  TopologicalResult,
  DAGAnalysisSerialized,
  TaskDependencies
} from '../main/dag-engine/types'
import type { TransitionResult } from '../main/dag-engine/state-machine'
import type { CascadeResult } from '../main/dag-engine/cascade'
import type {
  ExecutionState,
  ExecutionConfig,
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
  AgentStatus,
  AgentInfo,
  AgentPoolConfig,
  AgentSpawnOptions,
  AgentContext
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
  TaskContext,
  DependencyContextEntry,
  TaskExecutionResult
} from '../main/agents/task-types'
import type {
  MergeAgentState,
  MergeAgentStatus,
  MergeContext,
  ConflictResolution,
  MergeIntention
} from '../main/agents/merge-types'

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
  createFeature: (name: string) => Promise<Feature>
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

  // State machine methods

  /**
   * Check if a state transition is valid
   */
  isValidTransition: (from: string, to: string, event: string) => Promise<boolean>

  /**
   * Get the next status for a given event from current status
   */
  getNextStatus: (currentStatus: string, event: string) => Promise<string | null>

  /**
   * Get all valid events for a given status
   */
  getValidEvents: (currentStatus: string) => Promise<string[]>

  /**
   * Transition a task to a new status via an event
   */
  transitionTask: (task: Task, event: string, graph?: DAGGraph) => Promise<TransitionResult>

  /**
   * Initialize all task statuses based on dependencies
   */
  initializeStatuses: (graph: DAGGraph) => Promise<DAGGraph>

  /**
   * Cascade completion status to dependent tasks
   */
  cascadeCompletion: (completedTaskId: string, graph: DAGGraph) => Promise<CascadeResult>

  /**
   * Reset a task and all its dependents to blocked
   */
  resetTask: (taskId: string, graph: DAGGraph) => Promise<CascadeResult>

  /**
   * Recalculate all task statuses based on dependencies
   */
  recalculateStatuses: (graph: DAGGraph) => Promise<CascadeResult>
}

/**
 * Execution Orchestrator API for managing DAG execution lifecycle.
 * Handles play/pause/stop, task assignment, and completion tracking.
 */
export interface ExecutionAPI {
  /**
   * Initialize orchestrator with a feature's DAG graph
   */
  initialize: (featureId: string, graph: DAGGraph) => Promise<ExecutionSnapshot>

  /**
   * Start execution (Play button)
   */
  start: () => Promise<{ success: boolean; error?: string }>

  /**
   * Pause execution (Stop button - running tasks finish current operation)
   */
  pause: () => Promise<{ success: boolean; error?: string }>

  /**
   * Resume execution after pause
   */
  resume: () => Promise<{ success: boolean; error?: string }>

  /**
   * Stop execution and reset state
   */
  stop: () => Promise<{ success: boolean; error?: string }>

  /**
   * Get current execution state
   */
  getState: () => Promise<ExecutionState>

  /**
   * Get tasks ready for execution and available for assignment
   */
  getNextTasks: () => Promise<NextTasksResult>

  /**
   * Assign a task to an agent (marks as running)
   */
  assignTask: (taskId: string, agentId?: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Mark task code as complete (transitions to merging)
   */
  completeTaskCode: (taskId: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Mark task merge as successful (cascades to unblock dependents)
   */
  completeMerge: (taskId: string) => Promise<{ success: boolean; unblocked: string[]; error?: string }>

  /**
   * Mark a task as failed
   */
  failTask: (taskId: string, error?: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Get full execution snapshot (state, assignments, history, events)
   */
  getSnapshot: () => Promise<ExecutionSnapshot>

  /**
   * Update execution configuration
   */
  updateConfig: (config: Partial<ExecutionConfig>) => Promise<ExecutionConfig>

  /**
   * Reset orchestrator to initial state
   */
  reset: () => Promise<{ success: boolean }>
}

/**
 * Git API for repository operations.
 * Provides branch management, status, and worktree operations.
 */
export interface GitAPI {
  /**
   * Initialize GitManager with a project root directory
   */
  initialize: (projectRoot: string) => Promise<GitOperationResult>

  /**
   * Check if GitManager is initialized
   */
  isInitialized: () => Promise<boolean>

  /**
   * Get current git configuration
   */
  getConfig: () => Promise<GitManagerConfig>

  /**
   * Get current branch name
   */
  getCurrentBranch: () => Promise<string>

  /**
   * List all local branches
   */
  listBranches: () => Promise<BranchInfo[]>

  /**
   * Check if a branch exists
   */
  branchExists: (branchName: string) => Promise<boolean>

  /**
   * Create a new branch
   */
  createBranch: (branchName: string, checkout?: boolean) => Promise<GitOperationResult>

  /**
   * Delete a branch
   */
  deleteBranch: (branchName: string, force?: boolean) => Promise<GitOperationResult>

  /**
   * Get repository status
   */
  getStatus: () => Promise<GitOperationResult>

  // Worktree operations

  /**
   * List all worktrees
   */
  listWorktrees: () => Promise<WorktreeInfo[]>

  /**
   * Get a worktree by its path
   */
  getWorktree: (worktreePath: string) => Promise<WorktreeInfo | null>

  /**
   * Check if a worktree exists at the given path
   */
  worktreeExists: (worktreePath: string) => Promise<boolean>

  /**
   * Create a feature worktree with .dagent directory
   */
  createFeatureWorktree: (featureId: string) => Promise<FeatureWorktreeResult>

  /**
   * Create a task worktree branching from feature branch
   */
  createTaskWorktree: (featureId: string, taskId: string) => Promise<TaskWorktreeResult>

  /**
   * Remove a worktree (and optionally its branch)
   */
  removeWorktree: (worktreePath: string, deleteBranch?: boolean) => Promise<GitOperationResult>

  // Merge operations

  /**
   * Merge a branch into current branch
   */
  mergeBranch: (branchName: string, message?: string) => Promise<MergeResult>

  /**
   * Get current merge conflicts
   */
  getConflicts: () => Promise<MergeConflict[]>

  /**
   * Abort an in-progress merge
   */
  abortMerge: () => Promise<GitOperationResult>

  /**
   * Check if there's a merge in progress
   */
  isMergeInProgress: () => Promise<boolean>

  /**
   * Merge a task branch into its feature branch
   * This is the main operation for completing a task per DAGENT_SPEC 8.4
   */
  mergeTaskIntoFeature: (
    featureId: string,
    taskId: string,
    removeWorktreeOnSuccess?: boolean
  ) => Promise<TaskMergeResult>

  /**
   * Get commit log for a branch or worktree
   */
  getLog: (maxCount?: number, branch?: string) => Promise<CommitInfo[]>

  /**
   * Get diff summary between two refs
   */
  getDiffSummary: (from: string, to: string) => Promise<DiffSummary>
}

/**
 * Agent pool status summary.
 */
export interface AgentPoolStatus {
  total: number
  active: number
  idle: number
  busy: number
  terminated: number
  hasHarness: boolean
  taskAgents: number
  mergeAgents: number
}

/**
 * Agent Pool API for managing AI agents.
 * Handles agent registration, status tracking, and lifecycle management.
 */
export interface AgentAPI {
  /**
   * Get current pool configuration
   */
  getConfig: () => Promise<AgentPoolConfig>

  /**
   * Update pool configuration
   */
  updateConfig: (config: Partial<AgentPoolConfig>) => Promise<AgentPoolConfig>

  /**
   * Get all agents in the pool
   */
  getAll: () => Promise<AgentInfo[]>

  /**
   * Get agent by ID
   */
  getById: (id: string) => Promise<AgentInfo | undefined>

  /**
   * Get agents by type
   */
  getByType: (type: AgentType) => Promise<AgentInfo[]>

  /**
   * Get harness agent (if active)
   */
  getHarness: () => Promise<AgentInfo | undefined>

  /**
   * Check if we can spawn a new agent of given type
   */
  canSpawn: (type: AgentType) => Promise<boolean>

  /**
   * Get available slots for a given agent type
   */
  getAvailableSlots: (type: AgentType) => Promise<number>

  /**
   * Register an agent in the pool
   */
  register: (options: AgentSpawnOptions) => Promise<AgentInfo>

  /**
   * Update agent status
   */
  updateStatus: (id: string, status: AgentStatus, taskId?: string) => Promise<boolean>

  /**
   * Terminate an agent
   */
  terminate: (id: string) => Promise<boolean>

  /**
   * Terminate all agents
   */
  terminateAll: () => Promise<boolean>

  /**
   * Remove terminated agents from pool
   */
  cleanup: () => Promise<number>

  /**
   * Get pool status summary
   */
  getStatus: () => Promise<AgentPoolStatus>
}

/**
 * Harness state returned from getState().
 */
export interface HarnessStateResponse {
  status: HarnessStatus
  featureId: string | null
  featureGoal: string | null
  claudeMd: string | null
  activeTasks: TaskExecutionState[]
  pendingIntentions: PendingIntention[]
  messageHistory: HarnessMessage[]
  startedAt: string | null
  stoppedAt: string | null
}

/**
 * Harness Agent API for orchestrating task agents.
 * Implements intention-approval workflow per DAGENT_SPEC section 7.
 */
export interface HarnessAPI {
  /**
   * Initialize harness for a feature execution
   */
  initialize: (
    featureId: string,
    featureGoal: string,
    graph: DAGGraph,
    claudeMd?: string
  ) => Promise<boolean>

  /**
   * Start execution - harness becomes active
   */
  start: () => Promise<boolean>

  /**
   * Pause execution
   */
  pause: () => Promise<boolean>

  /**
   * Resume execution after pause
   */
  resume: () => Promise<boolean>

  /**
   * Stop execution
   */
  stop: () => Promise<boolean>

  /**
   * Get current harness state
   */
  getState: () => Promise<HarnessStateResponse>

  /**
   * Get harness status
   */
  getStatus: () => Promise<HarnessStatus>

  /**
   * Register a task agent assignment
   */
  registerTaskAssignment: (taskId: string, agentId: string) => Promise<boolean>

  /**
   * Receive an intention from a task agent
   */
  receiveIntention: (
    agentId: string,
    taskId: string,
    intention: string,
    files?: string[]
  ) => Promise<boolean>

  /**
   * Process and decide on a pending intention
   */
  processIntention: (taskId: string) => Promise<IntentionDecision | null>

  /**
   * Mark task as working (post-approval)
   */
  markTaskWorking: (taskId: string) => Promise<boolean>

  /**
   * Mark task as merging
   */
  markTaskMerging: (taskId: string) => Promise<boolean>

  /**
   * Mark task as completed
   */
  completeTask: (taskId: string) => Promise<boolean>

  /**
   * Mark task as failed
   */
  failTask: (taskId: string, error: string) => Promise<boolean>

  /**
   * Get message history
   */
  getMessageHistory: () => Promise<HarnessMessage[]>

  /**
   * Reset harness state
   */
  reset: () => Promise<boolean>
}

/**
 * Task agent creation result.
 */
export interface TaskAgentCreateResult {
  success: boolean
  state: TaskAgentState
}

/**
 * Merge agent creation result.
 */
export interface MergeAgentCreateResult {
  success: boolean
  state: MergeAgentState
}

/**
 * Task Agent API for executing individual tasks.
 * Implements intention-approval workflow with harness oversight.
 */
export interface TaskAgentAPI {
  /**
   * Create and initialize a task agent
   */
  create: (
    featureId: string,
    taskId: string,
    task: Task,
    graph: DAGGraph,
    claudeMd?: string,
    featureGoal?: string,
    config?: Partial<TaskAgentConfig>
  ) => Promise<TaskAgentCreateResult>

  /**
   * Get task agent state by task ID
   */
  getState: (taskId: string) => Promise<TaskAgentState | null>

  /**
   * Get task agent status by task ID
   */
  getStatus: (taskId: string) => Promise<TaskAgentStatus | null>

  /**
   * Get all active task agents
   */
  getAll: () => Promise<TaskAgentState[]>

  /**
   * Propose an intention to the harness
   */
  proposeIntention: (taskId: string, intention?: string) => Promise<boolean>

  /**
   * Receive approval decision from harness
   */
  receiveApproval: (taskId: string, decision: IntentionDecision) => Promise<boolean>

  /**
   * Execute the approved task
   */
  execute: (taskId: string) => Promise<TaskExecutionResult>

  /**
   * Clean up task agent resources
   */
  cleanup: (taskId: string, removeWorktree?: boolean) => Promise<boolean>

  /**
   * Clear all task agents
   */
  clearAll: () => Promise<boolean>
}

/**
 * Merge Agent API for branch integration.
 * Handles merging completed task branches into feature branches per DAGENT_SPEC 8.4.
 */
export interface MergeAgentAPI {
  /**
   * Create and initialize a merge agent for a task
   */
  create: (featureId: string, taskId: string, taskTitle: string) => Promise<MergeAgentCreateResult>

  /**
   * Get merge agent state by task ID
   */
  getState: (taskId: string) => Promise<MergeAgentState | null>

  /**
   * Get merge agent status by task ID
   */
  getStatus: (taskId: string) => Promise<MergeAgentStatus | null>

  /**
   * Get all active merge agents
   */
  getAll: () => Promise<MergeAgentState[]>

  /**
   * Propose merge intention to the harness
   */
  proposeIntention: (taskId: string) => Promise<boolean>

  /**
   * Receive approval decision from harness
   */
  receiveApproval: (taskId: string, decision: IntentionDecision) => Promise<boolean>

  /**
   * Execute the approved merge
   */
  execute: (taskId: string) => Promise<TaskMergeResult>

  /**
   * Abort an in-progress merge
   */
  abort: (taskId: string) => Promise<boolean>

  /**
   * Clean up merge agent resources
   */
  cleanup: (taskId: string) => Promise<boolean>

  /**
   * Clear all merge agents
   */
  clearAll: () => Promise<boolean>
}

/**
 * Auth API for credential management.
 * Implements priority chain per DAGENT_SPEC 10.1-10.3.
 */
export interface AuthAPI {
  /**
   * Initialize and check credentials in priority order
   */
  initialize: () => Promise<AuthState>

  /**
   * Get current auth state
   */
  getState: () => Promise<AuthState>

  /**
   * Set manual credentials (stored in ~/.dagent/credentials.json)
   */
  setCredentials: (type: 'oauth' | 'api_key', value: string) => Promise<AuthState>

  /**
   * Clear stored credentials
   */
  clearCredentials: () => Promise<AuthState>

  /**
   * Check if authenticated
   */
  isAuthenticated: () => Promise<boolean>
}

/**
 * History API for undo/redo graph versioning.
 * Implements DAGENT_SPEC 5.5 with 20-version history.
 */
export interface HistoryAPI {
  /**
   * Push a new version after a graph modification
   */
  pushVersion: (
    featureId: string,
    graph: DAGGraph,
    description?: string
  ) => Promise<{ success: boolean; state?: HistoryState; error?: string }>

  /**
   * Undo - restore previous graph version
   */
  undo: (
    featureId: string
  ) => Promise<{ success: boolean; graph?: DAGGraph; state?: HistoryState; error?: string }>

  /**
   * Redo - restore forward graph version
   */
  redo: (
    featureId: string
  ) => Promise<{ success: boolean; graph?: DAGGraph; state?: HistoryState; error?: string }>

  /**
   * Get current history state
   */
  getState: (featureId: string) => Promise<HistoryState>
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

  /**
   * Execution Orchestrator API for managing DAG execution lifecycle
   */
  execution: ExecutionAPI

  /**
   * Git API for git operations (branches, status, worktrees)
   */
  git: GitAPI

  /**
   * Agent Pool API for managing AI agents
   */
  agent: AgentAPI

  /**
   * Harness Agent API for orchestrating task agents
   */
  harness: HarnessAPI

  /**
   * Task Agent API for executing individual tasks
   */
  taskAgent: TaskAgentAPI

  /**
   * Merge Agent API for branch integration
   */
  mergeAgent: MergeAgentAPI

  /**
   * Auth API for credential management
   */
  auth: AuthAPI

  /**
   * History API for undo/redo graph versioning
   */
  history: HistoryAPI
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
