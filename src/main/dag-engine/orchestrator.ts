import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import type { DAGGraph, Task } from '@shared/types'
import type { FeatureStatus, WorktreeId } from '@shared/types/feature'
import type {
  ExecutionState,
  ExecutionConfig,
  TaskAssignment,
  ExecutionEvent,
  ExecutionSnapshot,
  NextTasksResult,
  TaskLoopStatus
} from './orchestrator-types'
import { DEFAULT_EXECUTION_CONFIG } from './orchestrator-types'
import type { TaskStateChange, TaskControllerState } from './task-controller'
import { transitionTask, createStateChangeRecord, createTaskController, TaskController } from './task-controller'
import { cascadeTaskCompletion, recalculateAllStatuses } from './cascade'
// Task pool functionality replaced by manager architecture
// Keeping stubs for compatibility
interface TaskPoolStub {
  assignTask: () => null
  getAssignedTasks: () => []
  releaseTask: () => void
  initializeFromGraph: (graph: DAGGraph) => void
  getPool: (status: string) => []
  getCounts: () => { ready: number, in_progress: number, ready_for_qa: number, completed: number, blocked: number }
  moveTask: (taskId: string, from: string, to: string) => void
}
function getTaskPoolManager(): TaskPoolStub {
  return {
    assignTask: () => null,
    getAssignedTasks: () => [],
    releaseTask: () => void 0,
    initializeFromGraph: () => void 0,
    getPool: () => [],
    getCounts: () => ({ ready: 0, in_progress: 0, ready_for_qa: 0, completed: 0, blocked: 0 }),
    moveTask: () => void 0
  }
}
function resetTaskPoolManager(): void { /* noop */ }
import { getDevAgent, getAllDevAgents, removeDevAgent, getAgentPool } from '../agents'
import { createFeatureMergeAgent, registerFeatureMergeAgent, removeFeatureMergeAgent } from '../agents/feature-merge-agent'
import { getPRService } from '../github'
import { getFeatureStatusManager } from '../ipc/feature-handlers'
import { createQAAgent, registerQAAgent, getQAAgent, removeQAAgent, getAllQAAgents, clearQAAgents } from '../agents/qa-agent'
import type { QAReviewResult } from '../agents/qa-types'
import type { LogEntry, LogEntryType } from '@shared/types'
import { getFeatureStore } from '../ipc/storage-handlers'
import { getContextService } from '../context'
import { getFeatureSpecStore } from '../agents/feature-spec-store'
import { getLogService } from '../storage/log-service'
import { getGitManager } from '../git'
import { getFeatureManagerPool } from '../git/worktree-pool-manager'

/**
 * Compute feature status based on task states.
 * With the simplified 4-state model:
 * - active: work in progress (any task not archived)
 * - merging: all tasks archived, ready for merge
 *
 * Note: backlog and archived are set explicitly by user actions, not computed.
 */
function computeFeatureStatus(tasks: Task[]): FeatureStatus {
  if (tasks.length === 0) {
    return 'active' // Empty feature is still active
  }

  const allArchived = tasks.every((t) => t.status === 'done')
  return allArchived ? 'merging' : 'active'
}

export class ExecutionOrchestrator extends EventEmitter {
  private state: ExecutionState
  private config: ExecutionConfig
  private assignments: Map<string, TaskAssignment>
  private history: TaskStateChange[]
  private events: ExecutionEvent[]
  private loopInterval: NodeJS.Timeout | null = null
  private readonly TICK_INTERVAL_MS = 1000
  // Track tasks that failed initialization this tick to prevent retry spam
  private failedThisTick: Set<string> = new Set()
  // Track persistent failures (context loading, etc.) with retry counts
  private initFailureCounts: Map<string, number> = new Map()
  private readonly MAX_INIT_RETRIES = 3
  // Track current feature status to detect changes
  private currentFeatureStatus: FeatureStatus = 'active'
  // Track TaskController instances for Ralph Loop execution
  private taskControllers: Map<string, TaskController> = new Map()
  // Single task mode - when set, only this task runs and no auto-assignment
  private singleTaskId: string | null = null

  constructor(config: Partial<ExecutionConfig> = {}) {
    super()
    this.config = { ...DEFAULT_EXECUTION_CONFIG, ...config }
    this.state = {
      status: 'idle',
      featureId: null,
      graph: null,
      startedAt: null,
      stoppedAt: null,
      error: null,
      worktreeId: null,
      worktreePath: null
    } as ExecutionState
    this.assignments = new Map()
    this.history = []
    this.events = []
    this.failedThisTick = new Set()
    this.initFailureCounts = new Map()
    this.currentFeatureStatus = 'active'
  }

  /**
   * Initialize orchestrator with a feature's DAG graph.
   */
  async initialize(featureId: string, graph: DAGGraph): Promise<void> {
    this.state.featureId = featureId
    this.state.graph = graph
    this.state.status = 'idle'
    this.state.error = null
    this.assignments.clear()
    this.history = []
    this.events = []
    this.failedThisTick.clear()
    this.initFailureCounts.clear()

    // Check if feature is archived
    const featureStore = getFeatureStore()
    if (featureStore) {
      const feature = await featureStore.loadFeature(featureId)
      if (feature) {
        this.currentFeatureStatus = feature.status
      }
    }

    // Recalculate all task statuses based on dependencies
    const { changes } = recalculateAllStatuses(graph)
    this.history.push(...changes)

    // Initialize task pools from graph state
    getTaskPoolManager().initializeFromGraph(graph)
  }

  /**
   * Start execution (Play button pressed).
   * In pool architecture, assigns feature to a pool worktree.
   */
  async start(): Promise<{ success: boolean; error?: string }> {
    console.log(`[Orchestrator] start() called - featureId: ${this.state.featureId}, graph: ${!!this.state.graph}`)

    if (!this.state.graph || !this.state.featureId) {
      console.log(`[Orchestrator] start() failed: No graph loaded`)
      return { success: false, error: 'No graph loaded' }
    }

    if (this.state.status === 'running') {
      console.log(`[Orchestrator] start() failed: Already running`)
      return { success: false, error: 'Execution already running' }
    }

    // Check if feature is archived - cannot start execution on archived features
    const featureStore = getFeatureStore()
    const feature = featureStore ? await featureStore.loadFeature(this.state.featureId) : null
    if (feature && feature.status === 'archived') {
      return { success: false, error: 'Cannot start execution on archived feature' }
    }

    // Set to auto mode when start() is called directly (not from startSingleTask)
    // singleTaskId is set before start() is called from startSingleTask
    if (!this.singleTaskId) {
      await this.setExecutionMode('auto')
    }

    // Validate git repository is ready for execution
    const gitValidation = await this.validateGitReady()
    if (!gitValidation.ready) {
      return { success: false, error: gitValidation.error }
    }

    // Get target branch (current branch when starting) for pool merge
    const gitManager = getGitManager()
    const targetBranch = await gitManager.getCurrentBranch()

    // Check if feature already has a worktree assigned (resuming execution)
    const managerPool = getFeatureManagerPool()
    try {
      // If feature already has worktree assignment, reuse it instead of reassigning
      if (feature?.worktreeId && feature?.worktreePath) {
        // Verify worktree still exists on disk - it may have been deleted
        const fs = await import('fs/promises')
        let worktreeExists = false
        try {
          await fs.access(feature.worktreePath)
          worktreeExists = true
        } catch {
          worktreeExists = false
        }

        if (worktreeExists) {
          console.log(`[Orchestrator] Feature ${this.state.featureId} already assigned to worktree ${feature.worktreeId}, reusing existing assignment`)
          this.state.worktreeId = feature.worktreeId
          this.state.worktreePath = feature.worktreePath
        } else {
          // Worktree was deleted - recreate it
          console.log(`[Orchestrator] Worktree for feature ${this.state.featureId} missing, recreating...`)
          this.state.worktreeId = feature.worktreeId
          // Map worktreeId to featureManagerId for pool manager
          const worktreeIdToManagerId = { neon: 1, cyber: 2, pulse: 3 } as const
          const managerId = worktreeIdToManagerId[feature.worktreeId]
          this.state.worktreePath = await managerPool.ensureWorktree(managerId)
          console.log(`[Orchestrator] Recreated worktree path: ${this.state.worktreePath}`)
        }
      } else {
        // New assignment - feature not yet assigned to a worktree
        const assignment = await managerPool.assignFeature(this.state.featureId, targetBranch)
        // Map featureManagerId to worktreeId
        const managerIdToWorktreeId = { 1: 'neon', 2: 'cyber', 3: 'pulse' } as const
        this.state.worktreeId = (managerIdToWorktreeId[assignment.featureManagerId as 1 | 2 | 3] || 'neon') as WorktreeId

        console.log(`[Orchestrator] Feature ${this.state.featureId} assigned to worktree ${this.state.worktreeId}, queue position ${assignment.queuePosition}`)

        // If queued (not immediately active), just update status and return
        if (assignment.queuePosition > 0) {
          console.log(`[Orchestrator] Feature queued at position ${assignment.queuePosition}, waiting for worktree availability`)
          return { success: true }
        }

        // Ensure worktree exists and get the path (creates lazily if needed)
        this.state.worktreePath = await managerPool.ensureWorktree(assignment.featureManagerId)
        console.log(`[Orchestrator] Worktree path: ${this.state.worktreePath}`)
      }
    } catch (error) {
      console.error('[Orchestrator] Failed to assign feature to pool:', error)
      return { success: false, error: `Pool assignment failed: ${(error as Error).message}` }
    }

    // Log execution started
    await this.logEntry('info', 'Execution started')

    this.state.status = 'running'
    this.state.startedAt = new Date().toISOString()
    this.state.stoppedAt = null
    this.state.error = null

    this.addEvent('started')

    // Resume tasks that were in-progress when app restarted
    await this.resumeInProgressTasks()

    this.startLoop()
    return { success: true }
  }

