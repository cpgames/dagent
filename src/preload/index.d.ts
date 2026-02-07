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
  TopologicalResult,
  DAGAnalysisSerialized,
  TaskDependencies
} from '../main/dag-engine/types'
import type { TransitionResult } from '../main/dag-engine/task-controller'
import type { CascadeResult } from '../main/dag-engine/cascade'
import type {
  ExecutionState,
  ExecutionConfig,
  ExecutionSnapshot,
  NextTasksResult,
  TaskLoopStatus
} from '../main/dag-engine/orchestrator-types'
import type {
  GitManagerConfig,
  BranchInfo,
  GitOperationResult,
  WorktreeInfo,
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
  DevAgentState,
  DevAgentStatus,
  DevAgentConfig,
  TaskContext,
  DependencyContextEntry,
  TaskExecutionResult
} from '../main/agents/dev-types'
import type {
  MergeAgentState,
  MergeAgentStatus,
  MergeContext,
  ConflictResolution,
  MergeIntention
} from '../main/agents/merge-types'
import type { AgentQueryOptions, AgentStreamEvent } from '../main/agent/types'
import type {
  ProjectContext,
  ContextOptions,
  FullContext
} from '../main/context'
import type {
  CreatePRRequest,
  CreatePRResult,
  GhCliStatus
} from '../main/github'
import type {
  FeatureMergeAgentState,
  FeatureMergeResult
} from '../main/agents/feature-merge-types'
import type {
  CreateSpecInput,
  CreateSpecResult,
  UpdateSpecInput,
  UpdateSpecResult,
  GetSpecInput,
  GetSpecResult
} from '../main/agents/feature-spec-types'
import type {
  Session,
  ChatMessage,
  Memory,
  SessionContext,
  AgentDescription,
  CreateSessionOptions,
  SessionUpdateEvent
} from '../../shared/types/session'
import type { AppSettings } from '@shared/types/settings'
import type {
  FeatureManagerPoolStatus,
  FeatureManagerInfo
} from '@shared/types/pool'

/**
 * SDK availability status for Claude Agent SDK.
 */
