/**
 * TypeScript declarations for the electronAPI exposed via contextBridge.
 * This enables type-safe IPC calls from the renderer process.
 */

import type { Feature, DAGGraph, ChatHistory, AgentLog, Task } from '@shared/types'
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

  // TODO: Add auth method types
  // TODO: Add git method types
  // TODO: Add agent method types
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
