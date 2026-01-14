/**
 * TaskAgent - Implements individual tasks in isolated worktrees.
 * Follows DAGENT_SPEC section 7 for intention-approval workflow
 * and section 8.3 for worktree lifecycle.
 */

import { EventEmitter } from 'events'
import { simpleGit } from 'simple-git'
import type { Task, DAGGraph, TaskAgentMessage } from '@shared/types'
import type {
  TaskAgentState,
  TaskAgentStatus,
  DependencyContextEntry,
  TaskAgentConfig,
  TaskExecutionResult,
  TaskProgressEvent
} from './task-types'
import { DEFAULT_TASK_AGENT_STATE, DEFAULT_TASK_AGENT_CONFIG } from './task-types'
import type { IntentionDecision } from './harness-types'
import { getAgentPool } from './agent-pool'
import { getHarnessAgent } from './harness-agent'
import { getGitManager } from '../git'
import { getAgentService } from '../agent'
import { getFeatureStore } from '../ipc/storage-handlers'
import { getMessageBus, createTaskToHarnessMessage } from './message-bus'
import type { IntentionApprovedPayload, IntentionRejectedPayload } from '@shared/types'

export class TaskAgent extends EventEmitter {
  private state: TaskAgentState
  private config: TaskAgentConfig
  private unsubscribe?: () => void

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
   * Log a message to the task session.
   * Creates session on first message if it doesn't exist.
   */
  private async logToSession(
    direction: TaskAgentMessage['direction'],
    type: TaskAgentMessage['type'],
    content: string,
    metadata?: TaskAgentMessage['metadata']
  ): Promise<void> {
    const store = getFeatureStore()
    if (!store) return

    const message: TaskAgentMessage = {
      timestamp: new Date().toISOString(),
      direction,
      type,
      content,
      ...(metadata && { metadata })
    }

    await store.appendSessionMessage(this.state.featureId, this.state.taskId, message, {
      agentId: this.state.agentId || 'unknown',
      status: 'active'
    })
  }