  /**
   * Validate that git is ready for task execution.
   * Checks for initialized repo and at least one commit.
   */
  private async validateGitReady(): Promise<{ ready: boolean; error?: string }> {
    const gitManager = getGitManager()

    // Check if git manager is initialized
    if (!gitManager.isInitialized()) {
      return {
        ready: false,
        error: 'Git repository not initialized. Please ensure the project has a git repository with at least one commit.'
      }
    }

    // Check if there's at least one commit (required to create branches)
    try {
      const hasCommits = await gitManager.hasCommits()
      if (!hasCommits) {
        return {
          ready: false,
          error: 'Git repository has no commits. Please create an initial commit before running tasks.'
        }
      }
    } catch (error) {
      console.warn('[Orchestrator] Failed to check git commits:', error)
      // Continue anyway - let it fail later with a more specific error
    }

    return { ready: true }
  }

  /**
   * Log an entry directly to the feature's log file.
   * This replaces the harness agent's logging functionality.
   */
  private async logEntry(type: LogEntryType, content: string, taskId?: string): Promise<void> {
    if (!this.state.featureId) return

    const logService = getLogService()
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type,
      agent: 'orchestrator',
      content,
      taskId
    }
    await logService.appendEntry(this.state.featureId, entry)
  }

  /**
   * Pause execution (Stop button pressed).
   * Running tasks will complete their current operation.
   */
  pause(): { success: boolean; error?: string } {
    if (this.state.status !== 'running') {
      return { success: false, error: 'Execution not running' }
    }

    this.state.status = 'paused'
    this.state.stoppedAt = new Date().toISOString()
    this.stopLoop()

    this.addEvent('paused')
    return { success: true }
  }

  /**
   * Resume execution after pause.
   */
  resume(): { success: boolean; error?: string } {
    if (this.state.status !== 'paused') {
      return { success: false, error: 'Execution not paused' }
    }

    this.state.status = 'running'
    this.state.stoppedAt = null
    this.startLoop()

    this.addEvent('resumed')
    return { success: true }
  }

  /**
   * Stop execution and reset state.
   */
  stop(): { success: boolean; error?: string } {
    if (this.state.status === 'idle') {
      return { success: false, error: 'Execution not started' }
    }

    this.state.status = 'idle'
    this.state.stoppedAt = new Date().toISOString()
    this.stopLoop()
    this.assignments.clear()
    this.failedThisTick.clear()
    this.initFailureCounts.clear()
    this.singleTaskId = null // Clear single-task mode

    // Clear worktree state
    this.state.worktreeId = null
    this.state.worktreePath = null

    // Abort all running TaskControllers
    for (const controller of this.taskControllers.values()) {
      controller.abort()
    }
    this.taskControllers.clear()
    console.log('[Orchestrator] TaskControllers aborted and cleared')

    // Cleanup QA agents
    for (const agent of getAllQAAgents()) {
      agent.cleanup()
    }
    clearQAAgents()
    console.log('[Orchestrator] QA agents cleaned up')

    // Cleanup terminated agents from pool
    const pool = getAgentPool()
    const cleaned = pool.cleanup()
    if (cleaned > 0) {
      console.log(`[Orchestrator] Cleaned up ${cleaned} terminated agents from pool`)
    }

    // Clear log cache to ensure fresh loads next time
    if (this.state.featureId) {
      getLogService().clearCache(this.state.featureId)
    }

    // Reset task pools
    resetTaskPoolManager()

    this.addEvent('stopped')
    return { success: true }
  }

  /**
   * Start the execution loop.
   */
  private startLoop(): void {
    this.stopLoop() // Clear any existing interval
    console.log('[Orchestrator] Starting execution loop')
    this.loopInterval = setInterval(() => {
      this.tick().catch((err) => console.error('[Orchestrator] tick error:', err))
    }, this.TICK_INTERVAL_MS)
  }

  /**
   * Stop the execution loop.
   */
  private stopLoop(): void {
    if (this.loopInterval) {
      clearInterval(this.loopInterval)
      this.loopInterval = null
      console.log('[Orchestrator] Stopped execution loop')
    }
  }

  /**
   * Core execution tick - called every TICK_INTERVAL_MS while running.
   * In pool architecture:
   * - Tasks execute sequentially (1 at a time)
   * - When all tasks complete, feature transitions to needs_merging
   * - No per-task merge - feature-level merge handles all changes
   */
  private async tick(): Promise<void> {
    // Skip if not running
    if (this.state.status !== 'running') {
      this.stopLoop()
      return
    }

    // Clear per-tick failure tracking (allows retry next tick)
    this.failedThisTick.clear()

    // Check if all tasks are completed
    // If so, transition feature to completed
    if (this.checkAllTasksComplete()) {
      await this.transitionToCompleted()
      return
    }

    // Get ready tasks that can be assigned
    const { available, canAssign } = this.getNextTasks()

    // Check execution mode - in step mode, don't auto-assign tasks
    const stepMode = await this.isStepMode()

    // Assign agents to available tasks (only in auto mode, and not in single-task mode)
    // Single-task mode is used when user manually starts one specific task
    if (!stepMode && !this.singleTaskId && available.length > 0 && canAssign > 0) {
      const tasksToAssign = available.slice(0, canAssign)
      for (const task of tasksToAssign) {
        await this.assignAgentToTask(task)
      }
    }

    // Note: processPendingIntentions() removed - TaskController handles its own
    // iteration cycle without the intention-approval workflow

    // Handle completed task agents (legacy DevAgent path, kept for compatibility)
    await this.handleCompletedTasks()

    // Handle QA reviews (pool architecture skips per-task merge)
    await this.handleQATasks()

    // Emit tick event for UI updates
    this.addEvent('tick', {
      availableCount: available.length,
      canAssign
    })
  }

  /**
   * Transition feature to completed when all tasks complete.
   * Handles completion actions (auto_merge, auto_pr, manual).
   */
  private async transitionToCompleted(): Promise<void> {
    if (!this.state.featureId) return

    console.log(`[Orchestrator] All tasks complete for feature ${this.state.featureId}, transitioning to completed`)

    // Stop the execution loop
    this.state.status = 'completed'
    this.state.stoppedAt = new Date().toISOString()
    this.stopLoop()

    // Update feature status to completed
    const featureStore = getFeatureStore()
    if (!featureStore) {
      console.error(`[Orchestrator] FeatureStore not available for completion transition`)
      this.addEvent('error', { error: 'FeatureStore not available' })
      return
    }
    const feature = await featureStore.loadFeature(this.state.featureId)
    const currentStatus = feature?.status

    try {
      if (currentStatus === 'archived' || currentStatus === 'merging') {
        // Already in terminal/merging state, just log and continue
        console.log(`[Orchestrator] Feature ${this.state.featureId} already in ${currentStatus} status`)
      } else if (currentStatus === 'active') {
        // Transition to merging - user must manually archive
        const statusManager = getFeatureStatusManager()
        await statusManager.updateFeatureStatus(this.state.featureId, 'merging')
        console.log(`[Orchestrator] Feature ${this.state.featureId} status updated to merging (all tasks done)`)
      }

      // Emit event for UI
      this.emit('feature_completed', {
        featureId: this.state.featureId,
        worktreeId: this.state.worktreeId,
        worktreePath: this.state.worktreePath
      })

      // Check completionAction to determine what to do next
      // - auto_merge: Merge to target branch → then transition to archived
      // - auto_pr: Push branch and create PR (no merge) → then transition to archived
      // - manual: Stay in completed, wait for user action
      const completionAction = feature?.completionAction || 'manual'

      if (completionAction === 'auto_merge' && feature) {
        console.log(`[Orchestrator] Feature ${this.state.featureId} has auto_merge - executing merge`)
        await this.executeAutoMerge(feature)
      } else if (completionAction === 'auto_pr' && feature) {
        // Create PR directly without merging - push manager branch and open PR
        console.log(`[Orchestrator] Feature ${this.state.featureId} has auto_pr - creating PR without merge`)
        await this.executeAutoPR(feature)
      } else {
        // Manual: stay in completed, user needs to take action
        console.log(`[Orchestrator] Feature ${this.state.featureId} has manual completion action - awaiting user action`)
      }
    } catch (error) {
      console.error(`[Orchestrator] Failed to transition feature to completed:`, error)
      this.addEvent('error', { error: (error as Error).message })
    }

    this.addEvent('completed')
  }

  /**
   * Handle completed dev agents - update orchestrator state and cleanup.
   * Note: This handles legacy DevAgent paths. TaskController manages its own completion.
   */
  private async handleCompletedTasks(): Promise<void> {
    const devAgents = getAllDevAgents()

    for (const agent of devAgents) {
      const agentState = agent.getState()

      // Check for 'completed' status - task has finished dev work and committed, ready for QA
      if (agentState.status === 'completed') {
        const taskId = agentState.taskId
        console.log('[Orchestrator] Task dev complete, moving to QA:', taskId)

        // Transition task: dev → qa
        const codeResult = this.completeTaskCode(taskId)
        if (codeResult.success) {
          console.log('[Orchestrator] Task moved to QA state:', taskId)
          // QA agent will be spawned by handleQATasks
        }

        // Log task completion
        await this.logEntry('task_completed', `Task ${taskId} dev complete`, taskId)

        // Cleanup dev agent (but keep worktree for QA!)
        // Note: Don't call agent.cleanup() here - QA needs the worktree
        await agent.markCompleted()
        removeDevAgent(taskId)

        this.addEvent('task_started', { taskId }) // Dev complete, now in QA
      } else if (agentState.status === 'failed') {
        const taskId = agentState.taskId
        const errorMsg = agentState.error || 'Unknown error'
        console.log('[Orchestrator] Handling failed task:', taskId, 'error:', errorMsg)

        // Mark task as failed in orchestrator
        this.failTask(taskId, errorMsg)

        // Log task failure
        await this.logEntry('task_failed', `Task ${taskId} failed: ${errorMsg}`, taskId)

        // Cleanup agent
        await agent.cleanup()
        removeDevAgent(taskId)

        this.addEvent('task_failed', { taskId, error: errorMsg })
      }
    }
  }

  /**
   * Handle QA reviews for tasks in verifying state.
   * Spawns QA agents to review code changes.
   */
  private async handleQATasks(): Promise<void> {
    if (!this.state.featureId || !this.state.graph) {
      return
    }

    // Query graph directly for tasks in 'verifying' status (pool manager is stubbed)
    const qaTasks = this.state.graph.nodes
      .filter((t) => t.status === 'verifying')
      .map((t) => t.id)

    // Load feature spec once for all QA tasks in this feature
    const contextService = getContextService()
    const projectRoot = contextService?.getProjectRoot() || process.cwd()
    const specStore = getFeatureSpecStore(projectRoot)
    const featureSpec = await specStore.loadSpec(this.state.featureId)

    for (const taskId of qaTasks) {
      // Skip if QA agent already exists for this task
      if (getQAAgent(taskId)) continue

      const task = this.state.graph.nodes.find((n) => n.id === taskId)
      if (!task) continue

      // Use worktree path - all tasks execute in the same worktree
      let worktreePath = this.state.worktreePath

      if (!worktreePath) {
        // Fallback: try dev agent (legacy path)
        const devAgent = getDevAgent(taskId)
        worktreePath = devAgent?.getState().worktreePath || null
      }

      if (!worktreePath) {
        console.error(`[Orchestrator] No worktree path available for QA task ${taskId}`)
        continue
      }

      // Spawn QA agent with feature spec for spec-aware review
      const qaAgent = createQAAgent(this.state.featureId, taskId)
      const initialized = await qaAgent.initialize(
        task.title,
        task.spec,
        worktreePath,
        featureSpec || undefined
      )

      if (initialized) {
        registerQAAgent(qaAgent)
        console.log(`[Orchestrator] QA agent spawned for task ${taskId}`)

        // Execute review (non-blocking)
        qaAgent.execute().then((result) => this.handleQAResult(taskId, result))
      } else {
        console.warn(`[Orchestrator] Failed to initialize QA agent for task ${taskId}`)
      }
    }
  }

  /**
   * Handle QA review result.
   * On pass: mark task completed (changes are committed to worktree branch)
   * On fail: store feedback and transition back to dev
   */
  private handleQAResult(taskId: string, result: QAReviewResult): void {
    if (!this.state.graph) return

    const task = this.state.graph.nodes.find((n) => n.id === taskId)
    if (!task) return

    console.log(`[Orchestrator] QA result for ${taskId}: ${result.passed ? 'PASSED' : 'FAILED'}`)
    if (result.passed && result.commitHash) {
      console.log(`[Orchestrator] QA passed for ${taskId}, commit: ${result.commitHash}`)
    }

    const taskPoolManager = getTaskPoolManager()

    if (result.passed) {
      // QA passed → mark task completed directly
      // Changes are committed to worktree branch, feature-level merge happens later
      const transitionResult = transitionTask(task, 'QA_PASSED')
      if (transitionResult.success) {
        // Store commit hash on the task
        if (result.commitHash) {
          task.commitHash = result.commitHash
        }

        taskPoolManager.moveTask(taskId, 'verifying', 'done')
        this.history.push(createStateChangeRecord(taskId, 'verifying', 'done', 'QA_PASSED'))
        this.assignments.delete(taskId)

        console.log(`[Orchestrator] Task ${taskId} completed`)
        this.addEvent('qa_passed', { taskId })
        this.addEvent('task_completed', { taskId })

        // Clear single-task mode if this was the single task
        if (this.singleTaskId === taskId) {
          console.log(`[Orchestrator] Single task ${taskId} completed, exiting single-task mode`)
          this.singleTaskId = null
        }

        // Cascade to unblock dependents
        const cascade = cascadeTaskCompletion(taskId, this.state.graph)
        this.history.push(...cascade.changes)
        for (const change of cascade.changes) {
          taskPoolManager.moveTask(change.taskId, change.previousStatus, change.newStatus)
        }
      }

      // Update feature status
      this.updateFeatureStatus()
    } else {
      // QA failed → store feedback and move back to ready for dev rework
      task.qaFeedback = result.feedback
      const transitionResult = transitionTask(task, 'QA_FAILED')
      if (transitionResult.success) {
        // Move task to new status (ready for rework)
        taskPoolManager.moveTask(taskId, transitionResult.previousStatus, transitionResult.newStatus)
        this.history.push(createStateChangeRecord(taskId, transitionResult.previousStatus, transitionResult.newStatus, 'QA_FAILED'))
        this.addEvent('qa_failed', { taskId, feedback: result.feedback })
        console.log(`[Orchestrator] Task ${taskId} transitioned ${transitionResult.previousStatus} -> ${transitionResult.newStatus} with QA feedback: ${result.feedback}`)

        // Clear assignment so task can be re-assigned for dev rework
        this.assignments.delete(taskId)

        // Clear single-task mode if this was the single task
        if (this.singleTaskId === taskId) {
          console.log(`[Orchestrator] Single task ${taskId} QA failed, exiting single-task mode`)
          this.singleTaskId = null
        }

        // Update feature status
        this.updateFeatureStatus()
      }
    }

    // Cleanup QA agent
    const qaAgent = getQAAgent(taskId)
    if (qaAgent) {
      qaAgent.cleanup()
      removeQAAgent(taskId)
    }
  }

  /**
   * Assign an agent to a task - creates TaskController for Ralph Loop execution.
   * In pool architecture, uses pool worktree path instead of creating task worktree.
   */
  private async assignAgentToTask(task: Task): Promise<void> {
    if (!this.state.featureId || !this.state.graph) {
      console.error('[Orchestrator] Cannot assign: no feature/graph')
      return
    }

    // Require worktree path
    if (!this.state.worktreePath) {
      console.error('[Orchestrator] Cannot assign: no worktree path')
      return
    }

    try {
      // Load feature for goal (include description for fuller context)
      const featureStore = getFeatureStore()
      const feature = featureStore ? await featureStore.loadFeature(this.state.featureId) : null
      let featureGoal = feature?.name || 'Complete tasks'
      if (feature?.description) {
        featureGoal += `\n\n${feature.description}`
      }

      // Load CLAUDE.md (may not exist)
      let claudeMd: string | undefined
      const contextService = getContextService()
      if (contextService) {
        claudeMd = (await contextService.getClaudeMd()) || undefined
      }

      // Get project root from context service
      const projectRoot = contextService?.getProjectRoot() || process.cwd()

      // Create TaskController with loop config from orchestrator config
      // Pass worktree path for use instead of creating task worktree
      const controller = createTaskController(
        this.state.featureId,
        task.id,
        projectRoot,
        {
          maxIterations: this.config.maxIterations ?? 10,
          runBuild: this.config.runBuild ?? true,
          runLint: this.config.runLint ?? true,
          runTests: this.config.runTests ?? false,
          continueOnLintFail: this.config.continueOnLintFail ?? true,
          worktreePath: this.state.worktreePath // Worktree path
        }
      )

      // Track controller
      this.taskControllers.set(task.id, controller)

      // Subscribe to events
      controller.on('loop:start', () => {
        console.log(`[Orchestrator] Task ${task.id} loop started`)
      })

      controller.on('iteration:complete', (result) => {
        console.log(`[Orchestrator] Task ${task.id} iteration ${result.iteration} complete`)
        this.emit('task_loop_update', this.getLoopStatus(task.id))
      })

      controller.on('loop:complete', async (state: TaskControllerState) => {
        console.log(`[Orchestrator] Task ${task.id} loop complete: ${state.exitReason}`)
        await this.handleControllerComplete(task.id, state)
      })

      // Update orchestrator state
      const result = this.assignTask(task.id, `controller-${task.id}`)
      if (result.success) {
        console.log('[Orchestrator] Assigned TaskController to task:', task.id)
        this.addEvent('agent_assigned', { taskId: task.id, agentId: `controller-${task.id}` })

        // Start the loop (non-blocking)
        console.log(`[Orchestrator] Starting TaskController for task ${task.id} in worktree ${this.state.worktreePath}`)
        controller.start(task, this.state.graph!, claudeMd, featureGoal)
          .catch(err => console.error(`[Orchestrator] TaskController error for ${task.id}:`, err))
      } else {
        console.error(`[Orchestrator] Failed to assign task ${task.id}: ${result.error}`)
      }
    } catch (error) {
      console.error('[Orchestrator] Error assigning TaskController:', error)
    }
  }

  /**
   * Resume tasks that were in 'developing' or 'verifying' state when app restarted.
   * Creates TaskControllers for any tasks that don't have one.
   * Respects singleTaskId - if set, only resumes that specific task.
   */
  private async resumeInProgressTasks(): Promise<void> {
    console.log(`[Orchestrator] resumeInProgressTasks called`)
    console.log(`[Orchestrator] State check - graph: ${!!this.state.graph}, featureId: ${this.state.featureId}, worktreePath: ${this.state.worktreePath}, singleTaskId: ${this.singleTaskId}`)

    if (!this.state.graph || !this.state.featureId || !this.state.worktreePath) {
      console.log(`[Orchestrator] resumeInProgressTasks: missing required state, skipping`)
      return
    }

    // Log all task statuses for debugging
    console.log(`[Orchestrator] All tasks:`, this.state.graph.nodes.map(t => `${t.id}: ${t.status}`))

    // Find tasks in 'developing' or 'verifying' status that don't have a TaskController
    // Skip paused tasks - they should stay paused until user explicitly resumes
    // If singleTaskId is set, only resume that specific task (user manually started it)
    const inProgressTasks = this.state.graph.nodes.filter(
      (task) => {
        if (task.status !== 'developing' && task.status !== 'verifying') return false
        if (task.isPaused) return false
        if (this.taskControllers.has(task.id)) return false
        // In single-task mode, only resume the specified task
        if (this.singleTaskId && task.id !== this.singleTaskId) return false
        return true
      }
    )

    if (inProgressTasks.length === 0) {
      console.log(`[Orchestrator] No tasks in progress to resume`)
      return
    }

    console.log(`[Orchestrator] Resuming ${inProgressTasks.length} in-progress task(s)`)

    for (const task of inProgressTasks) {
      await this.resumeSingleTask(task)
    }
  }

  /**
   * Handle TaskController completion - transitions task based on loop result.
   */
  private async handleControllerComplete(
    taskId: string,
    state: TaskControllerState
  ): Promise<void> {
    // Build final status before removing controller
    const finalStatus: TaskLoopStatus = {
      taskId,
      status: state.exitReason === 'all_checks_passed' ? 'completed' : 'failed',
      currentIteration: state.currentIteration,
      maxIterations: state.maxIterations,
      worktreePath: state.worktreePath,
      checklistSnapshot: {},
      exitReason: state.exitReason,
      error: state.error
    }

    // Build checklist snapshot from last iteration
    if (state.iterationResults.length > 0) {
      const lastResult = state.iterationResults[state.iterationResults.length - 1]
      finalStatus.checklistSnapshot.implement = lastResult.devAgentSuccess ? 'pass' : 'fail'
      for (const vr of lastResult.verificationResults) {
        finalStatus.checklistSnapshot[vr.checkId] = vr.passed ? 'pass' : 'fail'
      }
    }

    // Remove from tracking
    this.taskControllers.delete(taskId)

    if (state.exitReason === 'all_checks_passed') {
      // Task successfully completed all verification
      // Now transition to QA (keeping existing QA flow)
      const codeResult = this.completeTaskCode(taskId)
      if (codeResult.success) {
        console.log('[Orchestrator] Task completed verification, moving to QA:', taskId)
        // handleQATasks will spawn QA agent in next tick
      }
    } else {
      // Task failed (max iterations, error, aborted)
      this.failTask(taskId, state.error || `Loop failed: ${state.exitReason}`)
    }

    this.emit('task_loop_update', finalStatus)
  }

  /**
   * Check if all tasks are complete.
   */
  private checkAllTasksComplete(): boolean {
    if (!this.state.graph || this.state.graph.nodes.length === 0) {
      return true // Empty graph is considered complete
    }
    return this.state.graph.nodes.every((n) => n.status === 'done')
  }

  /**
   * Get tasks that are ready for execution and can be assigned.
   * In pool architecture, returns max 1 task for sequential execution.
   */
  getNextTasks(): NextTasksResult {
    if (!this.state.graph) {
      return { ready: [], available: [], canAssign: 0 }
    }

    // Query graph directly for tasks in 'ready' status (pool manager is stubbed)
    // Also filter out blocked tasks
    const ready = this.state.graph.nodes.filter(
      (t) => t.status === 'ready' && !t.blocked
    )

    // Filter out already assigned tasks, tasks that failed this tick,
    // and tasks that exceeded max init retries
    const assignedIds = new Set(this.assignments.keys())
    const available = ready.filter((t) => {
      if (assignedIds.has(t.id)) return false
      if (this.failedThisTick.has(t.id)) return false
      const failCount = this.initFailureCounts.get(t.id) || 0
      if (failCount >= this.MAX_INIT_RETRIES) return false
      return true
    })

    // Sequential execution - max 1 task at a time
    // Check if any task is currently running (developing or verifying)
    const currentActive = this.state.graph.nodes.filter(
      (t) => t.status === 'developing' || t.status === 'verifying'
    ).length

    // Only allow 1 concurrent task in pool mode
    const canAssign = currentActive === 0 ? 1 : 0

    return { ready, available, canAssign }
  }

  /**
   * Assign a task to an agent (marks as running).
   */
  assignTask(taskId: string, agentId?: string): { success: boolean; error?: string } {
    if (!this.state.graph) {
      return { success: false, error: 'No graph loaded' }
    }

    if (this.state.status !== 'running') {
      return { success: false, error: 'Execution not running' }
    }

    const task = this.state.graph.nodes.find((n) => n.id === taskId)
    if (!task) {
      return { success: false, error: 'Task not found' }
    }

    if (task.status !== 'ready') {
      return { success: false, error: `Task not ready_for_dev (status: ${task.status})` }
    }

    // Check concurrent limit
    const { canAssign } = this.getNextTasks()
    if (canAssign <= 0) {
      return { success: false, error: 'Maximum concurrent tasks reached' }
    }

    // Transition to running
    const result = transitionTask(task, 'AGENT_ASSIGNED')
    if (!result.success) {
      return { success: false, error: result.error }
    }

    // Update pools
    getTaskPoolManager().moveTask(taskId, result.previousStatus, result.newStatus)

    // Record assignment
    this.assignments.set(taskId, {
      taskId,
      assignedAt: new Date().toISOString(),
      agentId
    })

    this.history.push(
      createStateChangeRecord(taskId, result.previousStatus, result.newStatus, 'AGENT_ASSIGNED')
    )

    this.addEvent('task_started', { taskId })

    // Update feature status
    this.updateFeatureStatus()

    return { success: true }
  }

  /**
   * Mark a task as having completed its dev work (ready for QA).
   */
  completeTaskCode(taskId: string): { success: boolean; error?: string } {
    if (!this.state.graph) {
      return { success: false, error: 'No graph loaded' }
    }

    const task = this.state.graph.nodes.find((n) => n.id === taskId)
    if (!task) {
      return { success: false, error: 'Task not found' }
    }

    if (task.status !== 'developing') {
      return { success: false, error: `Task not in_progress (status: ${task.status})` }
    }

    const result = transitionTask(task, 'DEV_COMPLETE')
    if (!result.success) {
      return { success: false, error: result.error }
    }

    // Update pools
    getTaskPoolManager().moveTask(taskId, result.previousStatus, result.newStatus)

    this.history.push(
      createStateChangeRecord(taskId, result.previousStatus, result.newStatus, 'DEV_COMPLETE')
    )

    // Update feature status
    this.updateFeatureStatus()

    return { success: true }
  }

  /**
   * Mark a task as failed.
   */
  failTask(taskId: string, error?: string): { success: boolean; error?: string } {
    if (!this.state.graph) {
      return { success: false, error: 'No graph loaded' }
    }

    const task = this.state.graph.nodes.find((n) => n.id === taskId)
    if (!task) {
      return { success: false, error: 'Task not found' }
    }

    // Determine event based on context - MERGE_FAILED vs TASK_FAILED
    // Since we're in in_progress, use TASK_FAILED for general failures
    // MERGE_FAILED should only be used during merge operations (handled elsewhere)
    const event = 'TASK_FAILED'
    const result = transitionTask(task, event)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    // Note: Error messages are shown in loop status UI and session logs,
    // not stored on the task object

    // Update pools
    getTaskPoolManager().moveTask(taskId, result.previousStatus, result.newStatus)

    this.history.push(
      createStateChangeRecord(taskId, result.previousStatus, result.newStatus, event)
    )

    // Remove assignment
    this.assignments.delete(taskId)

    this.addEvent('task_failed', {
      taskId,
      error
    })

    // Update feature status
    this.updateFeatureStatus()

    return { success: true }
  }

  /**
   * Start a single task in step-by-step execution mode.
   * This starts the orchestrator if needed and executes just the specified task.
   * Does not automatically start other tasks when this one completes.
   */
  async startSingleTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.state.graph || !this.state.featureId) {
      return { success: false, error: 'No graph loaded' }
    }

    const task = this.state.graph.nodes.find((n) => n.id === taskId)
    if (!task) {
      return { success: false, error: 'Task not found' }
    }

    // Check if task is already being worked on (has a controller)
    if (this.taskControllers.has(taskId)) {
      return { success: false, error: 'Task already has an active agent' }
    }

    // Allow 'ready' (new start), 'developing' (resume dev), and 'verifying' (resume QA)
    if (task.status !== 'ready' && task.status !== 'developing' && task.status !== 'verifying') {
      return { success: false, error: `Task not ready for work (status: ${task.status})` }
    }

    console.log(`[Orchestrator] Starting single task: ${taskId} (status: ${task.status})`)

    // Set to step mode - user is manually controlling task execution
    await this.setExecutionMode('step')

    // Enable single-task mode BEFORE starting orchestrator - prevents auto-assignment of other tasks
    // This must be set before start() to avoid race condition where tick() runs before singleTaskId is set
    this.singleTaskId = taskId

    // If orchestrator not running, start it first (tick won't auto-assign due to singleTaskId)
    if (this.state.status !== 'running') {
      const startResult = await this.start()
      if (!startResult.success) {
        this.singleTaskId = null // Clear on failure
        return startResult
      }
    }

    // For tasks in 'developing' or 'verifying' status, resume without status transition
    if (task.status === 'developing' || task.status === 'verifying') {
      const resumeResult = await this.resumeSingleTask(task)
      if (!resumeResult.success) {
        this.singleTaskId = null // Clear single-task mode on failure
        return resumeResult
      }
    } else {
      // For 'ready' tasks, use normal assignment flow
      await this.assignAgentToTask(task)
    }

    return { success: true }
  }

  /**
   * Resume a single task that's already in 'developing' or 'verifying' status.
   * Creates a TaskController without transitioning status.
   * Returns error if stash has merge conflicts.
   */
  private async resumeSingleTask(task: Task): Promise<{ success: boolean; error?: string }> {
    if (!this.state.featureId || !this.state.graph || !this.state.worktreePath) {
      console.error('[Orchestrator] Cannot resume: missing required state')
      return { success: false, error: 'Missing required state' }
    }

    // Unstash changes if task has a stash
    if (task.stashId && this.state.worktreePath) {
      try {
        const { simpleGit } = await import('simple-git')
        const git = simpleGit({ baseDir: this.state.worktreePath })

        // Find the stash for this task by message
        const stashList = await git.stashList()
        const stashMessage = `dagent-pause:${task.id}`
        const stashIndex = stashList.all.findIndex(s => s.message.includes(stashMessage))

        if (stashIndex >= 0) {
          // Use apply (not pop) so we can keep stash on conflict
          await git.stash(['apply', `stash@{${stashIndex}}`])
          // Apply succeeded - now drop the stash
          await git.stash(['drop', `stash@{${stashIndex}}`])
          console.log(`[Orchestrator] Unstashed changes for task ${task.id}`)
          // Clear stash reference only on success
          task.stashId = undefined
        } else {
          console.log(`[Orchestrator] No stash found for task ${task.id}, may have been manually cleared`)
          task.stashId = undefined
        }
      } catch (error) {
        const errorMsg = (error as Error).message || 'Unknown error'
        console.error(`[Orchestrator] Failed to unstash changes for task ${task.id}:`, error)
        // Check if it's a merge conflict
        if (errorMsg.includes('conflict') || errorMsg.includes('CONFLICT')) {
          return {
            success: false,
            error: 'Stash has merge conflicts. Please resolve conflicts manually in the worktree before resuming.'
          }
        }
        // For other errors, keep stash and return error
        return {
          success: false,
          error: `Failed to unstash changes: ${errorMsg}`
        }
      }
    }

    // Clear paused flag when resuming
    task.isPaused = false

    // Save DAG immediately to persist cleared isPaused flag and stashId
    const featureStore = getFeatureStore()
    if (featureStore && this.state.graph) {
      await featureStore.saveDag(this.state.featureId, this.state.graph)
      // Emit graph_updated to notify UI of isPaused change
      this.emit('graph_updated', {
        featureId: this.state.featureId,
        graph: this.state.graph
      })

      // Add [RESUMED] message to session logs
      await featureStore.appendSessionMessage(this.state.featureId, task.id, {
        timestamp: new Date().toISOString(),
        direction: 'harness_to_task',
        type: 'progress',
        content: '[RESUMED] Task execution resumed'
      })
    }

    // Load context
    const feature = featureStore ? await featureStore.loadFeature(this.state.featureId) : null
    let featureGoal = feature?.name || 'Complete tasks'
    if (feature?.description) {
      featureGoal += `\n\n${feature.description}`
    }

    let claudeMd: string | undefined
    const contextService = getContextService()
    if (contextService) {
      claudeMd = (await contextService.getClaudeMd()) || undefined
    }
    const projectRoot = contextService?.getProjectRoot() || process.cwd()

    try {
      // Create TaskController
      const controller = createTaskController(
        this.state.featureId,
        task.id,
        projectRoot,
        {
          maxIterations: this.config.maxIterations ?? 10,
          runBuild: this.config.runBuild ?? true,
          runLint: this.config.runLint ?? true,
          runTests: this.config.runTests ?? false,
          continueOnLintFail: this.config.continueOnLintFail ?? true,
          worktreePath: this.state.worktreePath
        }
      )

      // Track controller
      this.taskControllers.set(task.id, controller)

      // Subscribe to events
      controller.on('loop:start', () => {
        console.log(`[Orchestrator] Resumed task ${task.id} loop started`)
      })

      controller.on('iteration:complete', (result) => {
        console.log(`[Orchestrator] Task ${task.id} iteration ${result.iteration} complete`)
        this.emit('task_loop_update', this.getLoopStatus(task.id))
      })

      controller.on('loop:complete', async (state: TaskControllerState) => {
        console.log(`[Orchestrator] Task ${task.id} loop complete: ${state.exitReason}`)
        await this.handleControllerComplete(task.id, state)
      })

      // Track assignment
      this.assignments.set(task.id, {
        taskId: task.id,
        agentId: `controller-${task.id}`,
        assignedAt: new Date().toISOString()
      })

      this.addEvent('agent_assigned', { taskId: task.id, agentId: `controller-${task.id}` })

      // Start the loop
      console.log(`[Orchestrator] Starting resumed TaskController for task ${task.id}`)
      controller.start(task, this.state.graph!, claudeMd, featureGoal)
        .catch(err => console.error(`[Orchestrator] TaskController error for resumed ${task.id}:`, err))

      return { success: true }
    } catch (error) {
      console.error(`[Orchestrator] Error resuming task ${task.id}:`, error)
      return { success: false, error: `Failed to resume task: ${(error as Error).message}` }
    }
  }

  /**
   * Check if the feature is in step-by-step execution mode.
   */
  private async isStepMode(): Promise<boolean> {
    if (!this.state.featureId) return false

    const featureStore = getFeatureStore()
    if (!featureStore) return false

    const feature = await featureStore.loadFeature(this.state.featureId)
    return feature?.executionMode === 'step'
  }

  /**
   * Set the feature's execution mode.
   */
  private async setExecutionMode(mode: 'auto' | 'step'): Promise<void> {
    if (!this.state.featureId) return

    const featureStore = getFeatureStore()
    if (!featureStore) return

    const feature = await featureStore.loadFeature(this.state.featureId)
    if (feature && feature.executionMode !== mode) {
      feature.executionMode = mode
      await featureStore.saveFeature(feature)
      console.log(`[Orchestrator] Execution mode changed to '${mode}' for feature ${this.state.featureId}`)
    }
  }

  /**
   * Get current execution state.
   */
  getState(): ExecutionState {
    return { ...this.state }
  }

  /**
   * Get current configuration.
   */
  getConfig(): ExecutionConfig {
    return { ...this.config }
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<ExecutionConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get full execution snapshot.
   */
  getSnapshot(): ExecutionSnapshot {
    return {
      state: this.getState(),
      assignments: Array.from(this.assignments.values()),
      history: [...this.history],
      events: [...this.events]
    }
  }

  /**
   * Get loop status for a specific task.
   */
  getLoopStatus(taskId: string): TaskLoopStatus | null {
    const controller = this.taskControllers.get(taskId)
    if (!controller) return null

    const state = controller.getState()

    // Get checklist snapshot from the last iteration result
    let checklistSnapshot: Record<string, 'pending' | 'pass' | 'fail' | 'skipped'> = {}
    if (state.iterationResults.length > 0) {
      const lastResult = state.iterationResults[state.iterationResults.length - 1]
      // Build snapshot from verification results
      checklistSnapshot.implement = lastResult.devAgentSuccess ? 'pass' : 'fail'
      for (const vr of lastResult.verificationResults) {
        checklistSnapshot[vr.checkId] = vr.passed ? 'pass' : 'fail'
      }
    }

    return {
      taskId,
      status: state.status,
      currentIteration: state.currentIteration,
      maxIterations: state.maxIterations,
      worktreePath: state.worktreePath,
      checklistSnapshot,
      exitReason: state.exitReason,
      error: state.error
    }
  }

  /**
   * Get loop statuses for all running TaskControllers.
   */
  getAllLoopStatuses(): TaskLoopStatus[] {
    const statuses: TaskLoopStatus[] = []
    for (const taskId of this.taskControllers.keys()) {
      const status = this.getLoopStatus(taskId)
      if (status) statuses.push(status)
    }
    return statuses
  }

  /**
   * Abort a task's iteration loop and return task to ready status.
   */
  async abortLoop(taskId: string): Promise<{ success: boolean; error?: string }> {
    const controller = this.taskControllers.get(taskId)
    if (!controller) {
      // Check if task exists and provide helpful message
      const task = this.state.graph?.nodes.find((n) => n.id === taskId)
      if (task) {
        if (task.status === 'ready') {
          return { success: false, error: 'Task is not running. Click Start to begin development.' }
        } else if (task.status === 'done') {
          return { success: false, error: 'Task is already completed.' }
        } else if (task.status === 'verifying') {
          // QA is running but there's no TaskController - QA agent handles its own execution
          return { success: false, error: 'QA review is in progress. Wait for it to complete.' }
        }
      }
      return { success: false, error: 'No active work to pause for this task.' }
    }

    // Get status before aborting (abort may trigger cleanup that removes controller)
    const state = controller.getState()
    controller.abort()
    console.log(`[Orchestrator] Aborted loop for task ${taskId}`)

    // Remove controller from tracking
    this.taskControllers.delete(taskId)

    // Build and emit aborted status FIRST (before UI updates)
    const abortedStatus: TaskLoopStatus = {
      taskId,
      status: 'aborted',
      currentIteration: state.currentIteration,
      maxIterations: state.maxIterations,
      worktreePath: state.worktreePath,
      checklistSnapshot: {},
      exitReason: 'aborted',
      error: null
    }
    this.emit('task_loop_update', abortedStatus)

    // Set isPaused flag and stash changes
    if (this.state.graph && this.state.featureId) {
      const task = this.state.graph.nodes.find((n) => n.id === taskId)
      if (task) {
        task.isPaused = true

        // Stash any uncommitted changes
        if (this.state.worktreePath) {
          try {
            const { simpleGit } = await import('simple-git')
            const git = simpleGit({ baseDir: this.state.worktreePath })

            // Check if there are changes to stash
            const status = await git.status()
            const hasChanges = !status.isClean()

            if (hasChanges) {
              // Create a stash with task ID as message for easy identification
              const stashMessage = `dagent-pause:${taskId}`
              await git.stash(['push', '-m', stashMessage, '--include-untracked'])

              // Get the stash reference (stash@{0} after we just pushed)
              const stashList = await git.stashList()
              if (stashList.all.length > 0) {
                task.stashId = 'stash@{0}'
                console.log(`[Orchestrator] Stashed changes for task ${taskId}`)
              }
            } else {
              console.log(`[Orchestrator] No changes to stash for task ${taskId}`)
            }
          } catch (error) {
            console.error(`[Orchestrator] Failed to stash changes for task ${taskId}:`, error)
            // Don't fail the pause operation, just log the error
          }
        }

        console.log(`[Orchestrator] Task ${taskId} paused (status: ${task.status}, isPaused: true, stashId: ${task.stashId || 'none'})`)

        // Add [PAUSED] message to session logs
        const featureStore = getFeatureStore()
        if (featureStore) {
          const stashInfo = task.stashId ? ' Changes have been stashed.' : ''
          await featureStore.appendSessionMessage(this.state.featureId, taskId, {
            timestamp: new Date().toISOString(),
            direction: 'harness_to_task',
            type: 'progress',
            content: `[PAUSED] Task execution paused by user.${stashInfo}`
          })
        }

        // Clear assignment
        this.assignments.delete(taskId)

        // Switch to step mode when user pauses a task
        // This prevents auto-assignment of other tasks while user is debugging
        await this.setExecutionMode('step')

        // Save DAG and emit update
        this.updateFeatureStatus()
      }
    }

    // Clear single-task mode if this was the single task
    if (this.singleTaskId === taskId) {
      console.log(`[Orchestrator] Single task ${taskId} aborted, exiting single-task mode`)
      this.singleTaskId = null
    }

    return { success: true }
  }

  /**
   * Abort a paused task - drop stashed changes and reset to ready status.
   * This discards the stashed changes that were saved when the task was paused.
   */
  async abortTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.state.graph || !this.state.featureId) {
      return { success: false, error: 'No graph or feature loaded' }
    }

    const task = this.state.graph.nodes.find((n) => n.id === taskId)
    if (!task) {
      return { success: false, error: 'Task not found' }
    }

    // Only allow aborting paused tasks
    if (!task.isPaused) {
      return { success: false, error: 'Task is not paused. Pause the task first before aborting.' }
    }

    // Drop the stash if one exists
    if (task.stashId && this.state.worktreePath) {
      try {
        const { simpleGit } = await import('simple-git')
        const git = simpleGit({ baseDir: this.state.worktreePath })

        // Find and drop the stash for this task
        const stashList = await git.stashList()
        const stashMessage = `dagent-pause:${taskId}`
        const stashIndex = stashList.all.findIndex(s => s.message.includes(stashMessage))

        if (stashIndex >= 0) {
          await git.stash(['drop', `stash@{${stashIndex}}`])
          console.log(`[Orchestrator] Dropped stash for task ${taskId}`)
        } else {
          console.log(`[Orchestrator] No stash found for task ${taskId}, may have been manually cleared`)
        }
      } catch (error) {
        console.error(`[Orchestrator] Failed to drop stash for task ${taskId}:`, error)
        // Don't fail - the stash might have been manually dropped
      }
    }

    // Reset task status to ready
    task.status = 'ready'
    task.isPaused = false
    task.stashId = undefined // Clear stash reference
    task.qaFeedback = undefined // Clear any QA feedback
    task.commitHash = undefined // Clear commit hash

    // Add [ABORTED] message to session logs
    const featureStore = getFeatureStore()
    if (featureStore) {
      await featureStore.appendSessionMessage(this.state.featureId, taskId, {
        timestamp: new Date().toISOString(),
        direction: 'harness_to_task',
        type: 'progress',
        content: '[ABORTED] Task aborted - stashed changes discarded, reset to Ready'
      })
    }

    console.log(`[Orchestrator] Task ${taskId} aborted and reset to ready`)

    // Save DAG and emit update
    this.updateFeatureStatus()

    return { success: true }
  }

  /**
   * Update feature status based on current task states.
   * Persists DAG graph and feature status to storage, emits events.
   */
  private async updateFeatureStatus(): Promise<void> {
    if (!this.state.featureId || !this.state.graph) {
      return
    }

    const featureStore = getFeatureStore()
    if (!featureStore) {
      return
    }

    // Always save the DAG graph to persist task status changes
    const taskStatuses = this.state.graph.nodes.map(n => `${n.id}:${n.status}`).join(', ')
    console.log(`[Orchestrator] Saving DAG with task statuses: ${taskStatuses}`)
    await featureStore.saveDag(this.state.featureId, this.state.graph)
    console.log(`[Orchestrator] DAG saved successfully`)

    // Emit graph_updated event for UI to refresh
    this.emit('graph_updated', {
      featureId: this.state.featureId,
      graph: this.state.graph
    })

    const newStatus = computeFeatureStatus(this.state.graph.nodes)

    // Only update feature if status actually changed
    if (newStatus !== this.currentFeatureStatus) {
      const feature = await featureStore.loadFeature(this.state.featureId)
      if (feature) {
        feature.status = newStatus
        feature.updatedAt = new Date().toISOString()
        await featureStore.saveFeature(feature)
        console.log(`[Orchestrator] Feature status changed: ${this.currentFeatureStatus} → ${newStatus}`)
      }

      // Emit event for internal listeners
      this.emit('feature_status_changed', {
        featureId: this.state.featureId,
        status: newStatus,
        previousStatus: this.currentFeatureStatus
      })

      // Broadcast to renderer for UI updates
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('feature:status-changed', { featureId: this.state.featureId, status: newStatus })
        }
      }

      // Handle feature archived - stop orchestrator
      if (newStatus === 'archived') {
        await this.handleFeatureArchived()
        // Trigger completion action when feature is archived (after merge)
        if (feature) {
          await this.handleFeatureCompleted(feature)
        }
      }

      this.currentFeatureStatus = newStatus
    }
  }

  /**
   * Handle feature completion - trigger configured completion action.
   * Called when feature transitions to archived status (after merge).
   */
  private async handleFeatureCompleted(feature: { id: string; name: string; branch?: string; completionAction?: string; worktreeId?: WorktreeId; targetBranch?: string }): Promise<void> {
    const completionAction = feature.completionAction || 'manual'

    if (completionAction === 'manual') {
      console.log(`[Orchestrator] Feature ${feature.id} completed - manual action configured, no auto-trigger`)
      return
    }

    console.log(`[Orchestrator] Feature ${feature.id} completed - triggering ${completionAction}`)

    // Emit event for UI notification
    this.emit('completion_action_started', {
      featureId: feature.id,
      action: completionAction
    })

    try {
      if (completionAction === 'auto_merge') {
        await this.executeAutoMerge(feature)
      } else if (completionAction === 'auto_pr') {
        await this.executeAutoPR(feature)
      }
    } catch (error) {
      console.error(`[Orchestrator] Completion action ${completionAction} failed for feature ${feature.id}:`, error)
      this.emit('completion_action_failed', {
        featureId: feature.id,
        action: completionAction,
        error: (error as Error).message
      })
    }
  }

  /**
   * Execute auto_merge completion action.
   * Creates FeatureMergeAgent and performs direct merge to current branch.
   */
  private async executeAutoMerge(feature: { id: string; branch?: string }): Promise<void> {
    console.log(`[Orchestrator] Executing auto_merge for feature ${feature.id}`)

    const gitManager = getGitManager()
    const targetBranch = await gitManager.getCurrentBranch() || await gitManager.getDefaultBranch()
    const sourceBranch = feature.branch || `dagent/${feature.id}`

    // Check for uncommitted changes and stash them if present
    let stashed = false
    try {
      const statusResult = await gitManager.getStatus()
      const statusData = statusResult.data as { isClean?: boolean } | undefined
      if (statusResult.success && statusData && !statusData.isClean) {
        console.log(`[Orchestrator] Stashing uncommitted changes before auto_merge`)
        const stashResult = await gitManager.stash(`auto_merge_${feature.id}_${Date.now()}`)
        if (stashResult.success) {
          stashed = true
        } else {
          console.warn(`[Orchestrator] Failed to stash changes: ${stashResult.error}`)
        }
      }
    } catch (stashError) {
      console.warn(`[Orchestrator] Could not check/stash changes:`, stashError)
      // Continue anyway - the merge will fail with a clear message if needed
    }

    // Create and initialize merge agent
    const agent = createFeatureMergeAgent(feature.id, targetBranch, sourceBranch)
    const initialized = await agent.initialize()

    if (!initialized) {
      // Pop stash if we stashed
      if (stashed) {
        try {
          await gitManager.stashPop()
        } catch { /* ignore */ }
      }
      throw new Error(`Failed to initialize merge agent: ${agent.getState().error}`)
    }

    registerFeatureMergeAgent(agent)

    try {
      // Check branches
      const branchesOk = await agent.checkBranches()
      if (!branchesOk) {
        throw new Error(`Branch check failed: ${agent.getState().error}`)
      }

      // Auto-approve and execute merge
      agent.receiveApproval({ approved: true, type: 'approved' })
      const result = await agent.executeMerge(true) // Delete branch on success

      if (!result.success || !result.merged) {
        if (result.conflicts && result.conflicts.length > 0) {
          throw new Error(`Merge conflicts in ${result.conflicts.length} files: ${result.conflicts.join(', ')}`)
        }
        throw new Error(result.error || 'Merge failed')
      }

      console.log(`[Orchestrator] Auto merge completed successfully for feature ${feature.id}`)
      // Feature stays in 'merging' status - user must manually archive

      this.emit('completion_action_completed', {
        featureId: feature.id,
        action: 'auto_merge',
        result: { merged: true, branchDeleted: result.branchDeleted }
      })
    } finally {
      // Cleanup agent
      await agent.cleanup()
      removeFeatureMergeAgent(feature.id)

      // Pop stash if we stashed
      if (stashed) {
        try {
          console.log(`[Orchestrator] Restoring stashed changes after auto_merge`)
          await gitManager.stashPop()
        } catch (popError) {
          console.warn(`[Orchestrator] Could not restore stashed changes:`, popError)
        }
      }
    }
  }

  /**
   * Execute auto_pr completion action.
   * Creates a pull request using GitHub CLI to current branch.
   */
  private async executeAutoPR(feature: { id: string; name: string; branch?: string; worktreeId?: WorktreeId }): Promise<void> {
    console.log(`[Orchestrator] Executing auto_pr for feature ${feature.id}`)

    const prService = getPRService()

    // Check gh CLI status first
    const ghStatus = await prService.checkGhCli()
    if (!ghStatus.installed) {
      throw new Error('GitHub CLI (gh) is not installed. Please install it to use Auto PR.')
    }
    if (!ghStatus.authenticated) {
      throw new Error('GitHub CLI is not authenticated. Run: gh auth login')
    }

    // Determine the actual branch to use for PR
    const gitManager = getGitManager()
    const baseBranch = await gitManager.getCurrentBranch() || 'main'
    const headBranch = feature.branch || `dagent/${feature.worktreeId || 'neon'}`
    console.log(`[Orchestrator] Using branch ${headBranch} for feature ${feature.id}`)

    // Push the branch to remote before creating PR
    if (gitManager) {
      console.log(`[Orchestrator] Pushing branch ${headBranch} to origin`)
      const pushResult = await gitManager.pushBranch(headBranch)
      if (!pushResult.success) {
        throw new Error(`Failed to push branch: ${pushResult.error}`)
      }
    }

    // Create PR
    const result = await prService.createPullRequest({
      title: feature.name,
      body: `## Summary\n\nAutomatically generated PR for feature: ${feature.name}\n\n---\n*Created by DAGent Auto PR*`,
      head: headBranch,
      base: baseBranch,
      featureId: feature.id
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to create pull request')
    }

    console.log(`[Orchestrator] Auto PR created successfully for feature ${feature.id}: ${result.htmlUrl || result.prUrl}`)
    // Feature stays in 'merging' status - user must manually archive

    this.emit('completion_action_completed', {
      featureId: feature.id,
      action: 'auto_pr',
      result: { prNumber: result.prNumber, prUrl: result.htmlUrl || result.prUrl }
    })
  }

  /**
   * Handle feature archival - stop orchestrator and cleanup.
   * Called when feature transitions to archived status.
   */
  private async handleFeatureArchived(): Promise<void> {
    if (!this.state.featureId) return

    console.log(`[Orchestrator] Feature ${this.state.featureId} archived - stopping execution`)

    // Stop execution if running
    if (this.state.status === 'running') {
      this.stop()
    }

    // Emit event for UI updates
    this.emit('orchestrator:feature-archived', {
      featureId: this.state.featureId,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Add an execution event.
   */
  private addEvent(type: ExecutionEvent['type'], data?: ExecutionEvent['data']): void {
    this.events.push({
      type,
      timestamp: new Date().toISOString(),
      data
    })
  }
}

// Singleton instance for global access
let orchestratorInstance: ExecutionOrchestrator | null = null

export function getOrchestrator(): ExecutionOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new ExecutionOrchestrator()
  }
  return orchestratorInstance
}

export function resetOrchestrator(): void {
  orchestratorInstance = null
}
