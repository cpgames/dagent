import type { DAGGraph, Task } from '@shared/types'
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
import { getReadyTasks } from './analyzer'
import { createTaskAgent, registerTaskAgent } from '../agents'
import { getFeatureStore } from '../ipc/storage-handlers'
import { getContextService } from '../context'

export class ExecutionOrchestrator {
  private state: ExecutionState
  private config: ExecutionConfig
  private assignments: Map<string, TaskAssignment>
  private history: TaskStateChange[]
  private events: ExecutionEvent[]
  private loopInterval: NodeJS.Timeout | null = null
  private readonly TICK_INTERVAL_MS = 1000

  constructor(config: Partial<ExecutionConfig> = {}) {
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

    // Recalculate all task statuses based on dependencies
    const { changes } = recalculateAllStatuses(graph)
    this.history.push(...changes)
  }

  /**
   * Start execution (Play button pressed).
   */
  start(): { success: boolean; error?: string } {
    if (!this.state.graph || !this.state.featureId) {
      return { success: false, error: 'No graph loaded' }
    }

    if (this.state.status === 'running') {
      return { success: false, error: 'Execution already running' }
    }

    this.state.status = 'running'
    this.state.startedAt = new Date().toISOString()
    this.state.stoppedAt = null
    this.state.error = null

    this.addEvent('started')
    this.startLoop()
    return { success: true }
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

    // Log tick for debugging
    console.log(`[Orchestrator] tick: ${available.length} available, can assign ${canAssign}`)

    // Assign agents to available tasks
    if (available.length > 0 && canAssign > 0) {
      const tasksToAssign = available.slice(0, canAssign)
      for (const task of tasksToAssign) {
        await this.assignAgentToTask(task)
      }
    }

    // Emit tick event for UI updates
    this.addEvent('tick', {
      availableCount: available.length,
      canAssign
    })
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
        console.error('[Orchestrator] Failed to initialize agent for task:', task.id)
        return
      }

      registerTaskAgent(agent)

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

    // Get all ready tasks
    const ready = getReadyTasks(this.state.graph)

    // Filter out already assigned tasks
    const assignedIds = new Set(this.assignments.keys())
    const available = ready.filter((t) => !assignedIds.has(t.id))

    // Calculate how many more can be assigned
    const currentRunning = this.state.graph.nodes.filter((n) => n.status === 'running').length
    const canAssignTasks = this.config.maxConcurrentTasks - currentRunning
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

    if (task.status !== 'running') {
      return { success: false, error: `Task not running (status: ${task.status})` }
    }

    const result = transitionTask(task, 'CODE_COMPLETE')
    if (!result.success) {
      return { success: false, error: result.error }
    }

    this.history.push(
      createStateChangeRecord(taskId, result.previousStatus, result.newStatus, 'CODE_COMPLETE')
    )

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

    this.history.push(
      createStateChangeRecord(taskId, result.previousStatus, result.newStatus, 'MERGE_SUCCESS')
    )

    // Remove assignment
    this.assignments.delete(taskId)

    // Cascade to unblock dependents
    const cascade = cascadeTaskCompletion(taskId, this.state.graph)
    this.history.push(...cascade.changes)

    const unblocked = cascade.changes.map((c) => c.taskId)

    this.addEvent('task_completed', {
      taskId,
      previousStatus: result.previousStatus,
      newStatus: result.newStatus
    })

    // Completion is now checked by the tick loop

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

    this.history.push(
      createStateChangeRecord(taskId, result.previousStatus, result.newStatus, event)
    )

    // Remove assignment
    this.assignments.delete(taskId)

    this.addEvent('task_failed', {
      taskId,
      error
    })

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
