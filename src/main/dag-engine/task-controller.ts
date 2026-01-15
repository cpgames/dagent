import { EventEmitter } from 'events'
import type { Task, DAGGraph, TaskStatus } from '@shared/types'
import type { TransitionResult, StateTransitionEvent } from './state-machine'
import { getNextStatus } from './state-machine'
import { getTaskDependencies } from './topological-sort'
import type {
  TaskControllerState,
  TaskControllerConfig,
  LoopExitReason,
  IterationResult
} from './task-controller-types'
import { DEFAULT_TASK_CONTROLLER_CONFIG } from './task-controller-types'
import type { TaskPlan } from '../agents/task-plan-types'
import { getTaskPlanStore } from '../agents/task-plan-store'
import type { VerificationResult } from '../agents/verification-types'
import { getVerificationRunner, type VerificationConfig } from '../agents/verification-runner'
import { createDevAgent, type DevAgent } from '../agents/dev-agent'
import type { TaskExecutionResult } from '../agents/dev-types'

export interface TaskStateChange {
  taskId: string
  previousStatus: TaskStatus
  newStatus: TaskStatus
  event: StateTransitionEvent
  timestamp: string
}

/**
 * Attempts to transition a task to a new status.
 * Returns the result of the transition attempt.
 */
export function transitionTask(
  task: Task,
  event: StateTransitionEvent,
  graph?: DAGGraph
): TransitionResult {
  const previousStatus = task.status
  const nextStatus = getNextStatus(previousStatus, event)

  if (nextStatus === null) {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: `Invalid transition: cannot trigger '${event}' from '${previousStatus}'`
    }
  }

  // Special validation for RETRY event
  if (event === 'RETRY' && graph) {
    const dependencies = getTaskDependencies(task.id, graph.connections)
    const allDependenciesMet = dependencies.every((depId) => {
      const depTask = graph.nodes.find((n) => n.id === depId)
      return depTask?.status === 'completed'
    })

    if (!allDependenciesMet) {
      return {
        success: false,
        previousStatus,
        newStatus: previousStatus,
        error: 'Cannot retry: not all dependencies are completed'
      }
    }
  }

  // Apply the transition
  task.status = nextStatus

  return {
    success: true,
    previousStatus,
    newStatus: nextStatus
  }
}

/**
 * Batch transition: applies an event to multiple tasks.
 * Returns results for each task.
 */
export function transitionTasks(
  tasks: Task[],
  event: StateTransitionEvent,
  graph?: DAGGraph
): Map<string, TransitionResult> {
  const results = new Map<string, TransitionResult>()

  for (const task of tasks) {
    results.set(task.id, transitionTask(task, event, graph))
  }

  return results
}

/**
 * Gets all tasks that can receive a specific event.
 */
export function getTasksForEvent(graph: DAGGraph, event: StateTransitionEvent): Task[] {
  return graph.nodes.filter((task) => {
    const nextStatus = getNextStatus(task.status, event)
    return nextStatus !== null
  })
}

/**
 * Initializes task statuses based on dependencies.
 * Tasks with no dependencies start as 'ready_for_dev', others as 'blocked'.
 */
export function initializeTaskStatuses(graph: DAGGraph): void {
  for (const task of graph.nodes) {
    // Skip active and terminal states
    if (['completed', 'in_progress', 'ready_for_qa', 'ready_for_merge'].includes(task.status)) {
      continue
    }

    const dependencies = getTaskDependencies(task.id, graph.connections)

    if (dependencies.length === 0) {
      task.status = 'ready_for_dev'
    } else {
      const allDependenciesMet = dependencies.every((depId) => {
        const depTask = graph.nodes.find((n) => n.id === depId)
        return depTask?.status === 'completed'
      })

      task.status = allDependenciesMet ? 'ready_for_dev' : 'blocked'
    }
  }
}

/**
 * Creates a state change record for logging.
 */
