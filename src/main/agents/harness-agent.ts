import { EventEmitter } from 'events'
import type { DAGGraph, LogEntry, LogEntryType } from '@shared/types'
import type { AgentInfo } from './types'
import type {
  HarnessState,
  HarnessStatus,
  TaskExecutionState,
  PendingIntention,
  HarnessMessage,
  IntentionDecision,
  IntentionReviewContext
} from './harness-types'
import { DEFAULT_HARNESS_STATE } from './harness-types'
import { getAgentPool } from './agent-pool'
import { getAgentService } from '../agent'

export class HarnessAgent extends EventEmitter {
  private state: HarnessState
  private agentInfo: AgentInfo | null = null

  constructor() {
    super()
    this.state = {
      ...DEFAULT_HARNESS_STATE,
      activeTasks: new Map(),
      pendingIntentions: new Map(),
      messageHistory: []
    }
  }

  /**
   * Initialize harness for a feature execution.
   */
  async initialize(
    featureId: string,
    featureGoal: string,
    graph: DAGGraph,
    claudeMd?: string,
    projectRoot?: string
  ): Promise<boolean> {
    if (this.state.status !== 'idle') {
      this.log('warning', 'Cannot initialize - harness not idle')
      return false
    }

    // Register harness agent in pool
    const pool = getAgentPool()
    if (!pool.canSpawn('harness')) {
      this.log('error', 'Cannot spawn harness - pool limit reached')
      return false
    }

    this.agentInfo = pool.registerAgent({
      type: 'harness',
      featureId
    })

    this.state = {
      status: 'idle',
      featureId,
      featureGoal,
      claudeMd: claudeMd || null,
      graph,
      activeTasks: new Map(),
      pendingIntentions: new Map(),
      messageHistory: [],
      startedAt: null,
      stoppedAt: null,
      projectRoot: projectRoot || null
    }

    this.log('info', `Harness initialized for feature: ${featureId}`)
    return true
  }

  /**
   * Start execution - harness becomes active.
   */
  start(): boolean {
    if (this.state.status !== 'idle') {
      this.log('warning', `Cannot start - status is ${this.state.status}`)
      return false
    }

    this.state.status = 'active'
    this.state.startedAt = new Date().toISOString()

    if (this.agentInfo) {
      getAgentPool().updateAgentStatus(this.agentInfo.id, 'busy')
    }

    this.log('info', 'Harness execution started')
    this.emit('harness:started')
    return true
  }

  /**
   * Pause execution.
   */
  pause(): boolean {
    if (this.state.status !== 'active') {
      return false
    }

    this.state.status = 'paused'
    this.log('info', 'Harness execution paused')
    this.emit('harness:paused')
    return true
  }

  /**
   * Resume execution.
   */
  resume(): boolean {
    if (this.state.status !== 'paused') {
      return false
    }

    this.state.status = 'active'
    this.log('info', 'Harness execution resumed')
    this.emit('harness:resumed')
    return true
  }

  /**
   * Stop execution.
   */
  stop(): boolean {
    if (this.state.status === 'idle' || this.state.status === 'stopped') {
      return false
    }

    this.state.status = 'stopped'
    this.state.stoppedAt = new Date().toISOString()

    if (this.agentInfo) {
      getAgentPool().updateAgentStatus(this.agentInfo.id, 'idle')
    }

    this.log('info', 'Harness execution stopped')
    this.emit('harness:stopped')
    return true
  }

  /**
   * Get current harness state.
   */
  getState(): Omit<HarnessState, 'activeTasks' | 'pendingIntentions'> & {
    activeTasks: TaskExecutionState[]
    pendingIntentions: PendingIntention[]
  } {
    return {
      ...this.state,
      activeTasks: Array.from(this.state.activeTasks.values()),
      pendingIntentions: Array.from(this.state.pendingIntentions.values())
    }
  }

  /**
   * Get harness status.
   */
  getStatus(): HarnessStatus {
    return this.state.status
  }

  /**
   * Register a task agent assignment.
   */
  registerTaskAssignment(taskId: string, agentId: string): void {
    const taskState: TaskExecutionState = {
      taskId,
      agentId,
      status: 'assigned',
      startedAt: new Date().toISOString()
    }

    this.state.activeTasks.set(taskId, taskState)
    this.log('task_started', `Task ${taskId} assigned to agent ${agentId}`, taskId, agentId)
    this.emit('task:assigned', taskState)
  }

  /**
   * Receive an intention from a task agent.
   */
  receiveIntention(agentId: string, taskId: string, intention: string, files?: string[]): void {
    const pending: PendingIntention = {
      agentId,
      taskId,
      intention,
      files,
      receivedAt: new Date().toISOString()
    }

    this.state.pendingIntentions.set(taskId, pending)

    // Update task execution state
    const taskState = this.state.activeTasks.get(taskId)
    if (taskState) {
      taskState.status = 'intention_pending'
      taskState.intention = intention
    }

    this.log('intention_received', intention, taskId, agentId)
    this.emit('intention:received', pending)
  }