  /**
   * Update the session status (completed or failed).
   */
  private async updateSessionStatus(status: 'completed' | 'failed'): Promise<void> {
    const store = getFeatureStore()
    if (!store) return

    const session = await store.loadTaskSession(this.state.featureId, this.state.taskId)
    if (!session) return

    session.status = status
    session.completedAt = new Date().toISOString()
    await store.saveTaskSession(this.state.featureId, this.state.taskId, session)
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

    // Publish task_registered message (dual-write during migration)
    const bus = getMessageBus()
    bus.publish(
      createTaskToHarnessMessage(this.state.taskId, agentInfo.id, 'task_registered', {
        taskId: this.state.taskId
      })
    )

    // Subscribe to approval/rejection messages for this task
    this.unsubscribe = bus.subscribeToTask(this.state.taskId, (msg) => {
      if (msg.type === 'intention_approved' && msg.to.id === this.state.agentId) {
        this.handleApprovalMessage(msg.payload as IntentionApprovedPayload)
      } else if (msg.type === 'intention_rejected' && msg.to.id === this.state.agentId) {
        this.handleRejectionMessage(msg.payload as IntentionRejectedPayload)
      }
    })

    this.emit('task-agent:initialized', this.getState())

    // Load context
    this.state.status = 'loading_context'
    const contextLoaded = await this.loadContext(graph, claudeMd, featureGoal)

    if (!contextLoaded) {
      this.state.status = 'failed'
      this.state.error = 'Failed to load task context'
      return false
    }

    // Check for existing session to resume
    const store = getFeatureStore()
    if (store) {
      const existingSession = await store.loadTaskSession(this.state.featureId, this.state.taskId)
      if (existingSession && (existingSession.status === 'active' || existingSession.status === 'paused')) {
        // Resume from existing session
        await this.logToSession('task_to_harness', 'progress', 'Task agent resuming from existing session')
      } else {
        // Start fresh session
        await this.logToSession('task_to_harness', 'progress', 'Task agent initialized')
      }
    } else {
      // Log session initialization (no store available)
      await this.logToSession('task_to_harness', 'progress', 'Task agent initialized')
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

    // Log intention to session
    await this.logToSession('task_to_harness', 'intention', intentionText)

    // Publish intention_proposed message (dual-write during migration)
    const bus = getMessageBus()
    bus.publish(
      createTaskToHarnessMessage(this.state.taskId, this.state.agentId!, 'intention_proposed', {
        intention: intentionText,
        files: undefined
      })
    )

    // Send to harness (backward compatibility - direct call still works)
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
  async receiveApproval(decision: IntentionDecision): Promise<void> {
    if (this.state.status !== 'awaiting_approval') {
      return
    }

    this.state.approval = decision

    if (decision.approved) {
      // Log approval to session
      await this.logToSession('harness_to_task', 'approval', decision.notes || 'Approved')

      this.state.status = 'approved'
      this.emit('task-agent:approved', decision)

      // Update harness
      const harness = getHarnessAgent()
      harness.markTaskWorking(this.state.taskId)

      if (this.config.autoExecute) {
        this.execute()
      }
    } else {
      // Log rejection to session
      await this.logToSession('harness_to_task', 'rejection', decision.reason || 'Intention rejected')

      this.state.status = 'failed'
      this.state.error = decision.reason || 'Intention rejected'
      this.emit('task-agent:rejected', decision)
    }
  }

  /**
   * Handle approval message from MessageBus.
   * Converts payload to IntentionDecision and delegates to receiveApproval.
   */
  private handleApprovalMessage(payload: IntentionApprovedPayload): void {
    const decision: IntentionDecision = {
      approved: true,
      type: payload.type,
      notes: payload.notes
    }
    this.receiveApproval(decision)
  }

  /**
   * Handle rejection message from MessageBus.
   * Converts payload to IntentionDecision and delegates to receiveApproval.
   */
  private handleRejectionMessage(payload: IntentionRejectedPayload): void {
    const decision: IntentionDecision = {
      approved: false,
      type: 'rejected',
      reason: payload.reason
    }
    this.receiveApproval(decision)
  }

  /**
   * Execute the approved task using Claude Agent SDK.
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

    // Log execution start
    await this.logToSession('task_to_harness', 'progress', 'Starting task execution')

    try {
      // Build execution prompt from context
      const prompt = this.buildExecutionPrompt()

      // Execute via SDK in the task worktree
      const agentService = getAgentService()
      let summary = ''

      for await (const event of agentService.streamQuery({
        prompt,
        toolPreset: 'taskAgent',
        permissionMode: 'bypassPermissions',
        cwd: this.state.worktreePath!
      })) {
        // Emit progress events
        if (event.type === 'message' && event.message?.type === 'assistant') {
          const progressEvent: TaskProgressEvent = {
            type: 'progress',
            content: event.message.content
          }
          this.emit('task-agent:progress', progressEvent)
          summary = event.message.content
        }

        if (event.type === 'tool_use' && event.message) {
          const progressEvent: TaskProgressEvent = {
            type: 'tool_use',
            content: `Using tool: ${event.message.toolName}`,
            toolName: event.message.toolName,
            toolInput: event.message.toolInput
          }
          this.emit('task-agent:tool-use', progressEvent)
        }

        if (event.type === 'tool_result' && event.message) {
          const progressEvent: TaskProgressEvent = {
            type: 'tool_result',
            content: event.message.content,
            toolName: event.message.toolName,
            toolResult: event.message.toolResult
          }
          this.emit('task-agent:tool-result', progressEvent)
        }

        if (event.type === 'message' && event.message?.type === 'result') {
          summary = event.message.content
        }

        if (event.type === 'error') {
          throw new Error(event.error)
        }
      }

      // Commit changes after successful execution
      const commitResult = await this.commitChanges()

      this.state.status = 'completed'
      this.state.completedAt = new Date().toISOString()

      const completionSummary = summary || `Completed: ${this.state.task?.title}`

      // Log completion and update session status
      await this.logToSession('task_to_harness', 'completion', completionSummary)
      await this.updateSessionStatus('completed')

      const result: TaskExecutionResult = {
        success: true,
        taskId: this.state.taskId,
        summary: completionSummary,
        commitHash: commitResult.commitHash,
        filesChanged: commitResult.filesChanged
      }

      this.emit('task-agent:completed', result)
      return result
    } catch (error) {
      this.state.status = 'failed'
      this.state.error = (error as Error).message

      // Log error and update session status
      await this.logToSession('task_to_harness', 'error', this.state.error)
      await this.updateSessionStatus('failed')

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
   * Build execution prompt from task context.
   */
  private buildExecutionPrompt(): string {
    const context = this.state.context!
    const task = this.state.task!
    const approval = this.state.approval

    const parts: string[] = ['# Task Implementation Request', '']

    if (context.claudeMd) {
      parts.push('## Project Guidelines (CLAUDE.md)', context.claudeMd, '')
    }

    if (context.featureGoal) {
      parts.push('## Feature Goal', context.featureGoal, '')
    }

    parts.push(
      '## Task to Implement',
      `**Title:** ${task.title}`,
      `**Description:** ${task.description || 'No additional description'}`,
      ''
    )

    if (context.dependencyContext.length > 0) {
      parts.push(
        '## Context from Completed Dependencies',
        ...context.dependencyContext.map(
          (d) => `### ${d.taskTitle}\n${d.summary}${d.keyFiles ? `\nKey files: ${d.keyFiles.join(', ')}` : ''}`
        ),
        ''
      )
    }

    if (approval?.notes) {
      parts.push('## Approval Notes', approval.notes, '')
    }

    parts.push(
      '## Instructions',
      '1. Implement the task as described above',
      '2. Follow the project guidelines from CLAUDE.md',
      '3. Build on completed dependency work where applicable',
      '4. Make all necessary file changes to complete this task',
      ''
    )

    return parts.join('\n')
  }

  /**
   * Commit changes to the task branch after execution.
   */
  private async commitChanges(): Promise<{ commitHash?: string; filesChanged?: number }> {
    if (!this.state.worktreePath) {
      return {}
    }

    try {
      // Create a git instance for the task worktree
      const git = simpleGit({ baseDir: this.state.worktreePath })

      // Check for changes
      const status = await git.status()
      if (!status.modified.length && !status.staged.length && !status.not_added.length) {
        return { filesChanged: 0 }
      }

      const filesChanged = status.modified.length + status.staged.length + status.not_added.length

      // Stage all changes
      await git.add('-A')

      // Commit with task info
      const taskId = this.state.taskId
      const taskTitle = this.state.task?.title || 'task'
      const commitMessage = `feat(${taskId}): ${taskTitle}`

      const commitResult = await git.commit(commitMessage)

      return { commitHash: commitResult.commit, filesChanged }
    } catch (error) {
      // Log but don't fail - changes were made even if commit fails
      console.error('Failed to commit task changes:', error)
      return {}
    }
  }

  /**
   * Abort the current execution.
   */
  abort(): void {
    if (this.state.status === 'working') {
      const agentService = getAgentService()
      agentService.abort()
      this.state.status = 'failed'
      this.state.error = 'Execution aborted'
      this.emit('task-agent:aborted')
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
    // Unsubscribe from message bus
    this.unsubscribe?.()

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