export function createStateChangeRecord(
  taskId: string,
  previousStatus: TaskStatus,
  newStatus: TaskStatus,
  event: StateTransitionEvent
): TaskStateChange {
  return {
    taskId,
    previousStatus,
    newStatus,
    event,
    timestamp: new Date().toISOString()
  }
}

// =============================================================================
// TaskController - Ralph Loop Iteration Manager
// =============================================================================

/**
 * TaskController manages the Ralph Loop iteration cycle for DevAgent task execution.
 *
 * The Ralph Loop is the core iteration mechanism:
 * 1. Create fresh DevAgent with focused context on failing items
 * 2. Execute DevAgent to make changes
 * 3. Run verification checks (build/lint/test)
 * 4. If all checks pass -> done
 * 5. If checks fail -> next iteration with fresh agent
 * 6. Continue until all checks pass or max iterations reached
 *
 * Key principle: Each iteration creates a NEW DevAgent instance.
 * No context bloat because each agent starts fresh, reading the TaskPlan
 * to understand what's failing.
 */
export class TaskController extends EventEmitter {
  private state: TaskControllerState
  private config: TaskControllerConfig
  private plan: TaskPlan | null = null
  private task: Task | null = null
  private graph: DAGGraph | null = null
  private claudeMd?: string
  private featureGoal?: string
  private currentDevAgent: DevAgent | null = null
  private projectRoot: string

  constructor(
    featureId: string,
    taskId: string,
    projectRoot: string,
    config: Partial<TaskControllerConfig> = {}
  ) {
    super()
    this.projectRoot = projectRoot
    this.config = { ...DEFAULT_TASK_CONTROLLER_CONFIG, ...config }
    this.state = {
      status: 'idle',
      featureId,
      taskId,
      worktreePath: null,
      currentIteration: 0,
      maxIterations: this.config.maxIterations,
      iterationResults: [],
      startedAt: null,
      completedAt: null,
      exitReason: null,
      error: null
    }
  }

  /**
   * Start the Ralph Loop iteration cycle.
   * Creates or loads TaskPlan and enters the iteration loop.
   */
  async start(
    task: Task,
    graph: DAGGraph,
    claudeMd?: string,
    featureGoal?: string
  ): Promise<void> {
    if (this.state.status !== 'idle') {
      throw new Error(`Cannot start TaskController in status '${this.state.status}'`)
    }

    this.task = task
    this.graph = graph
    this.claudeMd = claudeMd
    this.featureGoal = featureGoal
    this.state.status = 'running'
    this.state.startedAt = new Date().toISOString()
    this.state.currentIteration = 1

    this.emit('loop:start', this.getState())

    try {
      // Create or load TaskPlan
      const store = getTaskPlanStore(this.projectRoot)
      let plan = await store.loadPlan(this.state.featureId, this.state.taskId)

      if (!plan) {
        plan = await store.createPlan(this.state.featureId, this.state.taskId, {
          runBuild: this.config.runBuild,
          runLint: this.config.runLint,
          runTests: this.config.runTests,
          continueOnLintFail: this.config.continueOnLintFail
        })
      }

      plan.status = 'running'
      await store.savePlan(this.state.featureId, this.state.taskId, plan)
      this.plan = plan

      // Enter iteration loop
      await this.runIterationLoop()
    } catch (error) {
      this.state.status = 'failed'
      this.state.error = (error as Error).message
      this.state.exitReason = 'error'
      this.state.completedAt = new Date().toISOString()
      this.emit('loop:complete', this.getState())
    }
  }