export interface SDKStatus {
  available: boolean
  claudeCodeInstalled: boolean
  claudeCliFound: boolean
  claudeCliPath: string | null
  hasCredentials: boolean
  message: string
}

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
  createFeature: (name: string, options?: {description?: string, attachments?: string[], autoStart?: boolean, worktreeId?: string}) => Promise<Feature>
  saveFeature: (feature: Feature) => Promise<boolean>
  loadFeature: (featureId: string) => Promise<Feature | null>
  deleteFeature: (featureId: string) => Promise<boolean>
  listFeatures: () => Promise<string[]>
  featureExists: (name: string) => Promise<boolean>

  // DAG operations
  saveDag: (featureId: string, dag: DAGGraph) => Promise<boolean>
  loadDag: (featureId: string) => Promise<DAGGraph | null>

  // Feature-level chat operations
  /** @deprecated Use SessionManager.addMessage() instead. See doc/api-reference.md for migration guide. */
  saveChat: (featureId: string, chat: ChatHistory) => Promise<boolean>
  /** @deprecated Use SessionManager.getSession() instead. See doc/api-reference.md for migration guide. */
  loadChat: (featureId: string) => Promise<ChatHistory | null>

  // Harness log operations
  saveHarnessLog: (featureId: string, log: AgentLog) => Promise<boolean>
  loadHarnessLog: (featureId: string) => Promise<AgentLog | null>

  // Node chat operations
  /** @deprecated Use SessionManager with task context instead. */
  saveNodeChat: (featureId: string, nodeId: string, chat: ChatHistory) => Promise<boolean>
  /** @deprecated Use SessionManager with task context instead. */
  loadNodeChat: (featureId: string, nodeId: string) => Promise<ChatHistory | null>

  // Node logs operations
  saveNodeLogs: (featureId: string, nodeId: string, log: AgentLog) => Promise<boolean>
  loadNodeLogs: (featureId: string, nodeId: string) => Promise<AgentLog | null>

  // Node deletion
  deleteNode: (featureId: string, nodeId: string) => Promise<boolean>

  // Task session operations
  loadTaskSession: (featureId: string, taskId: string) => Promise<DevAgentSession | null>
  listTaskSessions: (featureId: string) => Promise<string[]>
  clearSessionMessages: (featureId: string, taskId: string) => Promise<boolean>
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

  /**
   * Subscribe to DAG updates from the orchestrator.
   * Returns an unsubscribe function.
   */
  onUpdated: (callback: (data: { featureId: string; graph: DAGGraph }) => void) => () => void
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
   * Start a single task in step-by-step execution mode.
   * Use when feature.executionMode === 'step' to manually start individual tasks.
   */
  startSingleTask: (taskId: string) => Promise<{ success: boolean; error?: string }>

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

  /**
   * Get loop status for a specific task
   */
  getLoopStatus: (taskId: string) => Promise<TaskLoopStatus | null>

  /**
   * Get all active loop statuses
   */
  getAllLoopStatuses: () => Promise<Record<string, TaskLoopStatus>>

  /**
   * Abort a task's loop
   */
  abortLoop: (taskId: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Abort a paused task - discard all changes and reset to ready status
   */
  abortTask: (taskId: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Subscribe to loop status updates
   */
  onLoopStatusUpdated: (callback: (status: TaskLoopStatus) => void) => () => void
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

  /**
   * Initialize a new git repository
   */
  initRepo: (projectRoot: string) => Promise<GitOperationResult>

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
   * Stash current working directory changes
   */
  stash: (message?: string) => Promise<GitOperationResult>

  /**
   * Pop the most recent stash
   */
  stashPop: () => Promise<GitOperationResult>

  /**
   * Discard all working directory changes (staged, unstaged, and untracked)
   * WARNING: This is destructive and cannot be undone!
   */
  discardChanges: () => Promise<GitOperationResult>

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

  /**
   * Checkout a branch
   */
  checkout: (branchName: string) => Promise<GitOperationResult>

  /**
   * Get commit diff text for in-app rendering
   */
  getCommitDiff: (
    commitHash: string,
    worktreePath?: string
  ) => Promise<{
    success: boolean
    diff?: string
    commit?: {
      hash: string
      message: string
      author: string
      email: string
      date: string
    }
    error?: string
  }>

  /**
   * Get list of configured remotes
   */
  getRemotes: () => Promise<{
    success: boolean
    remotes: Array<{ name: string; fetchUrl: string; pushUrl: string }>
    error?: string
  }>

  /**
   * Publish repository to GitHub using gh CLI.
   * Creates a new repo and pushes all commits.
   */
  publishToGitHub: (
    repoName: string,
    visibility: 'public' | 'private'
  ) => Promise<{
    success: boolean
    repoUrl?: string
    message?: string
    error?: string
  }>
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
    claudeMd?: string,
    projectRoot?: string
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
 * Dev agent creation result.
 */
export interface DevAgentCreateResult {
  success: boolean
  state: DevAgentState
}

/**
 * Merge agent creation result.
 */
export interface MergeAgentCreateResult {
  success: boolean
  state: MergeAgentState
}

/**
 * Dev Agent API for executing individual tasks.
 * Implements intention-approval workflow with harness oversight.
 */
export interface DevAgentAPI {
  /**
   * Create and initialize a dev agent
   */
  create: (
    featureId: string,
    taskId: string,
    task: Task,
    graph: DAGGraph,
    claudeMd?: string,
    featureGoal?: string,
    config?: Partial<DevAgentConfig>
  ) => Promise<DevAgentCreateResult>

  /**
   * Get dev agent state by task ID
   */
  getState: (taskId: string) => Promise<DevAgentState | null>

  /**
   * Get dev agent status by task ID
   */
  getStatus: (taskId: string) => Promise<DevAgentStatus | null>

  /**
   * Get all active dev agents
   */
  getAll: () => Promise<DevAgentState[]>

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
   * Clean up dev agent resources
   */
  cleanup: (taskId: string, removeWorktree?: boolean) => Promise<boolean>

  /**
   * Clear all dev agents
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

  /**
   * Get SDK availability status (Claude Code installation and credentials)
   */
  getSDKStatus: () => Promise<SDKStatus>
}

/**
 * Project API for project selection and switching.
 * Enables opening different project folders from the UI.
 */
export interface ProjectAPI {
  /**
   * Open native folder picker dialog.
   * Returns selected path or null if cancelled.
   */
  openDialog: () => Promise<string | null>

  /**
   * Set the current project and reinitialize managers.
   * Switches DAGent to work with a different project folder.
   * Returns hasGit: false if the folder is not a git repository.
   */
  setProject: (path: string) => Promise<{ success: boolean; hasGit?: boolean; error?: string }>

  /**
   * Get the current project root path.
   */
  getCurrent: () => Promise<string>

  /**
   * Create a new project with folder and .dagent-worktrees structure.
   */
  create: (
    parentPath: string,
    projectName: string
  ) => Promise<{ success: boolean; projectPath?: string; error?: string }>

  /**
   * Open native folder picker for selecting parent directory.
   * Used when creating a new project.
   */
  selectParentDialog: () => Promise<string | null>

  /**
   * Get list of recently opened projects.
   */
  getRecent: () => Promise<Array<{ path: string; name: string; lastOpened: string }>>

  /**
   * Remove a project from the recent projects list.
   */
  removeRecent: (path: string) => Promise<void>

  /**
   * Clear all recent projects.
   */
  clearRecent: () => Promise<void>
}

/**
 * Feature context for AI chat.
 */
export interface FeatureContext {
  featureId: string
  featureName: string
  goal: string
  tasks: Array<{ id: string; title: string; status: string; spec?: string }>
  dagSummary: string
}

/**
 * Chat API for AI chat integration.
 * Sends messages to Claude API and returns responses.
 */
export interface ChatAPI {
  /**
   * Send messages to Claude API and get a response.
   */
  send: (request: {
    messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>
    systemPrompt?: string
  }) => Promise<{ content: string; error?: string }>

  /**
   * Get feature context for AI prompts.
   */
  getContext: (
    featureId: string
  ) => Promise<{ context: FeatureContext; systemPrompt: string } | null>

  /**
   * Subscribe to chat update events.
   */
  onUpdated: (callback: (data: { featureId: string }) => void) => () => void
}

/**
 * SDK Agent API for Agent SDK streaming.
 * Enables streaming queries through the Claude Agent SDK.
 */
export interface SdkAgentAPI {
  /**
   * Start a streaming agent query.
   * Events are received via onStream callback.
   */
  query: (options: AgentQueryOptions) => Promise<void>

  /**
   * Abort the current agent query.
   */
  abort: () => Promise<void>

  /**
   * Subscribe to stream events.
   * Returns unsubscribe function.
   */
  onStream: (callback: (event: AgentStreamEvent) => void) => () => void
}

/**
 * Project inspection result from Setup Agent.
 */
export interface ProjectInspectionResult {
  type: 'empty' | 'brownfield'
  hasClaudeMd: boolean
  techStack?: {
    languages: string[]
    frameworks: string[]
    buildTools: string[]
    configFiles: string[]
  }
  structure?: {
    srcDirs: string[]
    hasTests: boolean
    hasDocs: boolean
    fileCount: number
  }
}

/**
 * Setup Agent API for conversational project setup and CLAUDE.md generation.
 * Uses natural chat interface to investigate project and generate documentation.
 */
export interface SetupAgentAPI {
  /**
   * Initialize the Setup Agent for a project.
   * Inspects the project and returns a contextual greeting.
   */
  initialize: (projectRoot: string) => Promise<{
    success: boolean
    inspection?: ProjectInspectionResult
    greeting?: string
    state?: unknown
    error?: string
  }>

  /**
   * Get current Setup Agent state.
   */
  getState: (projectRoot: string) => Promise<unknown | null>

  /**
   * Send a message to the Setup Agent.
   * Streams response events via onStream callback.
   */
  query: (projectRoot: string, userMessage: string) => Promise<void>

  /**
   * Abort the current Setup Agent query.
   */
  abort: () => Promise<void>

  /**
   * Reset the Setup Agent and clear conversation.
   */
  reset: () => Promise<{ success: boolean }>

  /**
   * Subscribe to Setup Agent stream events.
   * Returns unsubscribe function.
   */
  onStream: (callback: (event: AgentStreamEvent) => void) => () => void
}

/**
 * Chat type for unified chat API.
 * Maps to session AgentType. The backend handles 'task' -> 'dev' mapping.
 */
export type UnifiedChatType = 'feature' | 'project' | 'dev' | 'qa' | 'merge' | 'harness'

/**
 * Memory summary from context compaction.
 * Uses importance-based prioritization.
 */
export interface MemorySummary {
  critical: string[]   // CRITICAL - Core purpose, essential requirements
  important: string[]  // IMPORTANT - Key requirements, significant details
  minor: string[]      // MINOR - Nice-to-haves, can be dropped if over token limit
}

/**
 * Memory data from context compaction.
 */
export interface Memory {
  version: number
  createdAt: string
  updatedAt: string
  summary: MemorySummary
  compactionInfo: {
    messagesCompacted: number
    oldestMessageTimestamp: string
    newestMessageTimestamp: string
    compactedAt: string
  }
  stats: {
    totalCompactions: number
    totalMessages: number
    totalTokens: number
  }
}

/**
 * Unified Chat API for all interactive chat types.
 * Provides a single interface for setup, PM, and investigation chats.
 */
export interface UnifiedChatAPI {
  /**
   * Initialize a chat session.
   * Returns greeting and optional context (e.g., project inspection for project chat).
   */
  initialize: (
    sessionId: string,
    chatType: UnifiedChatType,
    projectRoot: string,
    featureId?: string
  ) => Promise<{
    success: boolean
    greeting?: string
    context?: unknown  // Generic context (e.g., ProjectInspectionResult for project chat)
    messages?: ChatMessage[]
    error?: string
  }>

  /**
   * Send a message to the chat.
   * Streams response events via onStream callback.
   */
  send: (sessionId: string, message: string) => Promise<void>

  /**
   * Abort the current response.
   */
  abort: (sessionId: string) => Promise<void>

  /**
   * Reset a chat session (clear messages).
   */
  reset: (sessionId: string) => Promise<{ success: boolean }>

  /**
   * Get all messages for a session.
   */
  getMessages: (sessionId: string) => Promise<ChatMessage[]>

  /**
   * Add a message to a session.
   * Used by frontend to persist split messages during streaming.
   */
  addMessage: (sessionId: string, message: ChatMessage) => Promise<{ success: boolean }>

  /**
   * Get memory for a session.
   */
  getMemory: (sessionId: string) => Promise<Memory | null>

  /**
   * Manually trigger compaction for a session.
   */
  compact: (sessionId: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Subscribe to chat stream events.
   * Returns unsubscribe function.
   */
  onStream: (callback: (data: { sessionId: string; event: AgentStreamEvent }) => void) => () => void

  /**
   * Subscribe to compaction start events.
   * Returns unsubscribe function.
   */
  onCompactionStart: (callback: (data: { sessionId: string; messagesCount: number; estimatedTokens: number }) => void) => () => void

  /**
   * Subscribe to compaction complete events.
   * Returns unsubscribe function.
   */
  onCompactionComplete: (callback: (data: { sessionId: string; messagesCompacted: number; tokensReclaimed: number; newMemoryVersion: number; compactedAt: string }) => void) => () => void

  /**
   * Subscribe to compaction error events.
   * Returns unsubscribe function.
   */
  onCompactionError: (callback: (data: { sessionId: string; error: string }) => void) => () => void
}

/**
 * Options for deleting a feature.
 */
export interface FeatureDeleteOptions {
  deleteBranch?: boolean
  force?: boolean
}

/**
 * Result of deleting a feature.
 */
export interface FeatureDeleteResult {
  success: boolean
  deletedBranch?: boolean
  deletedWorktrees?: number
  terminatedAgents?: number
  error?: string
}

/**
 * Feature status change event data.
 */
export interface FeatureStatusChangeEvent {
  featureId: string
  status: string
}

/**
 * Feature API for feature-level operations.
 * Handles feature deletion with comprehensive cleanup and status management.
 */
export interface FeatureAPI {
  /**
   * Delete a feature with full cleanup:
   * - Terminates agents working on the feature
   * - Removes all task worktrees
   * - Removes the feature worktree
   * - Deletes the feature branch (if option is true)
   * - Deletes feature storage
   */
  delete: (featureId: string, options?: FeatureDeleteOptions) => Promise<FeatureDeleteResult>

  /**
   * Update feature status with validation.
   * Uses FeatureStatusManager to ensure valid transitions.
   */
  updateStatus: (featureId: string, newStatus: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Subscribe to feature status changes from the orchestrator.
   * Returns an unsubscribe function.
   */
  onStatusChanged: (callback: (data: FeatureStatusChangeEvent) => void) => () => void

  /**
   * Subscribe to feature created events.
   * Fired when a feature is created (by UI or Project Agent).
   * Returns an unsubscribe function.
   */
  onCreated: (callback: (data: { featureId: string; name: string }) => void) => () => void

  /**
   * Subscribe to feature analysis result events.
   * Returns an unsubscribe function.
   */
  onAnalysisResult: (callback: (data: { featureId: string; uncertainties?: string[] }) => void) => () => void

  /**
   * Subscribe to feature manager assignment events.
   * Fired when a feature is assigned to a manager.
   * Returns an unsubscribe function.
   */
  onManagerAssigned: (callback: (data: { featureId: string; featureManagerId: number; queuePosition: number }) => void) => () => void

  /**
   * Save an attachment file for a feature.
   * For active features: .dagent-worktrees/{managerName}/.dagent/features/{featureId}/attachments/
   * For backlog features: .dagent/features/{featureId}/attachments/
   */
  saveAttachment: (featureId: string, fileName: string, fileBuffer: ArrayBuffer) => Promise<string>

  /**
   * List all attachments for a feature.
   */
  listAttachments: (featureId: string) => Promise<string[]>

  /**
   * Start PM agent planning for a feature (full parameters version).
   * Used by startWorktreeCreation for initial planning.
   * Runs asynchronously - does not block the response.
   */
  startPlanningFull: (
    featureId: string,
    featureName: string,
    description?: string,
    attachments?: string[]
  ) => Promise<{ success: boolean; error?: string }>

  /**
   * Start planning for a feature in 'ready_for_planning' status.
   * Called when user clicks the Plan button after PM has gathered enough info.
   */
  startPlanning: (featureId: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Continue PM agent conversation with user's response.
   * Called when user sends a message in chat during planning phase.
   */
  respondToPM: (
    featureId: string,
    userResponse: string
  ) => Promise<{ success: boolean; canProceed: boolean; uncertainties?: string[]; error?: string }>

  /**
   * Start worktree creation for a backlog feature.
   * Creates worktree and transitions feature to active status.
   * On failure reverts to backlog.
   */
  startWorktreeCreation: (featureId: string) => Promise<{ success: boolean; featureId?: string; error?: string }>

  /**
   * Replan a feature - deletes all tasks and spec, restarts planning.
   * Only allowed when feature is in 'backlog' status.
   */
  replan: (featureId: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Upload attachment files to feature worktree.
   * Returns array of relative paths where files were saved.
   */
  uploadAttachments: (featureId: string, files: File[]) => Promise<string[]>

  /**
   * Delete an attachment file from feature worktree.
   * Also removes the reference from feature.json.
   */
  deleteAttachment: (featureId: string, attachmentPath: string) => Promise<void>
}

/**
 * Context API for project/feature/task context.
 * Enables agents to access comprehensive codebase context.
 */
export interface ContextAPI {
  /**
   * Get project context (structure, CLAUDE.md, PROJECT.md, git history).
   */
  getProjectContext: () => Promise<ProjectContext | { error: string }>

  /**
   * Get full context with optional feature and task context.
   */
  getFullContext: (options: ContextOptions) => Promise<FullContext | { error: string }>

  /**
   * Get formatted prompt from full context.
   */
  getFormattedPrompt: (context: FullContext) => Promise<string | { error: string }>

  /**
   * Get CLAUDE.md content from project root.
   */
  getClaudeMd: () => Promise<{ content: string | null } | { error: string }>

  /**
   * Check if CLAUDE.md has uncommitted changes.
   */
  hasClaudeMdChanges: () => Promise<{ hasChanges: boolean; error?: string }>

  /**
   * Save CLAUDE.md content to project root.
   */
  saveClaudeMd: (content: string) => Promise<{ success: true } | { error: string }>

  /**
   * Commit CLAUDE.md to git and sync to all worktrees.
   */
  commitAndSyncClaudeMd: () => Promise<{ success: true; synced: boolean } | { error: string }>

  /**
   * Subscribe to CLAUDE.md update events.
   */
  onClaudeMdUpdated: (callback: (data: { path: string }) => void) => () => void
}

/**
 * Skill progress event data.
 */
export interface SkillProgressData {
  message: string
  detail?: string
}

/**
 * Skill API for running Claude Code skills.
 */
export interface SkillAPI {
  /**
   * Run the /init skill to generate CLAUDE.md.
   */
  runInit: () => Promise<{ success: true } | { error: string }>

  /**
   * Subscribe to skill progress events.
   * Returns an unsubscribe function.
   */
  onProgress: (callback: (data: SkillProgressData) => void) => () => void
}

/**
 * PR API for GitHub pull request operations.
 * Uses the gh CLI for PR creation.
 */
export interface PRAPI {
  /**
   * Check if gh CLI is installed and authenticated.
   */
  checkGhCli: () => Promise<GhCliStatus>

  /**
   * Create a pull request on GitHub.
   */
  create: (request: CreatePRRequest) => Promise<CreatePRResult>

  /**
   * Generate PR title and body from feature spec using AI.
   */
  generateSummary: (featureId: string) => Promise<{
    success: boolean
    title?: string
    body?: string
    error?: string
  }>
}

/**
 * GitHub CLI API for checking and managing gh CLI status.
 */
export interface GitHubAPI {
  /**
   * Check if gh CLI is installed and authenticated.
   */
  checkGhCli: () => Promise<GhCliStatus>

  /**
   * Trigger gh auth login with web browser OAuth flow.
   */
  authLogin: () => Promise<{
    success: boolean
    message?: string
    error?: string
  }>
}

/**
 * Result from creating a FeatureMergeAgent.
 */
export interface FeatureMergeCreateResult {
  success: boolean
  state: FeatureMergeAgentState
}

/**
 * Result from checking branches for merge.
 */
export interface FeatureMergeBranchCheckResult {
  success: boolean
  state?: FeatureMergeAgentState
  error?: string
}

/**
 * Feature Merge API for merging completed features into main branch.
 * Uses FeatureMergeAgent for AI-assisted merge or PR creation.
 */
export interface FeatureMergeAPI {
  /**
   * Create and initialize a feature merge agent.
   */
  create: (featureId: string, targetBranch?: string) => Promise<FeatureMergeCreateResult>

  /**
   * Get current state of a feature merge agent.
   */
  getState: (featureId: string) => Promise<FeatureMergeAgentState | null>

  /**
   * Check that feature and target branches exist.
   */
  checkBranches: (featureId: string) => Promise<FeatureMergeBranchCheckResult>

  /**
   * Execute the merge (auto-approves and merges).
   */
  execute: (featureId: string) => Promise<FeatureMergeResult>

  /**
   * Cleanup merge agent resources.
   */
  cleanup: (featureId: string) => Promise<{ success: boolean }>

  /**
   * Subscribe to streaming events from the merge agent.
   * Returns unsubscribe function.
   */
  onStream: (callback: (data: { featureId: string; event: AgentStreamEvent }) => void) => () => void
}

/**
 * PM Spec API for feature specification management.
 * Enables PM Agent to create and manage feature specs that capture user intent.
 */
export interface PMSpecAPI {
  /**
   * Create a new feature specification.
   */
  createSpec: (input: CreateSpecInput) => Promise<CreateSpecResult>

  /**
   * Update an existing feature specification.
   */
  updateSpec: (input: UpdateSpecInput) => Promise<UpdateSpecResult>

  /**
   * Get a feature specification.
   */
  getSpec: (input: GetSpecInput) => Promise<GetSpecResult>

  /**
   * Subscribe to spec update events.
   * Returns an unsubscribe function.
   */
  onUpdated: (callback: (data: { featureId: string }) => void) => () => void
}

/**
 * DAGManager API for validated DAG operations with cycle detection.
 * Provides centralized DAG mutation operations with validation and event emission.
 */
export interface DAGManagerAPI {
  /**
   * Create/initialize DAGManager for a feature.
   * Sets up event forwarding to renderer process.
   */
  create: (featureId: string, projectRoot: string) => Promise<{ success: boolean; graph: DAGGraph }>

  /**
   * Add a node to the graph with validation.
   */
  addNode: (featureId: string, projectRoot: string, task: Partial<Task>) => Promise<Task>

  /**
   * Remove a node from the graph (also removes related connections).
   */
  removeNode: (featureId: string, projectRoot: string, nodeId: string) => Promise<{ success: boolean }>

  /**
   * Add a connection to the graph with cycle detection.
   * Returns null if validation fails (e.g., would create a cycle).
   */
  addConnection: (featureId: string, projectRoot: string, sourceId: string, targetId: string) => Promise<Connection | null>

  /**
   * Remove a connection from the graph.
   */
  removeConnection: (featureId: string, projectRoot: string, connectionId: string) => Promise<{ success: boolean }>

  /**
   * Move a node to a new position.
   */
  moveNode: (featureId: string, projectRoot: string, nodeId: string, position: { x: number; y: number }) => Promise<{ success: boolean }>

  /**
   * Get the current graph state.
   */
  getGraph: (featureId: string, projectRoot: string) => Promise<DAGGraph>

  /**
   * Replace the entire graph.
   */
  resetGraph: (featureId: string, projectRoot: string, graph: DAGGraph) => Promise<{ success: boolean }>

  /**
   * Apply automatic layout to arrange nodes in a tree structure based on dependencies.
   */
  autoLayout: (featureId: string, projectRoot: string) => Promise<{ success: boolean; graph: DAGGraph }>

  /**
   * Subscribe to DAGManager events (node-added, connection-added, etc.).
   * Returns an unsubscribe function.
   */
  onEvent: (callback: (data: { featureId: string; event: any }) => void) => () => void
}

/**
 * DAG Layout API for persisting node positions.
 */
export interface DAGLayoutAPI {
  /**
   * Save layout positions for a feature.
   */
  save: (featureId: string, positions: Record<string, { x: number; y: number }>) => Promise<{ success: boolean; error?: string }>

  /**
   * Load layout positions for a feature.
   */
  load: (featureId: string) => Promise<{
    success: boolean;
    layout: {
      featureId: string;
      positions: Record<string, { x: number; y: number }>;
      updatedAt: string
    } | null;
    error?: string
  }>

  /**
   * Delete layout data for a feature.
   */
  delete: (featureId: string) => Promise<{ success: boolean; deleted: boolean; error?: string }>
}

/**
 * PM Tools API for task management.
 * Enables PM Agent to create, read, update, and delete tasks with dependency inference.
 */
export interface PMToolsAPI {
  /**
   * Set the feature context for PM tool operations.
   */
  setContext: (featureId: string | null) => Promise<void>

  /**
   * Get the current feature context.
   */
  getContext: () => Promise<string | null>

  /**
   * Create a new task in the current feature's DAG.
   * Supports optional dependencies via dependsOn array.
   */
  createTask: (input: CreateTaskInput) => Promise<CreateTaskResult>

  /**
   * List all tasks in the current feature's DAG.
   */
  listTasks: () => Promise<ListTasksResult>

  /**
   * Add a dependency between two existing tasks.
   * fromTaskId must complete before toTaskId can start.
   */
  addDependency: (input: AddDependencyInput) => Promise<AddDependencyResult>

  /**
   * Get detailed information about a specific task.
   * Includes dependencies and dependents.
   */
  getTask: (input: GetTaskInput) => Promise<GetTaskResult>

  /**
   * Update an existing task's title and/or spec.
   * Only provided fields will be updated.
   */
  updateTask: (input: UpdateTaskInput) => Promise<UpdateTaskResult>

  /**
   * Delete a task from the DAG.
   * Uses reassignDependents to control how dependent tasks are handled.
   */
  deleteTask: (input: DeleteTaskInput) => Promise<DeleteTaskResult>

  /**
   * Remove an existing dependency between two tasks.
   * The toTask may become ready if it has no other incomplete dependencies.
   */
  removeDependency: (input: RemoveDependencyInput) => Promise<RemoveDependencyResult>
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

/**
 * Session API for session & checkpoint management.
 * Handles conversation sessions across all agent types with automatic compaction.
 */
export interface SessionAPI {
  /**
   * Get or create a session for a specific context
   */
  getOrCreate: (
    projectRoot: string,
    options: CreateSessionOptions
  ) => Promise<Session>

  /**
   * Get session by ID
   */
  getById: (
    projectRoot: string,
    sessionId: string,
    featureId: string
  ) => Promise<Session | null>

  /**
   * Archive a session
   */
  archive: (
    projectRoot: string,
    sessionId: string,
    featureId: string
  ) => Promise<void>

  /**
   * Add a message to a session
   */
  addMessage: (
    projectRoot: string,
    sessionId: string,
    featureId: string,
    message: Omit<ChatMessage, 'id' | 'timestamp'>
  ) => Promise<ChatMessage>

  /**
   * Load all messages from a session (convenience for PM chat)
   */
  loadMessages: (
    projectRoot: string,
    sessionId: string,
    featureId: string
  ) => Promise<ChatMessage[]>

  /**
   * Add a user message to a session (convenience for PM chat)
   */
  addUserMessage: (
    projectRoot: string,
    sessionId: string,
    featureId: string,
    content: string
  ) => Promise<void>

  /**
   * Add an assistant message to a session (convenience for PM chat)
   */
  addAssistantMessage: (
    projectRoot: string,
    sessionId: string,
    featureId: string,
    content: string,
    metadata?: Record<string, unknown>
  ) => Promise<void>

  /**
   * Get recent messages from a session
   */
  getRecentMessages: (
    projectRoot: string,
    sessionId: string,
    featureId: string,
    limit?: number
  ) => Promise<ChatMessage[]>

  /**
   * Get all messages from a session
   */
  getAllMessages: (
    projectRoot: string,
    sessionId: string,
    featureId: string
  ) => Promise<ChatMessage[]>

  /**
   * Clear all messages from a session
   */
  clearMessages: (
    projectRoot: string,
    sessionId: string,
    featureId: string
  ) => Promise<void>

  /**
   * Get checkpoint for a session
   */
  getCheckpoint: (
    projectRoot: string,
    sessionId: string,
    featureId: string
  ) => Promise<Checkpoint | null>

  /**
   * Update checkpoint for a session
   */
  updateCheckpoint: (
    projectRoot: string,
    sessionId: string,
    featureId: string,
    checkpoint: Checkpoint
  ) => Promise<void>

  /**
   * Get context for a session
   */
  getContext: (
    projectRoot: string,
    sessionId: string,
    featureId: string
  ) => Promise<SessionContext | null>

  /**
   * Update context for a session
   */
  updateContext: (
    projectRoot: string,
    sessionId: string,
    featureId: string,
    context: SessionContext
  ) => Promise<void>

  /**
   * Get agent description for a session
   */
  getAgentDescription: (
    projectRoot: string,
    sessionId: string,
    featureId: string
  ) => Promise<AgentDescription | null>

  /**
   * Set agent description for a session
   */
  setAgentDescription: (
    projectRoot: string,
    sessionId: string,
    featureId: string,
    description: AgentDescription
  ) => Promise<void>

  /**
   * Get compaction metrics for a session
   */
  getMetrics: (
    projectRoot: string,
    sessionId: string,
    featureId: string
  ) => Promise<{
    totalCompactions: number
    totalMessagesCompacted: number
    totalTokens: number
    lastCompactionAt?: string
  } | null>

  /**
   * Manually trigger compaction for a session
   */
  forceCompact: (
    projectRoot: string,
    sessionId: string,
    featureId: string
  ) => Promise<void>

  /**
   * Build complete request ready for Claude Agent SDK
   */
  buildRequest: (
    projectRoot: string,
    sessionId: string,
    featureId: string,
    userMessage: string
  ) => Promise<{
    systemPrompt: string
    userPrompt: string
    totalTokens: number
  }>

  /**
   * Preview request with detailed token breakdown
   */
  previewRequest: (
    projectRoot: string,
    sessionId: string,
    featureId: string,
    userMessage?: string
  ) => Promise<{
    systemPrompt: string
    userPrompt: string
    breakdown: {
      agentDescTokens: number
      contextTokens: number
      checkpointTokens: number
      messagesTokens: number
      userPromptTokens: number
      total: number
    }
  }>

  /**
   * Subscribe to compaction start events
   */
  onCompactionStart: (callback: (data: {
    sessionId: string
    featureId: string
    taskId?: string
    messagesCount: number
    estimatedTokens: number
  }) => void) => () => void

  /**
   * Subscribe to compaction complete events
   */
  onCompactionComplete: (callback: (data: {
    sessionId: string
    featureId: string
    taskId?: string
    messagesCompacted: number
    tokensReclaimed: number
    newCheckpointVersion: number
    compactedAt: string
  }) => void) => () => void

  /**
   * Subscribe to compaction error events
   */
  onCompactionError: (callback: (data: {
    sessionId: string
    error: string
  }) => void) => () => void

  /**
   * Subscribe to session update events
   */
  onUpdated: (callback: (event: SessionUpdateEvent) => void) => () => void
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
   * Set the window title
   */
  setWindowTitle: (title: string) => Promise<void>

  /**
   * Open a detached panel window for viewing specific feature panels
   */
  openPanelWindow: (options: {
    panelId: string
    featureId: string
    taskId?: string
    title?: string
  }) => Promise<{ success: boolean; windowId?: number }>

  /**
   * Close a detached panel window
   */
  closePanelWindow: (
    panelId: string,
    featureId: string,
    taskId?: string
  ) => Promise<{ success: boolean }>

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
   * Dev Agent API for executing individual tasks
   */
  devAgent: DevAgentAPI

  /**
   * Merge Agent API for branch integration
   */
  mergeAgent: MergeAgentAPI

  /**
   * Auth API for credential management
   */
  auth: AuthAPI

  /**
   * Project API for project selection and switching
   */
  project: ProjectAPI

  /**
   * History API for undo/redo graph versioning
   */
  history: HistoryAPI

  /**
   * Chat API for AI chat integration
   */
  chat: ChatAPI

  /**
   * SDK Agent API for Agent SDK streaming
   */
  sdkAgent: SdkAgentAPI

  /**
   * Setup Agent API for conversational project setup
   */
  setupAgent: SetupAgentAPI

  /**
   * Unified Chat API for all interactive chat types
   */
  unifiedChat: UnifiedChatAPI

  /**
   * Load agent configurations from storage
   */
  agentLoadConfigs: () => Promise<Record<AgentRole, AgentConfig>>

  /**
   * Save agent configuration to storage
   */
  agentSaveConfig: (config: AgentConfig) => Promise<{ success: boolean }>

  /**
   * Reset agent configuration to defaults
   */
  agentResetConfig: (role: AgentRole) => Promise<AgentConfig>

  /**
   * Get runtime status for all agents from the pool
   */
  agentGetRuntimeStatus: () => Promise<Record<AgentRole, AgentRuntimeStatus>>

  /**
   * PM Tools API for task management
   */
  pmTools: PMToolsAPI

  /**
   * Feature API for feature-level operations
   */
  feature: FeatureAPI

  /**
   * Context API for project/feature/task context
   */
  context: ContextAPI

  /**
   * Skill API for running Claude Code skills
   */
  skill: SkillAPI

  /**
   * PR API for GitHub pull request operations
   */
  pr: PRAPI

  /**
   * GitHub CLI API for checking and managing gh CLI status
   */
  github: GitHubAPI

  /**
   * Feature Merge API for merging completed features into main
   */
  featureMerge: FeatureMergeAPI

  /**
   * PM Spec API for feature specification management
   */
  pmSpec: PMSpecAPI

  /**
   * DAGManager API for validated DAG operations with cycle detection
   */
  dagManager: DAGManagerAPI

  /**
   * DAG Layout API for persisting node positions
   */
  dagLayout: DAGLayoutAPI

  /**
   * Session API for session & checkpoint management
   */
  session: SessionAPI

  /**
   * Analysis API for task analysis orchestration
   */
  analysis: AnalysisAPI

  /**
   * Settings API for app-wide configuration
   */
  settings: SettingsAPI

  /**
   * Pool API for worktree pool management
   */
  pool: PoolAPI
}

/**
 * Analysis event data sent from main to renderer.
 */
export interface AnalysisEventData {
  type: string
  taskId?: string
  taskTitle?: string
  decision?: string
  newTaskCount?: number
  error?: string
}

/**
 * Analysis API for task analysis orchestration.
 * Enables PM agent to analyze needs_analysis tasks and split/keep as appropriate.
 */
export interface AnalysisAPI {
  /**
   * Start analysis for a feature's needs_analysis tasks.
   */
  start: (featureId: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Check if analysis is currently running for a feature.
   */
  status: (featureId: string) => Promise<{ running: boolean }>

  /**
   * Get count of pending (needs_analysis) tasks for a feature.
   */
  pending: (featureId: string) => Promise<{ count: number }>

  /**
   * Reanalyze a single task.
   * Sets the task back to needs_analysis and triggers analysis.
   */
  reanalyzeTask: (featureId: string, taskId: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Subscribe to analysis events.
   * Returns an unsubscribe function.
   */
  onEvent: (
    callback: (data: { featureId: string; event: AnalysisEventData }) => void
  ) => () => void
}

/**
 * Settings API for app-wide configuration.
 * Manages persistent settings stored in .dagent/settings.json.
 */
export interface SettingsAPI {
  /**
   * Load all settings from storage.
   * Returns settings merged with defaults for any missing values.
   */
  load: () => Promise<AppSettings>

  /**
   * Save all settings to storage.
   */
  save: (settings: AppSettings) => Promise<void>

  /**
   * Get a single setting value.
   */
  get: <K extends keyof AppSettings>(key: K) => Promise<AppSettings[K]>

  /**
   * Set a single setting value.
   */
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
}

/**
 * Pool API for worktree pool management.
 * Manages reusable worktrees for feature execution with queue support.
 */
export interface PoolAPI {
  /**
   * Get the current status of the worktree pool.
   */
  getStatus: () => Promise<FeatureManagerPoolStatus>

  /**
   * Get detailed info about all pool worktrees.
   */
  getWorktrees: () => Promise<FeatureManagerInfo[]>

  /**
   * Get queue position for a specific feature.
   */
  getFeatureQueuePosition: (featureId: string) => Promise<{ poolId: number; position: number } | null>

  /**
   * Assign a feature to a pool worktree.
   */
  assignFeature: (featureId: string, targetBranch: string) => Promise<{ poolId: number; queuePosition: number; worktreePath: string }>

  /**
   * Remove a feature from the pool queue.
   */
  removeFeature: (featureId: string) => Promise<boolean>

  /**
   * Get the current merge queue.
   */
  getMergeQueue: () => Promise<MergeQueueEntry[]>

  /**
   * Add a feature to the merge queue.
   */
  enqueueMerge: (featureId: string, poolId: number) => Promise<void>

  /**
   * Process the next merge in the queue.
   */
  processNextMerge: () => Promise<void>

  /**
   * Get the worktree path for a specific pool.
   */
  getWorktreePath: (poolId: number) => Promise<string | null>

  /**
   * Initialize the pool manager with a project root.
   */
  initialize: (projectRoot: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Cleanup pool manager resources.
   */
  cleanup: () => Promise<void>

  /**
   * Subscribe to pool status changes.
   */
  onStatusChanged: (callback: (data: any) => void) => () => void

  /**
   * Subscribe to feature queued events.
   */
  onFeatureQueued: (callback: (data: any) => void) => () => void

  /**
   * Subscribe to feature started events.
   */
  onFeatureStarted: (callback: (data: any) => void) => () => void

  /**
   * Subscribe to feature completed events.
   */
  onFeatureCompleted: (callback: (data: any) => void) => () => void

  /**
   * Subscribe to merge started events.
   */
  onMergeStarted: (callback: (data: any) => void) => () => void

  /**
   * Subscribe to merge completed events.
   */
  onMergeCompleted: (callback: (data: any) => void) => () => void

  /**
   * Subscribe to merge failed events.
   */
  onMergeFailed: (callback: (data: any) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
