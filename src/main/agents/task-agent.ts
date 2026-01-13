/**
 * TaskAgent - Implements individual tasks in isolated worktrees.
 * Follows DAGENT_SPEC section 7 for intention-approval workflow
 * and section 8.3 for worktree lifecycle.
 */

import { EventEmitter } from 'events'
import type { Task, DAGGraph } from '@shared/types'
import type {
  TaskAgentState,
  TaskAgentStatus,
  DependencyContextEntry,
  TaskAgentConfig,
  TaskExecutionResult
} from './task-types'
import { DEFAULT_TASK_AGENT_STATE, DEFAULT_TASK_AGENT_CONFIG } from './task-types'
import type { IntentionDecision } from './harness-types'
import { getAgentPool } from './agent-pool'
import { getHarnessAgent } from './harness-agent'
import { getGitManager } from '../git'

export class TaskAgent extends EventEmitter {
  private state: TaskAgentState
  private config: TaskAgentConfig

  constructor(featureId: string, taskId: string, config: Partial<TaskAgentConfig> = {}) {
    super()
    this.state = {
      ...DEFAULT_TASK_AGENT_STATE,
      featureId,
      taskId
    }
    this.config = { ...DEFAULT_TASK_AGENT_CONFIG, ...config }
  }

  /**
   * Initialize task agent with task and context.
   */
  async initialize(
    task: Task,
    graph: DAGGraph,
    claudeMd?: string,
    featureGoal?: string
  ): Promise<boolean> {
    if (this.state.status !== 'initializing') {
      return false
    }

    this.state.task = task
    this.state.startedAt = new Date().toISOString()

    // Register with agent pool
    const pool = getAgentPool()
    if (!pool.canSpawn('task')) {
      this.state.status = 'failed'
      this.state.error = 'Cannot spawn task agent - pool limit reached'
      return false
    }

    const agentInfo = pool.registerAgent({
      type: 'task',
      featureId: this.state.featureId,
      taskId: this.state.taskId
    })

    this.state.agentId = agentInfo.id
    pool.updateAgentStatus(agentInfo.id, 'busy', this.state.taskId)

    // Register with harness
    const harness = getHarnessAgent()
    harness.registerTaskAssignment(this.state.taskId, agentInfo.id)

    this.emit('task-agent:initialized', this.getState())

    // Load context
    this.state.status = 'loading_context'
    const contextLoaded = await this.loadContext(graph, claudeMd, featureGoal)

    if (!contextLoaded) {
      this.state.status = 'failed'
      this.state.error = 'Failed to load task context'
      return false
    }

    return true
  }

  /**
   * Load context for task execution.
   */
  private async loadContext(
    graph: DAGGraph,
    claudeMd?: string,
    featureGoal?: string
  ): Promise<boolean> {
    try {
      const task = this.state.task!

      // Create task worktree
      const gitManager = getGitManager()
      const worktreeResult = await gitManager.createTaskWorktree(
        this.state.featureId,
        this.state.taskId
      )

      if (!worktreeResult.success || !worktreeResult.worktreePath) {
        this.state.error = worktreeResult.error || 'Failed to create task worktree'
        return false
      }

      this.state.worktreePath = worktreeResult.worktreePath

      // Get dependency context from completed parent tasks
      const dependencyContext = this.assembleDependencyContext(graph)

      // Build full context
      this.state.context = {
        claudeMd: claudeMd || null,
        featureGoal: featureGoal || null,
        taskTitle: task.title,
        taskDescription: task.description,
        dependencyContext,
        worktreePath: worktreeResult.worktreePath
      }

      this.emit('task-agent:context-loaded', this.state.context)
      return true
    } catch (error) {
      this.state.error = (error as Error).message
      return false
    }
  }

  /**
   * Assemble context from completed dependency tasks.
   */
  private assembleDependencyContext(graph: DAGGraph): DependencyContextEntry[] {
    const taskId = this.state.taskId
    const dependencies: DependencyContextEntry[] = []

    // Find all incoming connections (parent tasks)
    const parentConnections = graph.connections.filter((c) => c.to === taskId)
    const parentIds = parentConnections.map((c) => c.from)

    // Get completed parent tasks
    for (const parentId of parentIds) {
      const parentTask = graph.nodes.find((n) => n.id === parentId)
      if (parentTask && parentTask.status === 'completed') {
        dependencies.push({
          taskId: parentTask.id,
          taskTitle: parentTask.title,
          summary: `Completed: ${parentTask.description}`
          // In full implementation, would load from task logs/summary
        })
      }
    }

    return dependencies
  }