  /**
   * Main iteration loop - runs until exit condition is met.
   */
  private async runIterationLoop(): Promise<void> {
    while (this.state.status === 'running') {
      // Check exit conditions
      const exitReason = this.checkExitConditions()
      if (exitReason) {
        this.state.exitReason = exitReason
        this.state.status = exitReason === 'all_checks_passed' ? 'completed' : 'failed'
        this.state.completedAt = new Date().toISOString()

        // Update TaskPlan status
        if (this.plan) {
          const store = getTaskPlanStore(this.projectRoot)
          this.plan.status = exitReason === 'all_checks_passed' ? 'completed' : 'failed'
          this.plan.completedAt = new Date().toISOString()
          await store.savePlan(this.state.featureId, this.state.taskId, this.plan)
        }

        break
      }

      // Run iteration
      this.emit('iteration:start', {
        iteration: this.state.currentIteration,
        maxIterations: this.state.maxIterations
      })

      const iterationStart = Date.now()

      // Build iteration prompt focused on failing items
      const prompt = this.buildIterationPrompt()

      // Spawn fresh DevAgent
      const devResult = await this.spawnDevAgent(prompt)

      // Run verification checks
      const verifyResults = await this.runVerification()

      // Update plan with results
      await this.updatePlanFromResults(devResult, verifyResults)

      // Create iteration result
      const iterationResult: IterationResult = {
        iteration: this.state.currentIteration,
        devAgentSuccess: devResult.success,
        verificationResults: verifyResults,
        duration: Date.now() - iterationStart,
        summary: this.buildIterationSummary(devResult, verifyResults),
        error: devResult.error
      }

      this.state.iterationResults.push(iterationResult)
      this.emit('iteration:complete', iterationResult)

      // Log activity to TaskPlan
      if (this.plan) {
        const store = getTaskPlanStore(this.projectRoot)
        await store.addActivity(this.state.featureId, this.state.taskId, {
          iteration: this.state.currentIteration,
          summary: iterationResult.summary,
          duration: iterationResult.duration,
          checklistSnapshot: this.getChecklistSnapshot()
        })
      }

      // Check if DevAgent failure should abort
      if (!devResult.success && this.config.abortOnDevAgentFail) {
        this.state.exitReason = 'error'
        this.state.status = 'failed'
        this.state.error = devResult.error || 'DevAgent failed'
        this.state.completedAt = new Date().toISOString()
        break
      }

      // Increment iteration
      this.state.currentIteration++
    }

    this.emit('loop:complete', this.getState())
  }

  /**
   * Check exit conditions for the loop.
   * Returns null to continue, or LoopExitReason to exit.
   */
  private checkExitConditions(): LoopExitReason | null {
    // Check if aborted
    if (this.state.status === 'aborted') {
      return 'aborted'
    }

    // Check if max iterations reached
    if (this.state.currentIteration > this.state.maxIterations) {
      return 'max_iterations_reached'
    }

    // Check if all required checklist items pass
    if (this.plan) {
      const requiredItems = this.plan.checklist.filter((item) => {
        // 'implement' is always required
        if (item.id === 'implement') return true
        // Build is required if runBuild is true
        if (item.id === 'build' && this.config.runBuild) return true
        // Lint is required only if runLint is true AND continueOnLintFail is false
        if (item.id === 'lint' && this.config.runLint && !this.config.continueOnLintFail)
          return true
        // Test is required if runTests is true
        if (item.id === 'test' && this.config.runTests) return true
        return false
      })

      const allPassed = requiredItems.every((item) => item.status === 'pass')
      if (allPassed && this.state.currentIteration > 1) {
        // Only exit on first iteration if we've actually run checks
        return 'all_checks_passed'
      }
    }

    return null
  }

