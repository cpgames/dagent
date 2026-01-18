import { EventEmitter } from 'events'
import type { DAGGraph, Task } from '@shared/types'
import type { FeatureStatus } from '@shared/types/feature'
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
import { getTaskPoolManager, resetTaskPoolManager } from './task-pool'
import { getDevAgent, getAllDevAgents, removeDevAgent, getAgentPool } from '../agents'
import { getHarnessAgent, HarnessAgent } from '../agents/harness-agent'
import { createMergeAgent, registerMergeAgent, removeMergeAgent } from '../agents/merge-agent'
import { createFeatureMergeAgent, registerFeatureMergeAgent, removeFeatureMergeAgent } from '../agents/feature-merge-agent'
import { getPRService } from '../github'
import { getFeatureStatusManager } from '../ipc/feature-handlers'
import { createQAAgent, registerQAAgent, getQAAgent, removeQAAgent, getAllQAAgents, clearQAAgents } from '../agents/qa-agent'
import type { QAReviewResult } from '../agents/qa-types'
import type { HarnessMessage } from '../agents/harness-types'
import { getFeatureStore } from '../ipc/storage-handlers'
import { getContextService } from '../context'
import { getFeatureSpecStore } from '../agents/feature-spec-store'
import { getLogService } from '../storage/log-service'
import { getGitManager, getTaskWorktreeName } from '../git'
import { computeFeatureStatus } from './feature-status'
import * as path from 'path'

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
  private currentFeatureStatus: FeatureStatus = 'planning'
  // Track TaskController instances for Ralph Loop execution
  private taskControllers: Map<string, TaskController> = new Map()

  constructor(config: Partial<ExecutionConfig> = {}) {
    super()
    this.config = { ...DEFAULT_EXECUTION_CONFIG, ...config }
    this.state = {
      status: 'idle',
      featureId: null,
      graph: null,
      startedAt: null,
      stoppedAt: null,
      error: null
    }
    this.assignments = new Map()
    this.history = []
    this.events = []
    this.failedThisTick = new Set()
    this.initFailureCounts = new Map()
    this.currentFeatureStatus = 'planning'
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
   */
  async start(): Promise<{ success: boolean; error?: string }> {
    if (!this.state.graph || !this.state.featureId) {
      return { success: false, error: 'No graph loaded' }
    }

    if (this.state.status === 'running') {
      return { success: false, error: 'Execution already running' }
    }

    // Check if feature is archived - cannot start execution on archived features
    const featureStore = getFeatureStore()
    if (featureStore) {
      const feature = await featureStore.loadFeature(this.state.featureId)
      if (feature && feature.status === 'archived') {
        return { success: false, error: 'Cannot start execution on archived feature' }
      }
    }

    // Validate git repository is ready for execution
    const gitValidation = await this.validateGitReady()
    if (!gitValidation.ready) {
      return { success: false, error: gitValidation.error }
    }

    // Initialize harness agent before starting execution
    await this.initializeHarness()

    this.state.status = 'running'
    this.state.startedAt = new Date().toISOString()
    this.state.stoppedAt = null
    this.state.error = null

    this.addEvent('started')
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
   * Initialize harness agent for execution.
   */
  private async initializeHarness(): Promise<void> {
    if (!this.state.featureId || !this.state.graph) {
      return
    }

    // Load feature for goal
    const featureStore = getFeatureStore()
    const feature = featureStore ? await featureStore.loadFeature(this.state.featureId) : null
    const featureGoal = feature?.name || 'Complete tasks'

    // Load CLAUDE.md
    let claudeMd: string | undefined
    const contextService = getContextService()
    if (contextService) {
      claudeMd = (await contextService.getClaudeMd()) || undefined
    }

    // Get project root from context service
    const projectRoot = contextService?.getProjectRoot() || undefined

    // Reset harness and agent pool before initializing (clean slate for new execution)
    const harness = getHarnessAgent()
    harness.reset()
    const pool = getAgentPool()
    pool.cleanup() // Remove terminated agents
    console.log('[Orchestrator] Reset harness and cleaned up agent pool')

    // Initialize and start harness
    const initialized = await harness.initialize(
      this.state.featureId,
      featureGoal,
      this.state.graph,
      claudeMd,
      projectRoot
    )

    if (initialized) {
      // Subscribe to harness messages for real-time logging
      harness.on('harness:message', async (msg: HarnessMessage) => {
        const logService = getLogService()
        const entry = HarnessAgent.toLogEntry(msg)
        await logService.appendEntry(this.state.featureId!, entry)
      })

      // Note: Task completion and merge is handled by handleCompletedTasks() in the tick loop.
      // The harness 'task:completed' event is for notification only, not for triggering merge.

      harness.start()
      console.log('[Orchestrator] Harness agent initialized and started')
    } else {
      console.warn('[Orchestrator] Failed to initialize harness agent')
    }
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

    // Abort all running TaskControllers
    for (const controller of this.taskControllers.values()) {
      controller.abort()
    }
    this.taskControllers.clear()
    console.log('[Orchestrator] TaskControllers aborted and cleared')

    // Stop and reset harness agent
    const harness = getHarnessAgent()
    harness.stop()
    harness.reset()
    console.log('[Orchestrator] Harness agent stopped and reset')

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
   */
  private async tick(): Promise<void> {
    // Skip if not running
    if (this.state.status !== 'running') {
      this.stopLoop()
      return
    }

    // Clear per-tick failure tracking (allows retry next tick)
    this.failedThisTick.clear()

    // Check for completion
    if (this.checkAllTasksComplete()) {
      this.state.status = 'completed'
      this.state.stoppedAt = new Date().toISOString()
      this.addEvent('completed')
      this.stopLoop()
      return
    }

    // Get ready tasks that can be assigned
    const { available, canAssign } = this.getNextTasks()

    // Assign agents to available tasks
    if (available.length > 0 && canAssign > 0) {
      const tasksToAssign = available.slice(0, canAssign)
      for (const task of tasksToAssign) {
        await this.assignAgentToTask(task)
      }
    }

    // Note: processPendingIntentions() removed - TaskController handles its own
    // iteration cycle without the intention-approval workflow

    // Handle completed task agents (legacy DevAgent path, kept for compatibility)
    await this.handleCompletedTasks()

    // Handle QA reviews
    await this.handleQATasks()

    // Emit tick event for UI updates
    this.addEvent('tick', {
      availableCount: available.length,
      canAssign
    })
  }

  /**
   * Handle completed dev agents - update orchestrator state and cleanup.
   * Note: This handles legacy DevAgent paths. TaskController manages its own completion.
   */
  private async handleCompletedTasks(): Promise<void> {
    const devAgents = getAllDevAgents()
    const harness = getHarnessAgent()

    for (const agent of devAgents) {
      const agentState = agent.getState()

      // Check for ready_for_merge - task has finished dev work and committed, ready for QA
      if (agentState.status === 'ready_for_merge') {
        const taskId = agentState.taskId
        console.log('[Orchestrator] Task dev complete, moving to QA:', taskId)

        // Transition task: dev → qa (NOT merge - QA must pass first)
        const codeResult = this.completeTaskCode(taskId)
        if (codeResult.success) {
          console.log('[Orchestrator] Task moved to QA state:', taskId)
          // Don't merge yet - QA agent will be spawned by handleQATasks
          // When QA passes, handleQAResult will trigger the merge
        }

        // Notify harness that dev work is done
        harness.completeTask(taskId)

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

        // Notify harness
        harness.failTask(taskId, errorMsg)

        // Cleanup agent
        await agent.cleanup()
        removeDevAgent(taskId)

        this.addEvent('task_failed', { taskId, error: errorMsg })
      }
    }
  }

  /**
   * Handle QA reviews for tasks in ready_for_qa state.
   * Spawns QA agents to review code changes.
   */
  private async handleQATasks(): Promise<void> {
    if (!this.state.featureId || !this.state.graph) {
      return
    }

    const poolManager = getTaskPoolManager()
    const qaTasks = poolManager.getPool('ready_for_qa')

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

      // Get worktree path from dev agent (if still exists) or construct it
      const devAgent = getDevAgent(taskId)
      let worktreePath = devAgent?.getState().worktreePath

      if (!worktreePath) {
        // Task agent already cleaned up, construct path
        const gitManager = getGitManager()
        const config = gitManager.getConfig()
        const worktreeName = getTaskWorktreeName(this.state.featureId, taskId)
        worktreePath = path.join(config.worktreesDir, worktreeName)
      }

      // Spawn QA agent with feature spec for spec-aware review
      const qaAgent = createQAAgent(this.state.featureId, taskId)
      const initialized = await qaAgent.initialize(
        task.title,
        task.description,
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
   * On pass: transition to merging
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

    const poolManager = getTaskPoolManager()

    if (result.passed) {
      // QA passed → transition to ready_for_merge
      const transitionResult = transitionTask(task, 'QA_PASSED')
      if (transitionResult.success) {
        // Task is in ready_for_qa pool, move to ready_for_merge
        poolManager.moveTask(taskId, 'ready_for_qa', 'ready_for_merge')
        this.history.push(createStateChangeRecord(taskId, 'ready_for_qa', 'ready_for_merge', 'QA_PASSED'))
        this.addEvent('qa_passed', { taskId })

        // Update feature status
        this.updateFeatureStatus()

        // Start merge (transition to in_progress for merge)
        const mergeTransition = transitionTask(task, 'MERGE_STARTED')
        if (mergeTransition.success) {
          poolManager.moveTask(taskId, 'ready_for_merge', 'in_progress')

          // Execute merge
          this.executeMerge(taskId).then((mergeSuccess) => {
            if (mergeSuccess) {
              this.completeMerge(taskId)
            }
          })
        }
      }
    } else {
      // QA failed → store feedback and move back to ready_for_dev
      task.qaFeedback = result.feedback
      const transitionResult = transitionTask(task, 'QA_FAILED')
      if (transitionResult.success) {
        // Move from ready_for_qa back to ready_for_dev for dev rework
        poolManager.moveTask(taskId, 'ready_for_qa', 'ready_for_dev')
        this.history.push(createStateChangeRecord(taskId, 'ready_for_qa', 'ready_for_dev', 'QA_FAILED'))
        this.addEvent('qa_failed', { taskId, feedback: result.feedback })
        console.log(`[Orchestrator] Task ${taskId} returned to dev (ready_for_dev) with feedback: ${result.feedback}`)

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
   * Execute merge via merge agent.
   * Merges task branch into feature branch.
   * Returns true if merge succeeded, false otherwise.
   */
  private async executeMerge(taskId: string): Promise<boolean> {
    if (!this.state.featureId || !this.state.graph) {
      console.warn('[Orchestrator] Cannot execute merge - no feature/graph loaded')
      return false
    }

    const task = this.state.graph.nodes.find((n) => n.id === taskId)
    if (!task) {
      console.warn(`[Orchestrator] Task ${taskId} not found for merge`)
      return false
    }

    // Create and initialize merge agent
    const mergeAgent = createMergeAgent(this.state.featureId, taskId)
    registerMergeAgent(mergeAgent)

    const initialized = await mergeAgent.initialize(task.title)
    if (!initialized) {
      console.error(`[Orchestrator] Failed to initialize merge agent for task ${taskId}`)
      this.failTask(taskId, 'Failed to initialize merge agent')
      removeMergeAgent(taskId)
      return false
    }

    // Check branches for conflicts
    const branchesOk = await mergeAgent.checkBranches()
    if (!branchesOk) {
      const mergeError = mergeAgent.getState().error || 'Branch check failed'
      console.error(`[Orchestrator] Branch check failed for task ${taskId}: ${mergeError}`)
      this.failTask(taskId, mergeError)
      await mergeAgent.cleanup()
      removeMergeAgent(taskId)
      return false
    }

    // For now, auto-approve clean merges (no conflicts)
    // In the future, this could go through harness approval
    mergeAgent.receiveApproval({ approved: true, type: 'approved' })

    // Execute the merge
    const mergeResult = await mergeAgent.executeMerge()

    // Cleanup merge agent
    await mergeAgent.cleanup()
    removeMergeAgent(taskId)

    if (mergeResult.success && mergeResult.merged) {
      console.log(`[Orchestrator] Merge successful for task ${taskId}`)
      return true
    } else {
      console.error(`[Orchestrator] Merge failed for task ${taskId}: ${mergeResult.error}`)
      this.failTask(taskId, mergeResult.error || 'Merge failed')
      return false
    }
  }

  /**
   * Assign an agent to a task - creates TaskController for Ralph Loop execution.
   */
  private async assignAgentToTask(task: Task): Promise<void> {
    if (!this.state.featureId || !this.state.graph) {
      console.error('[Orchestrator] Cannot assign: no feature/graph')
      return
    }

    try {
      // Load feature for goal
      const featureStore = getFeatureStore()
      const feature = featureStore ? await featureStore.loadFeature(this.state.featureId) : null
      const featureGoal = feature?.name || 'Complete tasks'

      // Load CLAUDE.md (may not exist)
      let claudeMd: string | undefined
      const contextService = getContextService()
      if (contextService) {
        claudeMd = (await contextService.getClaudeMd()) || undefined
      }

      // Get project root from context service
      const projectRoot = contextService?.getProjectRoot() || process.cwd()

      // Create TaskController with loop config from orchestrator config
      const controller = createTaskController(
        this.state.featureId,
        task.id,
        projectRoot,
        {
          maxIterations: this.config.maxIterations ?? 10,
          runBuild: this.config.runBuild ?? true,
          runLint: this.config.runLint ?? true,
          runTests: this.config.runTests ?? false,
          continueOnLintFail: this.config.continueOnLintFail ?? true
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
        controller.start(task, this.state.graph!, claudeMd, featureGoal)
          .catch(err => console.error(`[Orchestrator] TaskController error for ${task.id}:`, err))
      }
    } catch (error) {
      console.error('[Orchestrator] Error assigning TaskController:', error)
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
    return this.state.graph.nodes.every((n) => n.status === 'completed')
  }

  /**
   * Get tasks that are ready for execution and can be assigned.
   */
  getNextTasks(): NextTasksResult {
    if (!this.state.graph) {
      return { ready: [], available: [], canAssign: 0 }
    }

    // Get ready task IDs from pool (O(1) lookup)
    const poolManager = getTaskPoolManager()
    const readyIds = poolManager.getPool('ready_for_dev')

    // Map IDs to Task objects
    const ready = readyIds
      .map((id) => this.state.graph!.nodes.find((n) => n.id === id))
      .filter((t): t is Task => t !== undefined)

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

    // Calculate how many more can be assigned using pool counts
    const counts = poolManager.getCounts()
    // in_progress tracks all active work (dev, qa, merge combined)
    const currentActive = counts.in_progress
    const canAssignTasks = this.config.maxConcurrentTasks - currentActive
    const canAssign = Math.max(0, canAssignTasks)

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

    if (task.status !== 'ready_for_dev') {
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

    if (task.status !== 'in_progress') {
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
   * Mark a task's merge as successful.
   * Triggers cascade to unblock dependent tasks.
   */
  completeMerge(taskId: string): { success: boolean; unblocked: string[]; error?: string } {
    if (!this.state.graph) {
      return { success: false, unblocked: [], error: 'No graph loaded' }
    }

    const task = this.state.graph.nodes.find((n) => n.id === taskId)
    if (!task) {
      return { success: false, unblocked: [], error: 'Task not found' }
    }

    if (task.status !== 'in_progress') {
      return { success: false, unblocked: [], error: `Task not in_progress (status: ${task.status})` }
    }

    const result = transitionTask(task, 'MERGE_SUCCESS')
    if (!result.success) {
      return { success: false, unblocked: [], error: result.error }
    }

    // Update pools for completed task
    const poolManager = getTaskPoolManager()
    poolManager.moveTask(taskId, result.previousStatus, result.newStatus)

    this.history.push(
      createStateChangeRecord(taskId, result.previousStatus, result.newStatus, 'MERGE_SUCCESS')
    )

    // Remove assignment
    this.assignments.delete(taskId)

    // Cascade to unblock dependents
    const cascade = cascadeTaskCompletion(taskId, this.state.graph)
    this.history.push(...cascade.changes)

    // Update pools for unblocked tasks (blocked → ready)
    for (const change of cascade.changes) {
      poolManager.moveTask(change.taskId, change.previousStatus, change.newStatus)
    }

    const unblocked = cascade.changes.map((c) => c.taskId)

    this.addEvent('task_completed', {
      taskId,
      previousStatus: result.previousStatus,
      newStatus: result.newStatus
    })

    // Completion is now checked by the tick loop

    // Update feature status
    this.updateFeatureStatus()

    return { success: true, unblocked }
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
   * Abort a task's iteration loop.
   */
  abortLoop(taskId: string): { success: boolean; error?: string } {
    const controller = this.taskControllers.get(taskId)
    if (!controller) {
      return { success: false, error: 'No active loop for this task' }
    }

    controller.abort()
    console.log(`[Orchestrator] Aborted loop for task ${taskId}`)
    this.emit('task_loop_update', this.getLoopStatus(taskId))
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

      // Emit event for IPC handlers to forward to renderer
      this.emit('feature_status_changed', {
        featureId: this.state.featureId,
        status: newStatus,
        previousStatus: this.currentFeatureStatus
      })

      // Handle feature archived - stop orchestrator
      if (newStatus === 'archived') {
        await this.handleFeatureArchived()
      }

      // Handle feature completed - trigger completion action if configured
      if (newStatus === 'completed' && feature) {
        await this.handleFeatureCompleted(feature)
      }

      this.currentFeatureStatus = newStatus
    }
  }

  /**
   * Handle feature completion - trigger configured completion action.
   * Called when feature transitions to completed status.
   */
  private async handleFeatureCompleted(feature: { id: string; name: string; branchName: string; completionAction?: string }): Promise<void> {
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
   * Creates FeatureMergeAgent and performs direct merge to main.
   */
  private async executeAutoMerge(feature: { id: string; branchName: string }): Promise<void> {
    console.log(`[Orchestrator] Executing auto_merge for feature ${feature.id}`)

    const gitManager = getGitManager()
    const targetBranch = await gitManager.getDefaultBranch()

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
    const agent = createFeatureMergeAgent(feature.id, targetBranch, feature.branchName)
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

      // Archive feature after successful merge (if not already archived)
      try {
        const featureStore = getFeatureStore()
        const currentFeature = featureStore ? await featureStore.loadFeature(feature.id) : null
        if (currentFeature && currentFeature.status !== 'archived') {
          const statusManager = getFeatureStatusManager()
          await statusManager.updateFeatureStatus(feature.id, 'archived')
          console.log(`[Orchestrator] Feature ${feature.id} archived after auto_merge`)
        }
      } catch (archiveError) {
        console.error(`[Orchestrator] Failed to archive feature ${feature.id}:`, archiveError)
      }

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
   * Creates a pull request using GitHub CLI.
   */
  private async executeAutoPR(feature: { id: string; name: string; branchName: string }): Promise<void> {
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

    // Create PR
    const result = await prService.createPullRequest({
      title: feature.name,
      body: `## Summary\n\nAutomatically generated PR for feature: ${feature.name}\n\n---\n*Created by DAGent Auto PR*`,
      head: feature.branchName,
      base: 'main',
      featureId: feature.id
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to create pull request')
    }

    console.log(`[Orchestrator] Auto PR created successfully for feature ${feature.id}: ${result.htmlUrl || result.prUrl}`)

    // Archive feature after successful PR creation (if not already archived)
    try {
      const featureStore = getFeatureStore()
      const currentFeature = featureStore ? await featureStore.loadFeature(feature.id) : null
      if (currentFeature && currentFeature.status !== 'archived') {
        const statusManager = getFeatureStatusManager()
        await statusManager.updateFeatureStatus(feature.id, 'archived')
        console.log(`[Orchestrator] Feature ${feature.id} archived after PR creation`)
      }
    } catch (archiveError) {
      console.error(`[Orchestrator] Failed to archive feature ${feature.id}:`, archiveError)
    }

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