  /**
   * Propose an intention to the harness.
   */
  async proposeIntention(intention?: string): Promise<boolean> {
    if (this.state.status !== 'loading_context' && this.state.status !== 'approved') {
      return false
    }

    this.state.status = 'proposing_intention'

    // Generate intention if not provided
    const intentionText = intention || this.generateIntention()
    this.state.intention = intentionText

    // Send to harness
    const harness = getHarnessAgent()
    harness.receiveIntention(this.state.agentId!, this.state.taskId, intentionText)

    this.state.status = 'awaiting_approval'
    this.emit('task-agent:intention-proposed', intentionText)

    return true
  }

  /**
   * Generate an intention based on task context.
   */
  private generateIntention(): string {
    const context = this.state.context!
    const task = this.state.task!

    let intention = `INTENTION: Implement "${task.title}"`

    if (task.description) {
      intention += `\n\n${task.description}`
    }

    if (context.dependencyContext.length > 0) {
      intention += `\n\nBuilding on completed work from: ${context.dependencyContext
        .map((d) => d.taskTitle)
        .join(', ')}`
    }

    return intention
  }

  /**
   * Receive approval decision from harness.
   */
  receiveApproval(decision: IntentionDecision): void {
    if (this.state.status !== 'awaiting_approval') {
      return
    }

    this.state.approval = decision

    if (decision.approved) {
      this.state.status = 'approved'
      this.emit('task-agent:approved', decision)

      // Update harness
      const harness = getHarnessAgent()
      harness.markTaskWorking(this.state.taskId)

      if (this.config.autoExecute) {
        this.execute()
      }
    } else {
      this.state.status = 'failed'
      this.state.error = decision.reason || 'Intention rejected'
      this.emit('task-agent:rejected', decision)
    }
  }

  /**
   * Execute the approved task.
   * In full implementation, this would invoke Claude API.
   */
  async execute(): Promise<TaskExecutionResult> {
    if (this.state.status !== 'approved') {
      return {
        success: false,
        taskId: this.state.taskId,
        error: 'Task not approved for execution'
      }
    }

    this.state.status = 'working'
    this.emit('task-agent:executing')

    try {
      // In full implementation, this would:
      // 1. Call Claude API with context
      // 2. Apply changes to worktree
      // 3. Commit changes
      // For now, simulate completion

      // Simulate work delay
      await new Promise((resolve) => setTimeout(resolve, 100))

      this.state.status = 'completed'
      this.state.completedAt = new Date().toISOString()

      const result: TaskExecutionResult = {
        success: true,
        taskId: this.state.taskId,
        summary: `Completed: ${this.state.task?.title}`
      }

      this.emit('task-agent:completed', result)
      return result
    } catch (error) {
      this.state.status = 'failed'
      this.state.error = (error as Error).message

      const result: TaskExecutionResult = {
        success: false,
        taskId: this.state.taskId,
        error: this.state.error
      }

      this.emit('task-agent:failed', result)
      return result
    }
  }

  /**
   * Get current task agent state.
   */
  getState(): TaskAgentState {
    return { ...this.state }
  }

  /**
   * Get task agent status.
   */
  getStatus(): TaskAgentStatus {
    return this.state.status
  }

  /**
   * Clean up task agent resources.
   */
  async cleanup(removeWorktree: boolean = false): Promise<void> {
    // Release from pool
    if (this.state.agentId) {
      const pool = getAgentPool()
      pool.terminateAgent(this.state.agentId)
    }

    // Remove worktree if requested (typically on failure for debugging)
    if (removeWorktree && this.state.worktreePath) {
      const gitManager = getGitManager()
      await gitManager.removeWorktree(this.state.worktreePath, true)
    }

    this.emit('task-agent:cleanup')
  }
}

// Factory for creating task agents
export function createTaskAgent(
  featureId: string,
  taskId: string,
  config?: Partial<TaskAgentConfig>
): TaskAgent {
  return new TaskAgent(featureId, taskId, config)
}

// Active task agents registry
const activeTaskAgents: Map<string, TaskAgent> = new Map()

export function registerTaskAgent(agent: TaskAgent): void {
  activeTaskAgents.set(agent.getState().taskId, agent)
}

export function getTaskAgent(taskId: string): TaskAgent | undefined {
  return activeTaskAgents.get(taskId)
}

export function removeTaskAgent(taskId: string): boolean {
  return activeTaskAgents.delete(taskId)
}

export function getAllTaskAgents(): TaskAgent[] {
  return Array.from(activeTaskAgents.values())
}

export function clearTaskAgents(): void {
  for (const agent of activeTaskAgents.values()) {
    agent.cleanup(false)
  }
  activeTaskAgents.clear()
}