  /**
   * Build focused prompt for DevAgent based on failing items.
   */
  private buildIterationPrompt(): string {
    const parts: string[] = []

    parts.push('# Task Implementation Request')
    parts.push('')

    if (this.state.currentIteration === 1) {
      parts.push('## Initial Implementation')
      parts.push(`Implement the following task: ${this.task?.title}`)
      if (this.task?.description) {
        parts.push('')
        parts.push(this.task.description)
      }
    } else {
      parts.push(`## Iteration ${this.state.currentIteration} - Fix Failing Checks`)
      parts.push('')
      parts.push('Previous implementation attempt had issues. Focus on fixing these:')
      parts.push('')

      // List failing items with their errors
      if (this.plan) {
        for (const item of this.plan.checklist) {
          if (item.status === 'fail') {
            parts.push(`### ${item.description}: FAILED`)
            if (item.error) {
              parts.push('```')
              parts.push(item.error)
              parts.push('```')
            }
            if (item.output) {
              parts.push('Output:')
              parts.push('```')
              parts.push(item.output)
              parts.push('```')
            }
            parts.push('')
          }
        }
      }

      // Include activity summary from prior iterations
      if (this.plan && this.plan.activity.length > 0) {
        parts.push('## Prior Attempts')
        const recentActivity = this.plan.activity.slice(-3) // Last 3 iterations
        for (const entry of recentActivity) {
          parts.push(`- Iteration ${entry.iteration}: ${entry.summary}`)
        }
        parts.push('')
      }
    }

    return parts.join('\n')
  }

  /**
   * Spawn a fresh DevAgent for this iteration.
   */
  private async spawnDevAgent(prompt: string): Promise<TaskExecutionResult> {
    // Clean up previous agent if exists
    if (this.currentDevAgent) {
      await this.currentDevAgent.cleanup(false)
      this.currentDevAgent = null
    }

    // Create fresh DevAgent
    const agent = createDevAgent(this.state.featureId, this.state.taskId, {
      autoPropose: true,
      autoExecute: true
    })
    this.currentDevAgent = agent

    try {
      // Initialize agent
      const initialized = await agent.initialize(
        this.task!,
        this.graph!,
        this.claudeMd,
        this.featureGoal
      )

      if (!initialized) {
        return {
          success: false,
          taskId: this.state.taskId,
          error: agent.getState().error || 'Failed to initialize DevAgent'
        }
      }

      // Store worktree path
      this.state.worktreePath = agent.getState().worktreePath

      // Propose intention and wait for approval
      await agent.proposeIntention(prompt)

      // Wait for execution to complete
      return new Promise<TaskExecutionResult>((resolve) => {
        const onComplete = (result: TaskExecutionResult): void => {
          agent.off('dev-agent:ready_for_merge', onComplete)
          agent.off('dev-agent:failed', onFailed)
          resolve(result)
        }

        const onFailed = (result: TaskExecutionResult): void => {
          agent.off('dev-agent:ready_for_merge', onComplete)
          agent.off('dev-agent:failed', onFailed)
          resolve(result)
        }

        agent.on('dev-agent:ready_for_merge', onComplete)
        agent.on('dev-agent:failed', onFailed)
      })
    } catch (error) {
      return {
        success: false,
        taskId: this.state.taskId,
        error: (error as Error).message
      }
    }
  }

  /**
   * Run verification checks in the worktree.
   */
  private async runVerification(): Promise<VerificationResult[]> {
    if (!this.state.worktreePath) {
      return []
    }

    this.emit('verification:start')

    const runner = getVerificationRunner(this.state.worktreePath)
    const config: VerificationConfig = {
      runBuild: this.config.runBuild,
      runLint: this.config.runLint,
      runTests: this.config.runTests
    }

    const results = await runner.runAllChecks(config)

    this.emit('verification:complete', results)
    return results
  }

