/**
 * DevAgent - Implements individual tasks in isolated worktrees.
 * Follows DAGENT_SPEC section 7 for intention-approval workflow
 * and section 8.3 for worktree lifecycle.
 */

import { EventEmitter } from 'events'
import type { Task, DAGGraph, DevAgentMessage } from '@shared/types'
import type {
  DevAgentState,
  DevAgentStatus,
  DependencyContextEntry,
  DevAgentConfig,
  TaskExecutionResult,
  TaskProgressEvent
} from './dev-types'
import { DEFAULT_DEV_AGENT_STATE, DEFAULT_DEV_AGENT_CONFIG } from './dev-types'
import type { IntentionDecision } from './harness-types'
import { getAgentPool } from './agent-pool'
import { getGitManager } from '../git'
import { getAgentService } from '../agent'
import { RequestPriority } from '../agent/request-types'
import { getFeatureStore } from '../ipc/storage-handlers'
import { getMessageBus, createDevToHarnessMessage } from './message-bus'
import type { IntentionApprovedPayload, IntentionRejectedPayload } from '@shared/types'
import type { FeatureSpec } from './feature-spec-types'
import { getSessionManager } from '../services/session-manager'

export class DevAgent extends EventEmitter {
  private state: DevAgentState
  private config: DevAgentConfig
  private unsubscribe?: () => void
  private isExecuting: boolean = false // Guard against double execute
  private isAborted: boolean = false // Flag for abort during execution

  constructor(featureId: string, taskId: string, config: Partial<DevAgentConfig> = {}) {
    super()
    this.state = {
      ...DEFAULT_DEV_AGENT_STATE,
      featureId,
      taskId
    }
    this.config = { ...DEFAULT_DEV_AGENT_CONFIG, ...config }
    // Set sessionId from config if provided
    this.state.sessionId = config.sessionId || null
  }