  /**
   * Process and decide on a pending intention.
   * Returns the decision for the task agent.
   */
  async processIntention(taskId: string): Promise<IntentionDecision | null> {
    const pending = this.state.pendingIntentions.get(taskId)
    if (!pending) {
      return null
    }

    // Find the task in the graph
    const task = this.state.graph?.nodes.find((n) => n.id === taskId)
    if (!task) {
      return {
        approved: false,
        type: 'rejected',
        reason: 'Task not found in graph'
      }
    }

    // Build review context
    const context: IntentionReviewContext = {
      intention: pending,
      task,
      graph: this.state.graph!,
      claudeMd: this.state.claudeMd,
      featureGoal: this.state.featureGoal,
      otherActiveTasks: Array.from(this.state.activeTasks.values()).filter(
        (t) => t.taskId !== taskId
      ),
      completedTasks: this.state.graph!.nodes.filter((n) => n.status === 'completed')
    }

    // Use SDK for intelligent review (falls back to auto-approve if unavailable)
    const decision = await this.reviewIntention(context)

    // Apply decision
    this.applyDecision(taskId, decision)

    return decision
  }

  /**
   * Review an intention using Claude Agent SDK for intelligent analysis.
   */
  private async reviewIntention(context: IntentionReviewContext): Promise<IntentionDecision> {
    // Build context for SDK review
    const taskDeps =
      this.state.graph?.connections.filter((c) => c.to === context.task.id).map((c) => c.from) || []
    const completedDeps = context.completedTasks.filter((t) => taskDeps.includes(t.id))

    // Build the review prompt
    const prompt = this.buildReviewPrompt(context, completedDeps)

    // Try SDK review, fall back to auto-approve if unavailable
    if (!this.state.projectRoot) {
      return this.fallbackApprove(context, completedDeps)
    }

    try {
      const agentService = getAgentService()
      let responseText = ''

      for await (const event of agentService.streamQuery({
        prompt,
        toolPreset: 'harnessAgent',
        permissionMode: 'acceptEdits',
        cwd: this.state.projectRoot
      })) {
        if (event.type === 'message' && event.message?.type === 'assistant') {
          responseText += event.message.content
        }
        if (event.type === 'message' && event.message?.type === 'result') {
          responseText = event.message.content
        }
      }

      // Parse the response to extract decision
      return this.parseReviewResponse(responseText)
    } catch (error) {
      this.log('warning', `SDK review failed, using fallback: ${error}`)
      return this.fallbackApprove(context, completedDeps)
    }
  }

  /**
   * Build the prompt for intention review.
   */
  private buildReviewPrompt(
    context: IntentionReviewContext,
    completedDeps: import('@shared/types').Task[]
  ): string {
    const parts: string[] = [
      '# Intention Review Request',
      '',
      '## Feature Context',
      `Goal: ${context.featureGoal || 'Not specified'}`,
      ''
    ]

    if (context.claudeMd) {
      parts.push('## Project Guidelines (CLAUDE.md)', context.claudeMd, '')
    }

    parts.push(
      '## Task Details',
      `Title: ${context.task.title}`,
      `Description: ${context.task.description || 'None'}`,
      ''
    )

    parts.push('## Proposed Intention', context.intention.intention, '')

    if (context.intention.files?.length) {
      parts.push('## Files to modify', context.intention.files.join('\n'), '')
    }

    if (completedDeps.length > 0) {
      parts.push(
        '## Completed Dependencies',
        completedDeps.map((t) => `- ${t.title}`).join('\n'),
        ''
      )
    }

    if (context.otherActiveTasks.length > 0) {
      parts.push(
        '## Other Active Tasks (avoid conflicts)',
        context.otherActiveTasks.map((t) => `- Task ${t.taskId}: ${t.intention || 'working'}`).join('\n'),
        ''
      )
    }

    parts.push(
      '## Your Task',
      'Review this intention and respond with:',
      '1. APPROVED, APPROVED_WITH_NOTES, or REJECTED',
      '2. Any notes or modifications needed',
      '3. Brief reasoning',
      '',
      'Format your response as:',
      'DECISION: [APPROVED|APPROVED_WITH_NOTES|REJECTED]',
      'NOTES: [any notes]',
      'REASON: [brief reasoning]'
    )

    return parts.join('\n')
  }

  /**
   * Parse SDK response to extract decision.
   */
  private parseReviewResponse(response: string): IntentionDecision {
    const upperResponse = response.toUpperCase()

    // Extract decision
    let approved = true
    let type: IntentionDecision['type'] = 'approved'

    if (upperResponse.includes('REJECTED')) {
      approved = false
      type = 'rejected'
    } else if (upperResponse.includes('APPROVED_WITH_NOTES') || upperResponse.includes('APPROVED WITH NOTES')) {
      type = 'approved_with_notes'
    }

    // Extract notes
    const notesMatch = response.match(/NOTES:\s*(.+?)(?=REASON:|$)/is)
    const reasonMatch = response.match(/REASON:\s*(.+?)$/is)

    const notes = notesMatch?.[1]?.trim() || undefined
    const reason = reasonMatch?.[1]?.trim() || undefined

    if (!approved) {
      return { approved, type, reason: reason || notes || 'Intention rejected by review' }
    }

    return {
      approved,
      type,
      notes: notes || (type === 'approved_with_notes' ? reason : undefined)
    }
  }