  /**
   * Update TaskPlan checklist from DevAgent and verification results.
   */
  private async updatePlanFromResults(
    devResult: TaskExecutionResult,
    verifyResults: VerificationResult[]
  ): Promise<void> {
    if (!this.plan) return

    const store = getTaskPlanStore(this.projectRoot)

    // Update 'implement' item based on DevAgent result
    await store.updateChecklistItem(this.state.featureId, this.state.taskId, 'implement', {
      status: devResult.success ? 'pass' : 'fail',
      error: devResult.error
    })

    // Update verification items based on results
    for (const result of verifyResults) {
      const itemId = result.checkId
      await store.updateChecklistItem(this.state.featureId, this.state.taskId, itemId, {
        status: result.passed ? 'pass' : 'fail',
        error: result.error,
        output: result.result.stdout.slice(0, 500) // Truncate output
      })
    }

    // Mark skipped items
    const checkIds = verifyResults.map((r) => r.checkId)
    if (this.config.runBuild && !checkIds.includes('build')) {
      await store.updateChecklistItem(this.state.featureId, this.state.taskId, 'build', {
        status: 'skipped'
      })
    }
    if (this.config.runLint && !checkIds.includes('lint')) {
      await store.updateChecklistItem(this.state.featureId, this.state.taskId, 'lint', {
        status: 'skipped'
      })
    }
    if (this.config.runTests && !checkIds.includes('test')) {
      await store.updateChecklistItem(this.state.featureId, this.state.taskId, 'test', {
        status: 'skipped'
      })
    }

    // Reload plan to get updated state
    this.plan = await store.loadPlan(this.state.featureId, this.state.taskId)
  }

  /**
   * Build summary string for an iteration.
   */
  private buildIterationSummary(
    devResult: TaskExecutionResult,
    verifyResults: VerificationResult[]
  ): string {
    const parts: string[] = []

    if (devResult.success) {
      parts.push('DevAgent completed')
    } else {
      parts.push(`DevAgent failed: ${devResult.error || 'unknown error'}`)
    }

    const passed = verifyResults.filter((r) => r.passed).length
    const failed = verifyResults.length - passed
    parts.push(`Verification: ${passed} passed, ${failed} failed`)

    return parts.join('. ')
  }

  /**
   * Get checklist status snapshot for activity log.
   */
  private getChecklistSnapshot(): Record<string, 'pending' | 'pass' | 'fail' | 'skipped'> {
    if (!this.plan) return {}

    const snapshot: Record<string, 'pending' | 'pass' | 'fail' | 'skipped'> = {}
    for (const item of this.plan.checklist) {
      snapshot[item.id] = item.status
    }
    return snapshot
  }

  /**
   * Abort the iteration loop.
   */
  abort(): void {
    if (this.state.status === 'running') {
      this.state.status = 'aborted'
      this.state.exitReason = 'aborted'
      this.state.completedAt = new Date().toISOString()

      // Abort current DevAgent if running
      if (this.currentDevAgent) {
        this.currentDevAgent.abort()
      }

      // Update TaskPlan status
      if (this.plan) {
        this.plan.status = 'aborted'
        const store = getTaskPlanStore(this.projectRoot)
        store.savePlan(this.state.featureId, this.state.taskId, this.plan)
      }

      this.emit('loop:complete', this.getState())
    }
  }

  /**
   * Pause the iteration loop.
   */
  pause(): void {
    if (this.state.status === 'running') {
      this.state.status = 'paused'

      if (this.plan) {
        this.plan.status = 'paused'
        const store = getTaskPlanStore(this.projectRoot)
        store.savePlan(this.state.featureId, this.state.taskId, this.plan)
      }

      this.emit('loop:paused', this.getState())
    }
  }

  /**
   * Resume the iteration loop.
   */
  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running'

      if (this.plan) {
        this.plan.status = 'running'
        const store = getTaskPlanStore(this.projectRoot)
        store.savePlan(this.state.featureId, this.state.taskId, this.plan)
      }

      this.emit('loop:resumed', this.getState())

      // Continue iteration loop
      this.runIterationLoop()
    }
  }

  /**
   * Get current controller state.
   */
  getState(): TaskControllerState {
    return { ...this.state }
  }

  /**
   * Clean up controller resources.
   */
  async cleanup(): Promise<void> {
    if (this.currentDevAgent) {
      await this.currentDevAgent.cleanup(false)
      this.currentDevAgent = null
    }
  }
}

/**
 * Factory function for creating TaskController instances.
 */
export function createTaskController(
  featureId: string,
  taskId: string,
  projectRoot: string,
  config?: Partial<TaskControllerConfig>
): TaskController {
  return new TaskController(featureId, taskId, projectRoot, config)
}
