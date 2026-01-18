/**
 * Session Manager Service
 *
 * Centralized service for managing conversation sessions across all agent types.
 * Handles session lifecycle, message storage, and automatic checkpoint compaction.
 *
 * Key responsibilities:
 * - Create/load/save sessions
 * - Add messages to sessions
 * - Trigger compaction when token limit approached
 * - Manage session files (chat, checkpoint, context, agent-description)
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type {
  Session,
  ChatSession,
  ChatMessage,
  Checkpoint,
  SessionContext,
  AgentDescription,
  CreateSessionOptions,
  SessionUpdateEvent
} from '../../shared/types/session'
import {
  estimateRequest,
  estimateMessagesTokens,
  formatContextAsPrompt,
  formatCheckpointAsPrompt,
  formatMessagesAsPrompt,
  estimateAgentDescriptionTokens,
  estimateContextTokens,
  estimateCheckpointTokens,
  estimateTokens
} from './token-estimator'
import { BrowserWindow } from 'electron'
import { buildCompactionPrompt, parseCompactionResult } from './compaction-prompts'
import { getAgentService } from '../agent/agent-service'

/**
 * SessionManager handles all session operations.
 */
export class SessionManager {
  private activeSessions: Map<string, Session> = new Map()
  private projectRoot: string
  private compactingSessionIds: Set<string> = new Set()

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
  }

  // ============================================
  // Session Lifecycle
  // ============================================

  /**
   * Get or create a session for a specific context.
   *
   * @param options - Session creation options
   * @returns Session instance
   */
  async getOrCreateSession(options: CreateSessionOptions): Promise<Session> {
    const sessionId = this.buildSessionId(options)

    // Check in-memory cache
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!
    }

    // Try to load from disk
    const loaded = await this.loadSession(sessionId, options.featureId)
    if (loaded) {
      this.activeSessions.set(sessionId, loaded)
      return loaded
    }

    // Create new session
    const session = await this.createSession(options)
    this.activeSessions.set(sessionId, session)

    // Broadcast session created event
    this.broadcastEvent({
      sessionId,
      featureId: options.featureId,
      taskId: options.taskId,
      action: 'created',
      timestamp: new Date().toISOString()
    })

    return session
  }

  /**
   * Create a new session.
   *
   * @param options - Session creation options
   * @returns New session instance
   */
  private async createSession(options: CreateSessionOptions): Promise<Session> {
    const sessionId = this.buildSessionId(options)
    const timestamp = new Date().toISOString()

    const session: Session = {
      id: sessionId,
      type: options.type,
      agentType: options.agentType,
      featureId: options.featureId,
      taskId: options.taskId,
      taskState: options.taskState,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'active',
      files: {
        chat: `chat_${sessionId}.json`,
        checkpoint: `checkpoint_${sessionId}.json`,
        context: `context_${sessionId}.json`,
        agentDescription: `agent-description_${sessionId}.json`
      },
      stats: {
        totalMessages: 0,
        totalTokens: 0,
        totalCompactions: 0
      }
    }

    // Create empty chat session
    const chatSession: ChatSession = {
      messages: [],
      totalMessages: 0
    }

    // Create initial checkpoint
    const checkpoint: Checkpoint = {
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      summary: {
        completed: [],
        inProgress: [],
        pending: [],
        blockers: [],
        decisions: []
      },
      compactionInfo: {
        messagesCompacted: 0,
        oldestMessageTimestamp: timestamp,
        newestMessageTimestamp: timestamp,
        compactedAt: timestamp
      },
      stats: {
        totalCompactions: 0,
        totalMessages: 0,
        totalTokens: 0
      }
    }

    // Save all files
    await this.saveSession(session)
    await this.saveChatSession(session, chatSession)
    await this.saveCheckpoint(session, checkpoint)

    return session
  }

  /**
   * Build consistent session ID from options.
   *
   * Format:
   * - Feature session: "{agentType}-feature-{featureId}"
   * - Task session: "{agentType}-task-{featureId}-{taskId}-{state}"
   */
  private buildSessionId(options: CreateSessionOptions): string {
    const parts = [options.agentType, options.type, options.featureId]

    if (options.type === 'task' && options.taskId) {
      parts.push(options.taskId)
      if (options.taskState) {
        parts.push(options.taskState)
      }
    }

    return parts.join('-')
  }

  /**
   * Get session by ID.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID for file path resolution
   * @returns Session or null if not found
   */
  async getSessionById(sessionId: string, featureId: string): Promise<Session | null> {
    // Check cache
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!
    }

    // Load from disk
    return await this.loadSession(sessionId, featureId)
  }

  // ============================================
  // Message Operations
  // ============================================

  /**
   * Add a message to a session.
   * Automatically triggers compaction if token limit approached.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   * @param message - Message to add (without id and timestamp)
   * @returns Complete message with id and timestamp
   */
  async addMessage(
    sessionId: string,
    featureId: string,
    message: Omit<ChatMessage, 'id' | 'timestamp'>
  ): Promise<ChatMessage> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Create full message
    const fullMessage: ChatMessage = {
      ...message,
      id: randomUUID(),
      timestamp: new Date().toISOString()
    }

    // Load current chat session
    const chatSession = await this.loadChatSession(session)
    if (!chatSession) {
      throw new Error(`Chat session not found for: ${sessionId}`)
    }

    // Add message
    chatSession.messages.push(fullMessage)
    chatSession.totalMessages++
    chatSession.newestMessageTimestamp = fullMessage.timestamp
    if (!chatSession.oldestMessageTimestamp) {
      chatSession.oldestMessageTimestamp = fullMessage.timestamp
    }

    // Update session stats
    session.stats.totalMessages++
    session.updatedAt = new Date().toISOString()

    if (fullMessage.metadata?.tokens) {
      session.stats.totalTokens +=
        fullMessage.metadata.tokens.input + fullMessage.metadata.tokens.output
    }

    // Save updated chat session
    await this.saveChatSession(session, chatSession)
    await this.saveSession(session)

    // Check if compaction needed
    await this.checkAndTriggerCompaction(session)

    // Broadcast message added event
    this.broadcastEvent({
      sessionId,
      featureId,
      taskId: session.taskId,
      action: 'message_added',
      timestamp: fullMessage.timestamp
    })

    return fullMessage
  }

  /**
   * Get recent messages from a session.
   * Returns only user-facing messages (filters out internal ones).
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   * @param limit - Maximum number of messages to return
   * @returns Recent messages
   */
  async getRecentMessages(
    sessionId: string,
    featureId: string,
    limit: number = 10
  ): Promise<ChatMessage[]> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) return []

    const chatSession = await this.loadChatSession(session)
    if (!chatSession) return []

    // Filter out internal messages and get recent ones
    return chatSession.messages
      .filter(m => !m.metadata?.internal)
      .slice(-limit)
  }

  /**
   * Get ALL messages from a session (including internal).
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   * @returns All messages
   */
  async getAllMessages(sessionId: string, featureId: string): Promise<ChatMessage[]> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) return []

    const chatSession = await this.loadChatSession(session)
    if (!chatSession) return []

    return chatSession.messages
  }

  /**
   * Clear all messages from a session.
   * Useful for reset operations.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   */
  async clearMessages(sessionId: string, featureId: string): Promise<void> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) return

    const chatSession: ChatSession = {
      messages: [],
      totalMessages: 0
    }

    session.stats.totalMessages = 0
    session.stats.totalTokens = 0
    session.updatedAt = new Date().toISOString()

    await this.saveChatSession(session, chatSession)
    await this.saveSession(session)
  }

  // ============================================
  // Checkpoint Operations
  // ============================================

  /**
   * Get current checkpoint for a session.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   * @returns Checkpoint or null
   */
  async getCheckpoint(sessionId: string, featureId: string): Promise<Checkpoint | null> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) return null

    return await this.loadCheckpoint(session)
  }

  /**
   * Update checkpoint for a session.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   * @param checkpoint - New checkpoint data
   */
  async updateCheckpoint(
    sessionId: string,
    featureId: string,
    checkpoint: Checkpoint
  ): Promise<void> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    checkpoint.updatedAt = new Date().toISOString()
    session.updatedAt = new Date().toISOString()

    await this.saveCheckpoint(session, checkpoint)
    await this.saveSession(session)
  }

  /**
   * Get compaction metrics for a session.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   * @returns Compaction metrics or null if session not found
   */
  async getCompactionMetrics(
    sessionId: string,
    featureId: string
  ): Promise<{
    totalCompactions: number
    totalMessagesCompacted: number
    totalTokens: number
    lastCompactionAt?: string
  } | null> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) return null

    const checkpoint = await this.loadCheckpoint(session)
    const chatSession = await this.loadChatSession(session)

    // If we have a checkpoint, use its stats
    if (checkpoint) {
      // Add current message tokens to checkpoint total
      const currentMessageTokens = chatSession
        ? estimateMessagesTokens(chatSession.messages)
        : 0

      return {
        totalCompactions: checkpoint.stats.totalCompactions,
        totalMessagesCompacted: checkpoint.stats.totalMessages,
        totalTokens: checkpoint.stats.totalTokens + currentMessageTokens,
        lastCompactionAt: checkpoint.compactionInfo.compactedAt
      }
    }

    // No checkpoint yet - estimate tokens from current messages
    if (chatSession) {
      const currentTokens = estimateMessagesTokens(chatSession.messages)
      return {
        totalCompactions: 0,
        totalMessagesCompacted: 0,
        totalTokens: currentTokens,
        lastCompactionAt: undefined
      }
    }

    // No chat session either - return zeros
    return {
      totalCompactions: 0,
      totalMessagesCompacted: 0,
      totalTokens: 0,
      lastCompactionAt: undefined
    }
  }

  /**
   * Manually trigger compaction for a session.
   * Useful for testing or user-initiated compaction.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   */
  async forceCompact(sessionId: string, featureId: string): Promise<void> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    await this.compact(sessionId)
  }

  /**
   * Check if compaction is needed and trigger it.
   * This is called automatically after adding messages.
   *
   * @param session - Session to check
   */
  private async checkAndTriggerCompaction(session: Session): Promise<void> {
    // Prevent concurrent compaction for same session
    if (this.compactingSessionIds.has(session.id)) {
      return
    }

    // Load components to estimate request size
    const chatSession = await this.loadChatSession(session)
    const checkpoint = await this.loadCheckpoint(session)
    const context = await this.loadContext(session)
    const agentDescription = await this.loadAgentDescription(session)

    if (!chatSession || !context || !agentDescription) {
      console.warn(`[SessionManager] Missing session components for compaction check: ${session.id}`)
      return
    }

    // Estimate request size
    const estimate = estimateRequest({
      agentDescription,
      context,
      checkpoint: checkpoint || undefined,
      messages: chatSession.messages,
      userPrompt: '' // Empty for estimation
    })

    // Trigger compaction if needed (90% of 100k token limit)
    if (estimate.needsCompaction) {
      console.log(
        `[SessionManager] Compaction triggered for session ${session.id}: ${estimate.total} tokens > ${estimate.limit * 0.9}`
      )

      await this.compact(session.id)
    }
  }

  /**
   * Compact a session by merging messages into checkpoint.
   * This creates an updated checkpoint and clears the message history.
   *
   * @param sessionId - Session ID to compact
   */
  private async compact(sessionId: string): Promise<void> {
    // Mark session as compacting to prevent recursion
    if (this.compactingSessionIds.has(sessionId)) {
      console.warn(`[SessionManager] Compaction already in progress for ${sessionId}`)
      return
    }

    this.compactingSessionIds.add(sessionId)

    try {
      // Load session
      const session = this.activeSessions.get(sessionId)
      if (!session) {
        console.error(`[SessionManager] Cannot compact - session not found: ${sessionId}`)
        return
      }

      // Load components
      const chatSession = await this.loadChatSession(session)
      const checkpoint = await this.loadCheckpoint(session)

      if (!chatSession || chatSession.messages.length === 0) {
        console.warn(`[SessionManager] No messages to compact for ${sessionId}`)
        return
      }

      console.log(`[SessionManager] Compacting ${chatSession.messages.length} messages for ${sessionId}`)

      // Estimate tokens before compaction
      const estimatedTokens = estimateMessagesTokens(chatSession.messages)

      // Emit start event
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('session:compaction-start', {
            sessionId,
            featureId: session.featureId,
            taskId: session.taskId,
            messagesCount: chatSession.messages.length,
            estimatedTokens
          })
        }
      }

      // Build compaction prompt
      const prompt = buildCompactionPrompt(checkpoint, chatSession.messages)

      // Call Claude to compact messages into checkpoint
      const agentService = getAgentService()
      let responseText = ''

      const stream = agentService.streamQuery({
        prompt,
        cwd: this.projectRoot,
        allowedTools: [], // No tools needed for compaction
        permissionMode: 'bypassPermissions' // Bypass permissions since this is internal operation
      })

      for await (const event of stream) {
        if (event.type === 'message' && event.message && event.message.type === 'assistant') {
          responseText += event.message.content
        } else if (event.type === 'error') {
          throw new Error(event.error)
        }
      }

      if (!responseText) {
        throw new Error('No response from compaction agent')
      }

      // Parse compaction result
      const newSummary = parseCompactionResult(responseText)

      // Create updated checkpoint
      const now = new Date().toISOString()
      const newCheckpoint: Checkpoint = {
        version: (checkpoint?.version || 0) + 1,
        createdAt: checkpoint?.createdAt || now,
        updatedAt: now,
        summary: newSummary,
        compactionInfo: {
          messagesCompacted: chatSession.messages.length,
          oldestMessageTimestamp: chatSession.oldestMessageTimestamp || chatSession.messages[0]?.timestamp || now,
          newestMessageTimestamp: chatSession.newestMessageTimestamp || chatSession.messages[chatSession.messages.length - 1]?.timestamp || now,
          compactedAt: now
        },
        stats: {
          totalCompactions: (checkpoint?.stats.totalCompactions || 0) + 1,
          totalMessages: (checkpoint?.stats.totalMessages || 0) + chatSession.messages.length,
          totalTokens: (checkpoint?.stats.totalTokens || 0) + estimatedTokens
        }
      }

      // Clear messages from chat session
      const clearedChatSession: ChatSession = {
        messages: [],
        totalMessages: chatSession.totalMessages // Keep total count
      }

      // Update session stats
      session.stats.totalCompactions++
      session.stats.lastCompactionAt = now
      session.updatedAt = now

      // Save updated checkpoint and empty chat session
      await this.saveCheckpoint(session, newCheckpoint)
      await this.saveChatSession(session, clearedChatSession)
      await this.saveSession(session)

      console.log(
        `[SessionManager] Compacted ${chatSession.messages.length} messages for session ${sessionId} (checkpoint v${newCheckpoint.version})`
      )

      // Emit complete event
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('session:compaction-complete', {
            sessionId,
            featureId: session.featureId,
            taskId: session.taskId,
            messagesCompacted: chatSession.messages.length,
            tokensReclaimed: estimatedTokens,
            newCheckpointVersion: newCheckpoint.version,
            compactedAt: now
          })
        }
      }
    } catch (error) {
      console.error(`[SessionManager] Compaction failed for ${sessionId}:`, error)

      // Emit error event
      const session = this.activeSessions.get(sessionId)
      if (session) {
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('session:compaction-error', {
              sessionId,
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          }
        }
      }
      // Don't throw - allow session to continue even if compaction fails
      // User can try manual compaction later
    } finally {
      // Remove from compacting set
      this.compactingSessionIds.delete(sessionId)
    }
  }

  // ============================================
  // Context Operations
  // ============================================

  /**
   * Get current context for a session.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   * @returns Session context or null
   */
  async getContext(sessionId: string, featureId: string): Promise<SessionContext | null> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) return null

    return await this.loadContext(session)
  }

  /**
   * Update context for a session.
   * Context is rebuilt dynamically each time.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   * @param context - New context data
   */
  async updateContext(
    sessionId: string,
    featureId: string,
    context: SessionContext
  ): Promise<void> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    await this.saveContext(session, context)
  }

  // ============================================
  // Agent Description Operations
  // ============================================

  /**
   * Get agent description for a session.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   * @returns Agent description or null
   */
  async getAgentDescription(
    sessionId: string,
    featureId: string
  ): Promise<AgentDescription | null> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) return null

    return await this.loadAgentDescription(session)
  }

  /**
   * Set agent description for a session.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   * @param description - Agent description
   */
  async setAgentDescription(
    sessionId: string,
    featureId: string,
    description: AgentDescription
  ): Promise<void> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    await this.saveAgentDescription(session, description)
  }

  // ============================================
  // Archive Operations
  // ============================================

  /**
   * Archive a session when feature/task is completed.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   */
  async archiveSession(sessionId: string, featureId: string): Promise<void> {
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) return

    session.status = 'archived'
    session.updatedAt = new Date().toISOString()

    await this.saveSession(session)
    this.activeSessions.delete(sessionId)

    // Broadcast archived event
    this.broadcastEvent({
      sessionId,
      featureId,
      taskId: session.taskId,
      action: 'archived',
      timestamp: new Date().toISOString()
    })
  }

  // ============================================
  // Request Building
  // ============================================

  /**
   * Build complete request ready for Claude Agent SDK.
   * Combines all session components into system and user prompts.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   * @param userMessage - User's message
   * @returns Complete request with prompts and token estimate
   */
  async buildRequest(
    sessionId: string,
    featureId: string,
    userMessage: string
  ): Promise<{
    systemPrompt: string
    userPrompt: string
    totalTokens: number
  }> {
    // Load session
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Load all components
    const chatSession = await this.loadChatSession(session)
    const checkpoint = await this.loadCheckpoint(session)
    const context = await this.loadContext(session)
    const agentDescription = await this.loadAgentDescription(session)

    if (!chatSession) {
      throw new Error(`Chat session not found for: ${sessionId}`)
    }
    if (!context) {
      throw new Error(`Context not found for: ${sessionId}`)
    }
    if (!agentDescription) {
      throw new Error(`Agent description not found for: ${sessionId}`)
    }

    // Build system prompt from all components
    const systemPromptParts: string[] = []

    // Agent description
    systemPromptParts.push(agentDescription.roleInstructions)
    if (agentDescription.toolInstructions) {
      systemPromptParts.push('')
      systemPromptParts.push(agentDescription.toolInstructions)
    }

    // Context
    systemPromptParts.push('')
    systemPromptParts.push(formatContextAsPrompt(context))

    // Checkpoint (if exists)
    if (checkpoint) {
      systemPromptParts.push('')
      systemPromptParts.push(formatCheckpointAsPrompt(checkpoint))
    }

    // Recent messages
    if (chatSession.messages.length > 0) {
      systemPromptParts.push('')
      systemPromptParts.push(formatMessagesAsPrompt(chatSession.messages))
    }

    const systemPrompt = systemPromptParts.join('\n')
    const userPrompt = userMessage

    // Estimate total tokens
    const estimate = estimateRequest({
      agentDescription,
      context,
      checkpoint: checkpoint || undefined,
      messages: chatSession.messages,
      userPrompt: userMessage
    })

    return {
      systemPrompt,
      userPrompt,
      totalTokens: estimate.total
    }
  }

  /**
   * Preview request with detailed token breakdown.
   * Useful for debugging and UI display.
   *
   * @param sessionId - Session ID
   * @param featureId - Feature ID
   * @param userMessage - Optional user message (defaults to empty string)
   * @returns Request preview with token breakdown
   */
  async previewRequest(
    sessionId: string,
    featureId: string,
    userMessage?: string
  ): Promise<{
    systemPrompt: string
    userPrompt: string
    breakdown: {
      agentDescTokens: number
      contextTokens: number
      checkpointTokens: number
      messagesTokens: number
      userPromptTokens: number
      total: number
    }
  }> {
    // Load session
    const session = await this.getSessionById(sessionId, featureId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Load all components
    const chatSession = await this.loadChatSession(session)
    const checkpoint = await this.loadCheckpoint(session)
    const context = await this.loadContext(session)
    const agentDescription = await this.loadAgentDescription(session)

    if (!chatSession) {
      throw new Error(`Chat session not found for: ${sessionId}`)
    }
    if (!context) {
      throw new Error(`Context not found for: ${sessionId}`)
    }
    if (!agentDescription) {
      throw new Error(`Agent description not found for: ${sessionId}`)
    }

    // Build system prompt from all components
    const systemPromptParts: string[] = []

    // Agent description
    systemPromptParts.push(agentDescription.roleInstructions)
    if (agentDescription.toolInstructions) {
      systemPromptParts.push('')
      systemPromptParts.push(agentDescription.toolInstructions)
    }

    // Context
    systemPromptParts.push('')
    systemPromptParts.push(formatContextAsPrompt(context))

    // Checkpoint (if exists)
    if (checkpoint) {
      systemPromptParts.push('')
      systemPromptParts.push(formatCheckpointAsPrompt(checkpoint))
    }

    // Recent messages
    if (chatSession.messages.length > 0) {
      systemPromptParts.push('')
      systemPromptParts.push(formatMessagesAsPrompt(chatSession.messages))
    }

    const systemPrompt = systemPromptParts.join('\n')
    const userPrompt = userMessage || ''

    // Calculate detailed token breakdown
    const agentDescTokens = estimateAgentDescriptionTokens(agentDescription)
    const contextTokens = estimateContextTokens(context)
    const checkpointTokens = checkpoint ? estimateCheckpointTokens(checkpoint) : 0
    const messagesTokens = estimateMessagesTokens(chatSession.messages)
    const userPromptTokens = estimateTokens(userPrompt)
    const total = agentDescTokens + contextTokens + checkpointTokens + messagesTokens + userPromptTokens

    return {
      systemPrompt,
      userPrompt,
      breakdown: {
        agentDescTokens,
        contextTokens,
        checkpointTokens,
        messagesTokens,
        userPromptTokens,
        total
      }
    }
  }

  // ============================================
  // Persistence
  // ============================================

  /**
   * Get base session directory path.
   */
  private getSessionDir(featureId: string): string {
    return path.join(this.projectRoot, '.dagent-worktrees', featureId, '.dagent', 'sessions')
  }

  /**
   * Get session metadata file path.
   */
  private getSessionPath(session: Session): string {
    return path.join(
      this.getSessionDir(session.featureId),
      `session_${session.id}.json`
    )
  }

  /**
   * Get chat session file path.
   */
  private getChatPath(session: Session): string {
    return path.join(this.getSessionDir(session.featureId), session.files.chat)
  }

  /**
   * Get checkpoint file path.
   */
  private getCheckpointPath(session: Session): string {
    return path.join(this.getSessionDir(session.featureId), session.files.checkpoint)
  }

  /**
   * Get context file path.
   */
  private getContextPath(session: Session): string {
    return path.join(this.getSessionDir(session.featureId), session.files.context)
  }

  /**
   * Get agent description file path.
   */
  private getAgentDescriptionPath(session: Session): string {
    return path.join(this.getSessionDir(session.featureId), session.files.agentDescription)
  }

  /**
   * Save session metadata to disk.
   */
  private async saveSession(session: Session): Promise<void> {
    const sessionPath = this.getSessionPath(session)
    await fs.mkdir(path.dirname(sessionPath), { recursive: true })
    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2))
  }

  /**
   * Load session metadata from disk.
   */
  private async loadSession(sessionId: string, featureId: string): Promise<Session | null> {
    const sessionPath = path.join(
      this.getSessionDir(featureId),
      `session_${sessionId}.json`
    )

    try {
      const data = await fs.readFile(sessionPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  /**
   * Save chat session to disk.
   */
  private async saveChatSession(session: Session, chatSession: ChatSession): Promise<void> {
    const chatPath = this.getChatPath(session)
    await fs.mkdir(path.dirname(chatPath), { recursive: true })
    await fs.writeFile(chatPath, JSON.stringify(chatSession, null, 2))
  }

  /**
   * Load chat session from disk.
   */
  private async loadChatSession(session: Session): Promise<ChatSession | null> {
    const chatPath = this.getChatPath(session)

    try {
      const data = await fs.readFile(chatPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  /**
   * Save checkpoint to disk.
   */
  private async saveCheckpoint(session: Session, checkpoint: Checkpoint): Promise<void> {
    const checkpointPath = this.getCheckpointPath(session)
    await fs.mkdir(path.dirname(checkpointPath), { recursive: true })
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2))
  }

  /**
   * Load checkpoint from disk.
   */
  private async loadCheckpoint(session: Session): Promise<Checkpoint | null> {
    const checkpointPath = this.getCheckpointPath(session)

    try {
      const data = await fs.readFile(checkpointPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  /**
   * Save context to disk.
   */
  private async saveContext(session: Session, context: SessionContext): Promise<void> {
    const contextPath = this.getContextPath(session)
    await fs.mkdir(path.dirname(contextPath), { recursive: true })
    await fs.writeFile(contextPath, JSON.stringify(context, null, 2))
  }

  /**
   * Load context from disk.
   */
  private async loadContext(session: Session): Promise<SessionContext | null> {
    const contextPath = this.getContextPath(session)

    try {
      const data = await fs.readFile(contextPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  /**
   * Save agent description to disk.
   */
  private async saveAgentDescription(
    session: Session,
    description: AgentDescription
  ): Promise<void> {
    const descPath = this.getAgentDescriptionPath(session)
    await fs.mkdir(path.dirname(descPath), { recursive: true })
    await fs.writeFile(descPath, JSON.stringify(description, null, 2))
  }

  /**
   * Load agent description from disk.
   */
  private async loadAgentDescription(session: Session): Promise<AgentDescription | null> {
    const descPath = this.getAgentDescriptionPath(session)

    try {
      const data = await fs.readFile(descPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  // ============================================
  // Event Broadcasting
  // ============================================

  /**
   * Broadcast session update event to all windows.
   */
  private broadcastEvent(event: SessionUpdateEvent): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('session:updated', event)
      }
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

let sessionManagerInstance: SessionManager | null = null

/**
 * Get or create the SessionManager singleton.
 *
 * @param projectRoot - Project root path
 * @returns SessionManager instance
 */
export function getSessionManager(projectRoot?: string): SessionManager {
  if (!sessionManagerInstance && projectRoot) {
    sessionManagerInstance = new SessionManager(projectRoot)
  }

  if (!sessionManagerInstance) {
    throw new Error('SessionManager not initialized. Call with projectRoot first.')
  }

  return sessionManagerInstance
}

/**
 * Reset the SessionManager singleton.
 * Useful for testing or when switching projects.
 */
export function resetSessionManager(): void {
  sessionManagerInstance = null
}