  /**
   * Fallback approval when SDK is unavailable.
   */
  private fallbackApprove(
    context: IntentionReviewContext,
    completedDeps: import('@shared/types').Task[]
  ): IntentionDecision {
    const notes: string[] = []

    if (completedDeps.length > 0) {
      notes.push(`Context from completed tasks: ${completedDeps.map((t) => t.title).join(', ')}`)
    }

    if (context.otherActiveTasks.length > 0) {
      notes.push(`Other active tasks: ${context.otherActiveTasks.length}. Avoid conflicts.`)
    }

    return {
      approved: true,
      type: notes.length > 0 ? 'approved_with_notes' : 'approved',
      notes: notes.length > 0 ? notes.join('\n') : undefined
    }
  }

  /**
   * Apply a decision to a pending intention.
   */
  private applyDecision(taskId: string, decision: IntentionDecision): void {
    const pending = this.state.pendingIntentions.get(taskId)
    if (!pending) return

    const taskState = this.state.activeTasks.get(taskId)

    if (decision.approved) {
      if (taskState) {
        taskState.status = 'approved'
        taskState.approvalNotes = decision.notes
      }
      this.log('approval_sent', `Approved: ${decision.type}`, taskId, pending.agentId)
    } else {
      this.log('rejection_sent', `Rejected: ${decision.reason}`, taskId, pending.agentId)
    }

    // Remove from pending
    this.state.pendingIntentions.delete(taskId)

    this.emit('intention:decided', { taskId, decision })
  }

  /**
   * Mark task as working (post-approval).
   */
  markTaskWorking(taskId: string): void {
    const taskState = this.state.activeTasks.get(taskId)
    if (taskState) {
      taskState.status = 'working'
    }
  }

  /**
   * Mark task as merging.
   */
  markTaskMerging(taskId: string): void {
    const taskState = this.state.activeTasks.get(taskId)
    if (taskState) {
      taskState.status = 'merging'
    }
  }

  /**
   * Mark task as completed, remove from active.
   */
  completeTask(taskId: string): void {
    this.state.activeTasks.delete(taskId)
    this.log('task_completed', `Task ${taskId} completed`, taskId)
    this.emit('task:completed', taskId)
  }

  /**
   * Mark task as failed.
   */
  failTask(taskId: string, error: string): void {
    this.state.activeTasks.delete(taskId)
    this.log('task_failed', `Task ${taskId} failed: ${error}`, taskId)
    this.emit('task:failed', { taskId, error })
  }

  /**
   * Reset harness state.
   */
  reset(): void {
    if (this.agentInfo) {
      getAgentPool().terminateAgent(this.agentInfo.id)
    }

    this.state = {
      ...DEFAULT_HARNESS_STATE,
      activeTasks: new Map(),
      pendingIntentions: new Map(),
      messageHistory: []
    }

    this.agentInfo = null
    this.emit('harness:reset')
  }

  /**
   * Get message history.
   */
  getMessageHistory(): HarnessMessage[] {
    return [...this.state.messageHistory]
  }

  /**
   * Convert HarnessMessage to LogEntry for persistence.
   */
  static toLogEntry(msg: HarnessMessage): LogEntry {
    const typeMap: Record<HarnessMessage['type'], LogEntryType> = {
      intention_received: 'intention',
      approval_sent: 'approval',
      rejection_sent: 'rejection',
      task_started: 'task_started',
      task_completed: 'task_completed',
      task_failed: 'task_failed',
      info: 'info',
      warning: 'warning',
      error: 'error'
    }
    return {
      timestamp: msg.timestamp,
      type: typeMap[msg.type],
      agent: 'harness',
      taskId: msg.taskId,
      content: msg.content
    }
  }

  /**
   * Add a log message.
   */
  private log(
    type: HarnessMessage['type'],
    content: string,
    taskId?: string,
    agentId?: string
  ): void {
    const message: HarnessMessage = {
      type,
      content,
      taskId,
      agentId,
      timestamp: new Date().toISOString()
    }

    this.state.messageHistory.push(message)
    this.emit('harness:message', message)
  }
}

// Singleton instance
let harnessInstance: HarnessAgent | null = null

export function getHarnessAgent(): HarnessAgent {
  if (!harnessInstance) {
    harnessInstance = new HarnessAgent()
  }
  return harnessInstance
}

export function resetHarnessAgent(): void {
  if (harnessInstance) {
    harnessInstance.reset()
  }
  harnessInstance = null
}
