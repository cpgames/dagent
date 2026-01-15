import { EventEmitter } from 'events'
import type { DAGGraph, Task } from '@shared/types'
import type { FeatureStatus } from '@shared/types/feature'
import type {
  ExecutionState,
  ExecutionConfig,
  TaskAssignment,
  ExecutionEvent,
  ExecutionSnapshot,
  NextTasksResult
} from './orchestrator-types'
import { DEFAULT_EXECUTION_CONFIG } from './orchestrator-types'
import type { TaskStateChange } from './task-controller'
import { transitionTask, createStateChangeRecord } from './task-controller'
import { cascadeTaskCompletion, recalculateAllStatuses } from './cascade'
import { getTaskPoolManager, resetTaskPoolManager } from './task-pool'
import { createTaskAgent, registerTaskAgent, getTaskAgent, getAllTaskAgents, removeTaskAgent, getAgentPool } from '../agents'
import { getHarnessAgent, HarnessAgent } from '../agents/harness-agent'
import { createMergeAgent, registerMergeAgent, removeMergeAgent } from '../agents/merge-agent'
import { createQAAgent, registerQAAgent, getQAAgent, removeQAAgent, getAllQAAgents, clearQAAgents } from '../agents/qa-agent'
import type { QAReviewResult } from '../agents/qa-types'
import type { HarnessMessage } from '../agents/harness-types'
import { getFeatureStore } from '../ipc/storage-handlers'
import { getContextService } from '../context'
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
  private currentFeatureStatus: FeatureStatus = 'not_started'
  // Track intentions currently being processed to prevent duplicate processing
  private processingIntentions: Set<string> = new Set()

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
    this.currentFeatureStatus = 'not_started'
  }

  /**
   * Initialize orchestrator with a feature's DAG graph.
   */
  initialize(featureId: string, graph: DAGGraph): void {
    this.state.featureId = featureId
    this.state.graph = graph
    this.state.status = 'idle'
    this.state.error = null
    this.assignments.clear()
    this.history = []
    this.events = []
    this.failedThisTick.clear()
    this.initFailureCounts.clear()

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

    // Process pending intentions
    await this.processPendingIntentions()

    // Handle completed task agents
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
   * Process pending intentions from task agents.
   */
  private async processPendingIntentions(): Promise<void> {
    const harness = getHarnessAgent()
    const harnessState = harness.getState()

    // Process each pending intention
    for (const pending of harnessState.pendingIntentions) {
      const taskId = pending.taskId

      // Skip if already being processed (prevents duplicate processing during async review)
      if (this.processingIntentions.has(taskId)) {
        continue
      }

      // Mark as being processed
      this.processingIntentions.add(taskId)

      try {
        const decision = await harness.processIntention(taskId)

        if (decision) {
          // Send decision back to task agent
          const taskAgent = getTaskAgent(taskId)
          if (taskAgent) {
            taskAgent.receiveApproval(decision)
            console.log('[Orchestrator] Sent approval to task:', taskId, 'decision:', decision.type)
          }
        }
      } finally {
        // Remove from processing set when done
        this.processingIntentions.delete(taskId)
      }
    }
  }

  /**
   * Handle completed task agents - update orchestrator state and cleanup.
   */
  private async handleCompletedTasks(): Promise<void> {
    const taskAgents = getAllTaskAgents()
    const harness = getHarnessAgent()

    for (const agent of taskAgents) {
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

        // Cleanup task agent (but keep worktree for QA!)
        // Note: Don't call agent.cleanup() here - QA needs the worktree
        await agent.markCompleted()
        removeTaskAgent(taskId)

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
        removeTaskAgent(taskId)

        this.addEvent('task_failed', { taskId, error: errorMsg })
      }
    }
  }

  /**
   * Handle QA reviews for tasks in qa state.
   * Spawns QA agents to review code changes.
   */
  private async handleQATasks(): Promise<void> {
    if (!this.state.featureId || !this.state.graph) {
      return
    }

    const poolManager = getTaskPoolManager()
    const qaTasks = poolManager.getPool('qa')

    for (const taskId of qaTasks) {
      // Skip if QA agent already exists for this task
      if (getQAAgent(taskId)) continue

      const task = this.state.graph.nodes.find((n) => n.id === taskId)
      if (!task) continue

      // Get worktree path from task agent (if still exists) or construct it
      const taskAgent = getTaskAgent(taskId)
      let worktreePath = taskAgent?.getState().worktreePath

      if (!worktreePath) {
        // Task agent already cleaned up, construct path
        const gitManager = getGitManager()
        const config = gitManager.getConfig()
        const worktreeName = getTaskWorktreeName(this.state.featureId, taskId)
        worktreePath = path.join(config.worktreesDir, worktreeName)
      }

      // Spawn QA agent
      const qaAgent = createQAAgent(this.state.featureId, taskId)
      const initialized = await qaAgent.initialize(task.title, task.description, worktreePath)

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

    const poolManager = getTaskPoolManager()

    if (result.passed) {
      // QA passed → transition to merging
      const transitionResult = transitionTask(task, 'QA_PASSED')
      if (transitionResult.success) {
        poolManager.moveTask(taskId, 'qa', 'merging')
        this.history.push(createStateChangeRecord(taskId, 'qa', 'merging', 'QA_PASSED'))
        this.addEvent('qa_passed', { taskId })

        // Update feature status
        this.updateFeatureStatus()

        // Execute merge
        this.executeMerge(taskId).then((mergeSuccess) => {
          if (mergeSuccess) {
            this.completeMerge(taskId)
          }
        })
      }
    } else {
      // QA failed → store feedback and transition back to dev
      task.qaFeedback = result.feedback
      const transitionResult = transitionTask(task, 'QA_FAILED')
      if (transitionResult.success) {
        poolManager.moveTask(taskId, 'qa', 'dev')
        this.history.push(createStateChangeRecord(taskId, 'qa', 'dev', 'QA_FAILED'))
        this.addEvent('qa_failed', { taskId, feedback: result.feedback })
        console.log(`[Orchestrator] Task ${taskId} returned to dev with feedback: ${result.feedback}`)

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
   * Assign an agent to a task - creates TaskAgent and transitions task to running.
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

      // Create and initialize task agent
      const agent = createTaskAgent(this.state.featureId, task.id)
      const initialized = await agent.initialize(task, this.state.graph, claudeMd, featureGoal)

      if (!initialized) {
        // Track failure for this tick to prevent immediate retry
        this.failedThisTick.add(task.id)

        // Track persistent failures
        const failCount = (this.initFailureCounts.get(task.id) || 0) + 1
        this.initFailureCounts.set(task.id, failCount)

        const reason = agent.getState().error || 'unknown reason'
        console.warn(
          `[Orchestrator] Failed to initialize agent for task ${task.id} (attempt ${failCount}/${this.MAX_INIT_RETRIES}): ${reason}`
        )

        // If max retries exceeded, mark task as failed
        if (failCount >= this.MAX_INIT_RETRIES) {
          console.error(`[Orchestrator] Task ${task.id} exceeded max init retries, marking as failed`)
          this.failTask(task.id, `Failed to initialize after ${failCount} attempts: ${reason}`)
        }
        return
      }

      // Clear failure count on successful init
      this.initFailureCounts.delete(task.id)

      registerTaskAgent(agent)

      // Propose intention to harness
      await agent.proposeIntention()

      // Update orchestrator state
      const agentId = agent.getState().agentId || undefined
      const result = this.assignTask(task.id, agentId)
      if (result.success) {
        console.log('[Orchestrator] Assigned agent to task:', task.id, 'agent:', agentId)
        this.addEvent('agent_assigned', { taskId: task.id, agentId })
      } else {
        console.error('[Orchestrator] Failed to assign task:', result.error)
      }
    } catch (error) {
      console.error('[Orchestrator] Error assigning agent:', error)
    }
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
    const readyIds = poolManager.getPool('ready')

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
    const currentActive = counts.dev + counts.qa + counts.merging
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

    if (task.status !== 'ready') {
      return { success: false, error: `Task not ready (status: ${task.status})` }
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
   * Mark a task as having completed its code (ready for merge).
   */
  completeTaskCode(taskId: string): { success: boolean; error?: string } {
    if (!this.state.graph) {
      return { success: false, error: 'No graph loaded' }
    }

    const task = this.state.graph.nodes.find((n) => n.id === taskId)
    if (!task) {
      return { success: false, error: 'Task not found' }
    }

    if (task.status !== 'dev') {
      return { success: false, error: `Task not in dev (status: ${task.status})` }
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

    if (task.status !== 'merging') {
      return { success: false, unblocked: [], error: `Task not merging (status: ${task.status})` }
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

    const event = task.status === 'merging' ? 'MERGE_FAILED' : 'TASK_FAILED'
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
   * Update feature status based on current task states.
   * If status has changed, persists to storage and emits event.
   */
  private async updateFeatureStatus(): Promise<void> {
    if (!this.state.featureId || !this.state.graph) {
      return
    }

    const newStatus = computeFeatureStatus(this.state.graph.nodes)

    // Only update if status actually changed
    if (newStatus !== this.currentFeatureStatus) {
      const featureStore = getFeatureStore()
      if (featureStore) {
        const feature = await featureStore.loadFeature(this.state.featureId)
        if (feature) {
          feature.status = newStatus
          feature.updatedAt = new Date().toISOString()
          await featureStore.saveFeature(feature)
          console.log(`[Orchestrator] Feature status changed: ${this.currentFeatureStatus} → ${newStatus}`)
        }
      }

      // Emit event for IPC handlers to forward to renderer
      this.emit('feature_status_changed', {
        featureId: this.state.featureId,
        status: newStatus,
        previousStatus: this.currentFeatureStatus
      })

      this.currentFeatureStatus = newStatus
    }
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