  /**
   * Log a message to the task session.
   * Creates session on first message if it doesn't exist.
   */
  private async logToSession(
    direction: DevAgentMessage['direction'],
    type: DevAgentMessage['type'],
    content: string,
    metadata?: DevAgentMessage['metadata']
  ): Promise<void> {
    const store = getFeatureStore()
    if (!store) return

    const message: DevAgentMessage = {
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
   * Log to session if sessionId is set, otherwise fallback to existing logToSession.
   */
  private async logToSessionManager(
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.state.sessionId) {
      // Fallback to existing session logging
      await this.logToSession(
        role === 'user' ? 'task_to_harness' : 'harness_to_task',
        'progress',
        content,
        metadata as DevAgentMessage['metadata']
      )
      return
    }

    try {
      const sessionManager = getSessionManager()
      await sessionManager.addMessage(
        this.state.sessionId,
        this.state.featureId,
        {
          role,
          content,
          metadata: {
            ...metadata,
            agentId: this.state.agentId || undefined,
            taskId: this.state.taskId || undefined,
            internal: true // Mark as internal so it doesn't show in chat UI
          }
        }
      )
    } catch (error) {
      console.warn(`[DevAgent] Failed to log to session: ${(error as Error).message}`)
      // Don't fail execution if logging fails
    }
  }

  /**
   * Initialize dev agent with task and context.
   */
  async initialize(
    task: Task,
    graph: DAGGraph,
    claudeMd?: string,
    featureGoal?: string,
    featureSpec?: FeatureSpec
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
      this.state.error = 'Cannot spawn dev agent - pool limit reached'
      return false
    }

    const agentInfo = pool.registerAgent({
      type: 'task',
      featureId: this.state.featureId,
      taskId: this.state.taskId
    })

    this.state.agentId = agentInfo.id
    pool.updateAgentStatus(agentInfo.id, 'busy', this.state.taskId)

    // Publish task_registered message via MessageBus
    const bus = getMessageBus()
    bus.publish(
      createDevToHarnessMessage(this.state.taskId, agentInfo.id, 'task_registered', {
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

    this.emit('dev-agent:initialized', this.getState())

    // Load context
    this.state.status = 'loading_context'
    const contextLoaded = await this.loadContext(graph, claudeMd, featureGoal, featureSpec)

    if (!contextLoaded) {
      this.state.status = 'failed'
      // Preserve specific error from loadContext, or use generic message
      if (!this.state.error) {
        this.state.error = 'Failed to load task context'
      }
      return false
    }

    // Check for existing session to resume
    const store = getFeatureStore()
    if (store) {
      const existingSession = await store.loadTaskSession(this.state.featureId, this.state.taskId)
      if (existingSession && (existingSession.status === 'active' || existingSession.status === 'paused')) {
        // Resume from existing session
        await this.logToSession('task_to_harness', 'progress', 'Dev agent resuming from existing session')
      } else {
        // Start fresh session
        await this.logToSession('task_to_harness', 'progress', 'Dev agent initialized')
      }
    } else {
      // Log session initialization (no store available)
      await this.logToSession('task_to_harness', 'progress', 'Dev agent initialized')
    }

    return true
  }

  /**
   * Load context for task execution.
   */
  private async loadContext(
    graph: DAGGraph,
    claudeMd?: string,
    featureGoal?: string,
    featureSpec?: FeatureSpec
  ): Promise<boolean> {
    try {
      const task = this.state.task!
      console.log(`[DevAgent] Initializing context for task ${this.state.taskId}`)

      // Create task worktree
      const gitManager = getGitManager()
      console.log(`[DevAgent] Creating worktree for feature ${this.state.featureId}, task ${this.state.taskId}`)
      const worktreeResult = await gitManager.createTaskWorktree(
        this.state.featureId,
        this.state.taskId
      )

      console.log(`[DevAgent] Worktree creation result:`, worktreeResult)

      if (!worktreeResult.success || !worktreeResult.worktreePath) {
        console.error(`[DevAgent] Failed to create worktree: ${worktreeResult.error}`)
        this.state.error = worktreeResult.error || 'Failed to create task worktree'
        return false
      }

      console.log(`[DevAgent] Worktree created at ${worktreeResult.worktreePath}`)
      this.state.worktreePath = worktreeResult.worktreePath

      // Get dependency context from completed parent tasks
      const dependencyContext = this.assembleDependencyContext(graph)

      // Build full context
      this.state.context = {
        claudeMd: claudeMd || null,
        featureGoal: featureGoal || null,
        featureSpec: featureSpec || null,
        taskTitle: task.title,
        taskDescription: task.description,
        dependencyContext,
        qaFeedback: task.qaFeedback || undefined,
        worktreePath: worktreeResult.worktreePath
      }

      this.emit('dev-agent:context-loaded', this.state.context)
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

    // Publish intention_proposed message via MessageBus
    const bus = getMessageBus()
    bus.publish(
      createDevToHarnessMessage(this.state.taskId, this.state.agentId!, 'intention_proposed', {
        intention: intentionText,
        files: undefined
      })
    )

    this.state.status = 'awaiting_approval'
    this.emit('dev-agent:intention-proposed', intentionText)

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
      this.emit('dev-agent:approved', decision)

      // Publish task_working message via MessageBus
      const bus = getMessageBus()
      bus.publish(
        createDevToHarnessMessage(this.state.taskId, this.state.agentId!, 'task_working', {
          startedAt: new Date().toISOString()
        })
      )

      if (this.config.autoExecute) {
        // Note: execute() is not awaited intentionally - it runs in background
        // and emits events when complete. The orchestrator monitors agent status.
        this.execute().catch((error) => {
          console.error(`[DevAgent] Execute failed for task ${this.state.taskId}:`, error)
          this.state.status = 'failed'
          this.state.error = error.message
        })
      }
    } else {
      // Log rejection to session
      await this.logToSession('harness_to_task', 'rejection', decision.reason || 'Intention rejected')

      this.state.status = 'failed'
      this.state.error = decision.reason || 'Intention rejected'
      this.emit('dev-agent:rejected', decision)
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
    // Double execution guard
    if (this.isExecuting) {
      console.warn(`[DevAgent ${this.state.taskId}] execute() called while already executing, ignoring`)
      return {
        success: false,
        taskId: this.state.taskId,
        error: 'Already executing'
      }
    }

    if (this.state.status !== 'approved') {
      console.warn(`[DevAgent ${this.state.taskId}] execute() called in wrong state: ${this.state.status}`)
      return {
        success: false,
        taskId: this.state.taskId,
        error: 'Task not approved for execution'
      }
    }

    this.isExecuting = true
    this.state.status = 'working'
    this.emit('dev-agent:executing')

    // Log execution start (uses SessionManager if sessionId is set)
    await this.logToSessionManager('user', `Starting task execution in worktree: ${this.state.worktreePath}`, {
      executionStart: true
    })

    try {
      // Build execution prompt from context
      const prompt = this.buildExecutionPrompt()

      // Execute via SDK in the task worktree
      const agentService = getAgentService()
      let summary = ''

      console.log(`[DevAgent ${this.state.taskId}] Executing SDK in worktree: ${this.state.worktreePath}`)

      // Verify worktree path exists before executing
      const fs = await import('fs/promises')
      try {
        await fs.access(this.state.worktreePath!)
        const stats = await fs.stat(this.state.worktreePath!)
        console.log(`[DevAgent ${this.state.taskId}] Worktree path verified: isDirectory=${stats.isDirectory()}`)
      } catch (err) {
        console.error(`[DevAgent ${this.state.taskId}] ERROR: Worktree path does not exist: ${this.state.worktreePath}`)
        throw new Error(`Worktree path does not exist: ${this.state.worktreePath}`)
      }

      for await (const event of agentService.streamQuery({
        prompt,
        toolPreset: 'taskAgent',
        permissionMode: 'bypassPermissions',
        cwd: this.state.worktreePath!,
        agentType: 'task',
        agentId: `dev-${this.state.taskId}`,
        taskId: this.state.taskId,
        priority: RequestPriority.DEV
      })) {
        // Emit progress events
        if (event.type === 'message' && event.message?.type === 'assistant') {
          const progressEvent: TaskProgressEvent = {
            type: 'progress',
            content: event.message.content
          }
          this.emit('dev-agent:progress', progressEvent)
          summary = event.message.content
        }

        if (event.type === 'tool_use' && event.message) {
          const progressEvent: TaskProgressEvent = {
            type: 'tool_use',
            content: `Using tool: ${event.message.toolName}`,
            toolName: event.message.toolName,
            toolInput: event.message.toolInput
          }
          this.emit('dev-agent:tool-use', progressEvent)

          // Log tool usage to session
          await this.logToSessionManager('assistant', `Using tool: ${event.message.toolName}`, {
            toolName: event.message.toolName,
            toolUse: true
          })
        }

        if (event.type === 'tool_result' && event.message) {
          const progressEvent: TaskProgressEvent = {
            type: 'tool_result',
            content: event.message.content,
            toolName: event.message.toolName,
            toolResult: event.message.toolResult
          }
          this.emit('dev-agent:tool-result', progressEvent)
        }

        if (event.type === 'message' && event.message?.type === 'result') {
          summary = event.message.content
        }

        if (event.type === 'error') {
          throw new Error(event.error)
        }
      }

      // Dev work complete - changes remain uncommitted for QA review
      // Note: QA agent will commit changes if review passes
      console.log(`[DevAgent ${this.state.taskId}] SDK stream finished, dev work complete`)

      // Set status to ready_for_merge - orchestrator will handle QA and then merge
      console.log(`[DevAgent ${this.state.taskId}] Setting status to ready_for_qa`)
      this.state.status = 'ready_for_merge'

      const completionSummary = summary || `Completed: ${this.state.task?.title}`

      // Log completion to session (uses SessionManager if sessionId is set)
      await this.logToSessionManager('assistant', `Execution complete: ${completionSummary}`, {
        executionComplete: true,
        success: true
      })

      // Publish task_ready_for_merge message via MessageBus
      // Note: No commitHash - QA will commit if review passes
      const completionBus = getMessageBus()
      completionBus.publish(
        createDevToHarnessMessage(this.state.taskId, this.state.agentId!, 'task_ready_for_merge', {
          summary: completionSummary
        })
      )

      const result: TaskExecutionResult = {
        success: true,
        taskId: this.state.taskId,
        summary: completionSummary
      }

      // Emit ready_for_merge event - orchestrator subscribes to this
      this.emit('dev-agent:ready_for_merge', result)
      return result
    } catch (error) {
      this.state.status = 'failed'
      this.state.error = (error as Error).message

      // Log error to session (uses SessionManager if sessionId is set)
      await this.logToSessionManager('assistant', `Execution failed: ${this.state.error}`, {
        executionComplete: true,
        success: false,
        error: this.state.error
      })
      await this.updateSessionStatus('failed')

      // Publish task_failed message via MessageBus
      const failureBus = getMessageBus()
      failureBus.publish(
        createDevToHarnessMessage(this.state.taskId, this.state.agentId!, 'task_failed', {
          error: this.state.error
        })
      )

      const result: TaskExecutionResult = {
        success: false,
        taskId: this.state.taskId,
        error: this.state.error
      }

      this.emit('dev-agent:failed', result)
      return result
    } finally {
      this.isExecuting = false
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

    // Include feature specification for broader context
    if (context.featureSpec) {
      parts.push('## Feature Specification')
      parts.push('This task is part of a larger feature. Keep these goals in mind:')
      parts.push('')

      if (context.featureSpec.goals.length > 0) {
        parts.push('### Goals')
        for (const goal of context.featureSpec.goals) {
          parts.push(`- ${goal}`)
        }
        parts.push('')
      }

      if (context.featureSpec.requirements.length > 0) {
        parts.push('### Requirements')
        for (const req of context.featureSpec.requirements) {
          const status = req.completed ? '✓' : '○'
          parts.push(`- ${status} ${req.id}: ${req.description}`)
        }
        parts.push('')
      }

      if (context.featureSpec.constraints.length > 0) {
        parts.push('### Constraints')
        for (const constraint of context.featureSpec.constraints) {
          parts.push(`- ${constraint}`)
        }
        parts.push('')
      }
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

    // Include QA feedback if this is a rework cycle
    if (context.qaFeedback) {
      parts.push(
        '## QA Feedback (IMPORTANT - Fix these issues)',
        'This task failed QA review. You MUST address these issues:',
        '',
        context.qaFeedback,
        ''
      )
    }

    parts.push(
      '## Instructions',
      '1. Implement the task as described above',
      '2. Follow the project guidelines from CLAUDE.md',
      '3. Build on completed dependency work where applicable',
      '4. Make all necessary file changes to complete this task',
      '5. IMPORTANT: Work in the current directory (.) - do NOT use absolute paths or navigate elsewhere',
      context.qaFeedback ? '6. Address ALL QA feedback items' : '',
      ''
    )

    return parts.join('\n')
  }


  /**
   * Initialize dev agent for iteration mode.
   * Simplified initialization that uses existing worktree and does not register with MessageBus or agent pool.
   * Used by TaskController for Ralph Loop iterations after the first iteration.
   */
  async initializeForIteration(
    task: Task,
    graph: DAGGraph,
    worktreePath: string,
    claudeMd?: string,
    featureGoal?: string,
    featureSpec?: FeatureSpec
  ): Promise<boolean> {
    if (this.state.status !== 'initializing') {
      return false
    }

    this.state.task = task
    this.state.startedAt = new Date().toISOString()
    this.state.worktreePath = worktreePath

    // Set a local agent ID (not registered with pool)
    this.state.agentId = `iteration-${this.state.taskId}-${Date.now()}`

    // Get dependency context from completed parent tasks
    const dependencyContext = this.assembleDependencyContext(graph)

    // Build context using existing worktree path
    this.state.context = {
      claudeMd: claudeMd || null,
      featureGoal: featureGoal || null,
      featureSpec: featureSpec || null,
      taskTitle: task.title,
      taskDescription: task.description,
      dependencyContext,
      qaFeedback: task.qaFeedback || undefined,
      worktreePath
    }

    this.state.status = 'loading_context'
    this.emit('dev-agent:initialized', this.getState())
    this.emit('dev-agent:context-loaded', this.state.context)

    return true
  }

  /**
   * Execute iteration directly without intention-approval workflow.
   * Bypasses MessageBus publishing and runs SDK with provided prompt.
   * Used by TaskController for Ralph Loop iterations.
   */
  async executeIteration(prompt: string): Promise<TaskExecutionResult> {
    // Double execution guard
    if (this.isExecuting) {
      console.warn(`[DevAgent ${this.state.taskId}] executeIteration() called while already executing, ignoring`)
      return {
        success: false,
        taskId: this.state.taskId,
        error: 'Already executing'
      }
    }

    if (this.state.status !== 'loading_context') {
      console.warn(`[DevAgent ${this.state.taskId}] executeIteration() called in wrong state: ${this.state.status}`)
      return {
        success: false,
        taskId: this.state.taskId,
        error: `Invalid state for iteration: ${this.state.status}`
      }
    }

    this.isExecuting = true
    this.state.status = 'working'
    this.emit('dev-agent:executing')

    // Log iteration start to session
    await this.logToSessionManager('user', `Starting iteration in worktree: ${this.state.worktreePath}`, {
      iterationStart: true
    })

    try {
      // Execute via SDK in the task worktree
      const agentService = getAgentService()
      let summary = ''

      console.log(`[DevAgent ${this.state.taskId}] Executing iteration in worktree: ${this.state.worktreePath}`)
      console.log(`[DevAgent ${this.state.taskId}] Prompt length: ${prompt.length} chars`)
      console.log(`[DevAgent ${this.state.taskId}] Prompt preview: ${prompt.substring(0, 200)}...`)

      // Verify worktree path exists before executing
      const fs = await import('fs/promises')
      try {
        await fs.access(this.state.worktreePath!)
        const stats = await fs.stat(this.state.worktreePath!)
        console.log(`[DevAgent ${this.state.taskId}] Worktree path verified: isDirectory=${stats.isDirectory()}`)
      } catch (err) {
        console.error(`[DevAgent ${this.state.taskId}] ERROR: Worktree path does not exist: ${this.state.worktreePath}`)
        throw new Error(`Worktree path does not exist: ${this.state.worktreePath}`)
      }

      let eventCount = 0
      let toolUseCount = 0
      // Track cumulative token usage for this iteration
      let cumulativeInputTokens = 0
      let cumulativeOutputTokens = 0

      for await (const event of agentService.streamQuery({
        prompt,
        toolPreset: 'taskAgent',
        permissionMode: 'bypassPermissions',
        cwd: this.state.worktreePath!,
        agentType: 'task',
        agentId: `dev-iteration-${this.state.taskId}`,
        taskId: this.state.taskId,
        priority: RequestPriority.DEV
      })) {
        eventCount++
        // Check for abort flag
        if (this.isAborted) {
          throw new Error('Execution aborted')
        }

        // Track token usage from events
        if (event.usage) {
          cumulativeInputTokens = event.usage.inputTokens
          cumulativeOutputTokens = event.usage.outputTokens
        }

        // Log all events for debugging
        console.log(`[DevAgent ${this.state.taskId}] Event ${eventCount}: type=${event.type}, msgType=${event.message?.type || 'N/A'}`)

        // Emit progress events
        if (event.type === 'message' && event.message?.type === 'assistant') {
          const progressEvent: TaskProgressEvent = {
            type: 'progress',
            content: event.message.content
          }
          this.emit('dev-agent:progress', progressEvent)
          summary = event.message.content
          console.log(`[DevAgent ${this.state.taskId}] Assistant message (${event.message.content.length} chars): ${event.message.content.substring(0, 100)}...`)
        }

        if (event.type === 'tool_use' && event.message) {
          toolUseCount++
          const progressEvent: TaskProgressEvent = {
            type: 'tool_use',
            content: `Using tool: ${event.message.toolName}`,
            toolName: event.message.toolName,
            toolInput: event.message.toolInput
          }
          this.emit('dev-agent:tool-use', progressEvent)
          console.log(`[DevAgent ${this.state.taskId}] Tool use #${toolUseCount}: ${event.message.toolName}`)

          // Log tool usage to session
          await this.logToSessionManager('assistant', `Using tool: ${event.message.toolName}`, {
            toolName: event.message.toolName,
            toolUse: true
          })
        }

        if (event.type === 'tool_result' && event.message) {
          const progressEvent: TaskProgressEvent = {
            type: 'tool_result',
            content: event.message.content,
            toolName: event.message.toolName,
            toolResult: event.message.toolResult
          }
          this.emit('dev-agent:tool-result', progressEvent)
        }

        if (event.type === 'message' && event.message?.type === 'result') {
          summary = event.message.content
          console.log(`[DevAgent ${this.state.taskId}] Result: ${event.message.content.substring(0, 200)}...`)
        }

        if (event.type === 'error') {
          console.error(`[DevAgent ${this.state.taskId}] Error event: ${event.error}`)
          throw new Error(event.error)
        }
      }

      const totalTokens = cumulativeInputTokens + cumulativeOutputTokens
      console.log(`[DevAgent ${this.state.taskId}] Stream complete: ${eventCount} events, ${toolUseCount} tool uses, ${totalTokens} tokens (${cumulativeInputTokens} in, ${cumulativeOutputTokens} out)`)

      console.log(`[DevAgent ${this.state.taskId}] Iteration complete`)
      this.state.status = 'ready_for_merge'

      const result: TaskExecutionResult = {
        success: true,
        taskId: this.state.taskId,
        summary: summary || `Iteration completed: ${this.state.task?.title}`,
        tokenUsage: {
          inputTokens: cumulativeInputTokens,
          outputTokens: cumulativeOutputTokens,
          totalTokens
        }
      }

      // Log iteration completion to session
      await this.logToSessionManager('assistant', `Iteration complete: ${result.summary}`, {
        iterationComplete: true,
        success: result.success,
        tokenUsage: result.tokenUsage
      })

      this.emit('dev-agent:ready_for_merge', result)
      return result
    } catch (error) {
      this.state.status = 'failed'
      this.state.error = (error as Error).message

      const result: TaskExecutionResult = {
        success: false,
        taskId: this.state.taskId,
        error: this.state.error
      }

      this.emit('dev-agent:failed', result)
      return result
    } finally {
      this.isExecuting = false
    }
  }

  /**
   * Mark task as completed after successful merge.
   * Called by orchestrator after merge finishes.
   */
  async markCompleted(): Promise<void> {
    if (this.state.status !== 'ready_for_merge') {
      console.warn(
        `[DevAgent ${this.state.taskId}] markCompleted called in unexpected state: ${this.state.status}`
      )
      return
    }

    console.log(`[DevAgent ${this.state.taskId}] Marking as completed after merge`)
    this.state.status = 'completed'
    this.state.completedAt = new Date().toISOString()

    // Update session status
    await this.updateSessionStatus('completed')

    // Publish final completion message
    const bus = getMessageBus()
    bus.publish(
      createDevToHarnessMessage(this.state.taskId, this.state.agentId!, 'task_completed', {
        summary: `Completed and merged: ${this.state.task?.title}`
      })
    )

    this.emit('dev-agent:completed', {
      success: true,
      taskId: this.state.taskId,
      summary: `Completed and merged: ${this.state.task?.title}`
    })
  }

  /**
   * Abort the current execution.
   */
  abort(): void {
    this.isAborted = true
    if (this.state.status === 'working') {
      const agentService = getAgentService()
      agentService.abort()
      this.state.status = 'failed'
      this.state.error = 'Execution aborted'
      this.emit('dev-agent:aborted')
    }
  }

  /**
   * Get current dev agent state.
   */
  getState(): DevAgentState {
    return { ...this.state }
  }

  /**
   * Get dev agent status.
   */
  getStatus(): DevAgentStatus {
    return this.state.status
  }

  /**
   * Clean up dev agent resources.
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

    this.emit('dev-agent:cleanup')
  }
}

// Factory for creating dev agents
export function createDevAgent(
  featureId: string,
  taskId: string,
  config?: Partial<DevAgentConfig>
): DevAgent {
  return new DevAgent(featureId, taskId, config)
}

// Active dev agents registry
const activeDevAgents: Map<string, DevAgent> = new Map()

export function registerDevAgent(agent: DevAgent): void {
  activeDevAgents.set(agent.getState().taskId, agent)
}

export function getDevAgent(taskId: string): DevAgent | undefined {
  return activeDevAgents.get(taskId)
}

export function removeDevAgent(taskId: string): boolean {
  return activeDevAgents.delete(taskId)
}

export function getAllDevAgents(): DevAgent[] {
  return Array.from(activeDevAgents.values())
}

export function clearDevAgents(): void {
  for (const agent of activeDevAgents.values()) {
    agent.cleanup(false)
  }
  activeDevAgents.clear()
}
