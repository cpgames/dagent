/**
 * ChatService - Central service for managing interactive chat conversations.
 *
 * This service provides a GENERIC interface for ALL agent types.
 * It is completely agnostic of specific agent behaviors.
 * All agents are treated the same - they only vary by:
 * - toolPreset (which tools are available)
 * - systemPrompt (agent instructions)
 *
 * Persistence:
 * - When featureId is provided: uses SessionManager
 * - Without featureId: uses in-memory storage with optional file backup
 */

import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import { getAgentService } from '../agent'
import { buildCompactionPrompt, parseCompactionResult } from './compaction-prompts'
import { buildAgentPrompt, type AgentType as PromptAgentType } from '../agent/prompt-builders'
import { getSessionManager } from './session-manager'
import type { AgentType as SessionAgentType } from '@shared/types/session'

/**
 * AgentType used by ChatService settings.
 * Combines both session and prompt agent types for flexibility.
 */
export type AgentType = SessionAgentType | 'task'

/**
 * Map ChatService AgentType to prompt-builders AgentType.
 * 'dev' maps to 'task' for prompt building.
 */
function toPromptAgentType(agentType: AgentType): PromptAgentType {
  if (agentType === 'dev') return 'task'
  return agentType as PromptAgentType
}

/**
 * Map ChatService AgentType to session AgentType.
 * 'task' maps to 'dev' for session storage.
 */
function toSessionAgentType(agentType: AgentType): SessionAgentType {
  if (agentType === 'task') return 'dev'
  return agentType as SessionAgentType
}

/**
 * Map ChatService AgentType to AgentRole for config loading.
 * 'task' and 'dev' map to 'developer', 'harness' has no config.
 */
function toAgentRole(agentType: AgentType): AgentRole | null {
  switch (agentType) {
    case 'task':
    case 'dev':
      return 'developer'
    case 'feature':
      return 'feature'
    case 'project':
      return 'project'
    case 'qa':
      return 'qa'
    case 'merge':
      return 'merge'
    case 'harness':
      return null // Harness doesn't have user-configurable settings
    default:
      return null
  }
}
import {
  getContextChatMessagesPath,
  getContextChatMemoryPath,
  ensureContextChatDir
} from '../storage/paths'
import type { ChatMessage, Memory } from '@shared/types/session'
import type { AgentStreamEvent } from '../agent/types'
import type { AgentRole } from '@shared/types'
import { getAgentConfig } from '../ipc/agent-config-handlers'

// Token estimation constant (rough approximation)
const CHARS_PER_TOKEN = 4

/**
 * Estimate token count from messages.
 */
function estimateMessagesTokens(messages: ChatMessage[]): number {
  const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0)
  return Math.round(totalChars / CHARS_PER_TOKEN)
}

/** Tool preset type (matches AgentQueryOptions.toolPreset) */
export type ToolPreset =
  | 'featureChat'
  | 'taskAgent'
  | 'harnessAgent'
  | 'mergeAgent'
  | 'qaAgent'
  | 'featureAgent'
  | 'projectAgent'
  | 'none'

/**
 * Agent chat settings - passed to initialize().
 * This is the ONLY way to configure a chat session.
 */
export interface AgentChatSettings {
  // Required
  agentType: AgentType // 'feature', 'project', 'harness', 'task', 'merge', 'qa'
  toolPreset: ToolPreset
  projectRoot: string

  // Optional - for SessionManager persistence
  featureId?: string
  taskId?: string
  taskState?: string

  // Optional - custom prompts
  systemPrompt?: string // Override default (otherwise uses buildAgentPrompt)
  greeting?: string // Initial greeting message

  // Optional - hooks for type-specific initialization
  onInitialize?: () => Promise<{
    greeting?: string
    context?: unknown
  }>
}

/**
 * Active chat conversation state.
 */
interface ActiveChat {
  sessionId: string
  settings: AgentChatSettings
  abortController: AbortController
  isActive: boolean
}

/**
 * ChatService - Central manager for interactive chat conversations.
 *
 * IMPORTANT: This service is completely generic.
 * All agent types are treated the same way.
 */
export class ChatService extends EventEmitter {
  private activeChats: Map<string, ActiveChat> = new Map()
  // Simple in-memory message storage (keyed by sessionId)
  // Used for sessions without featureId (project-level chats)
  private messages: Map<string, ChatMessage[]> = new Map()
  // In-memory memory storage (keyed by sessionId)
  private memories: Map<string, Memory> = new Map()
  // Track sessions currently being compacted
  private compactingSessionIds: Set<string> = new Set()
  // Context cache (for any type-specific context like inspection results)
  private contextCache: Map<string, unknown> = new Map()

  /**
   * Initialize a chat session with agent settings.
   *
   * @param sessionId - Unique session identifier
   * @param settings - Agent configuration (agentType, toolPreset, etc.)
   * @returns Initialization result with optional greeting and messages
   */
  async initialize(
    sessionId: string,
    settings: AgentChatSettings
  ): Promise<{
    success: boolean
    greeting?: string
    context?: unknown
    messages?: ChatMessage[]
    error?: string
  }> {
    try {
      // Check if chat is already active
      const existing = this.activeChats.get(sessionId)
      if (existing) {
        // Return existing session state
        const messages = await this.loadMessages(sessionId, settings)
        return {
          success: true,
          messages,
          context: this.contextCache.get(sessionId)
        }
      }

      // Run optional initialization hook (e.g., project inspection)
      let greeting = settings.greeting
      let context: unknown = undefined

      if (settings.onInitialize) {
        const initResult = await settings.onInitialize()
        if (initResult.greeting) {
          greeting = initResult.greeting
        }
        if (initResult.context) {
          context = initResult.context
          this.contextCache.set(sessionId, context)
        }
      }

      // Load existing messages from storage
      const messages = await this.loadMessages(sessionId, settings)

      // Register active chat
      this.activeChats.set(sessionId, {
        sessionId,
        settings,
        abortController: new AbortController(),
        isActive: false
      })

      return {
        success: true,
        greeting,
        context,
        messages
      }
    } catch (error) {
      console.error('[ChatService] Initialization failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Initialization failed'
      }
    }
  }

  /**
   * Send a message and stream the response.
   * Returns an async generator of stream events.
   */
  async *sendMessage(sessionId: string, message: string): AsyncGenerator<AgentStreamEvent> {
    const chat = this.activeChats.get(sessionId)
    if (!chat) {
      yield { type: 'error', error: 'Chat session not initialized' }
      return
    }

    const { settings } = chat
    const agentService = getAgentService()

    // Mark chat as active
    chat.isActive = true
    chat.abortController = new AbortController()

    try {
      // Save user message
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      }
      await this.saveMessage(sessionId, settings, userMessage)

      // Emit message_start to signal new agent response
      yield { type: 'message_start' } as const

      // Build system prompt
      const systemPrompt = await this.buildSystemPrompt(sessionId, settings)

      // Build conversation history for context
      const sessionMessages = await this.loadMessages(sessionId, settings)
      const conversationHistory = this.formatMessagesForPrompt(sessionMessages.slice(0, -1))

      // Build full prompt with conversation history + current message
      const fullPrompt = conversationHistory
        ? `${conversationHistory}\n\nUser: ${message}`
        : message

      // Get model from agent config if available
      let model: string | undefined
      const agentRole = toAgentRole(settings.agentType)
      if (agentRole) {
        try {
          const agentConfig = await getAgentConfig(agentRole)
          model = agentConfig.model
        } catch {
          // Config not available, use default model
        }
      }

      // Stream the query
      // Note: Assistant messages are saved by the frontend via addMessage()
      // since the frontend handles message splitting based on tool calls
      for await (const event of agentService.streamQuery({
        prompt: fullPrompt,
        systemPrompt: systemPrompt || undefined,
        toolPreset: settings.toolPreset,
        permissionMode: 'bypassPermissions',
        cwd: settings.projectRoot,
        agentType: toPromptAgentType(settings.agentType),
        agentId: sessionId,
        featureId: settings.featureId,
        model
      })) {
        yield event
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Chat query failed'
      }
    } finally {
      chat.isActive = false
    }
  }

  /**
   * Abort the current response for a session.
   */
  abort(sessionId: string): void {
    const chat = this.activeChats.get(sessionId)
    if (chat && chat.isActive) {
      chat.abortController.abort()
      getAgentService().abort()
      chat.isActive = false
    }
  }

  /**
   * Reset a chat session (clear messages and memory).
   */
  async reset(sessionId: string): Promise<void> {
    const chat = this.activeChats.get(sessionId)

    // Abort any active query
    this.abort(sessionId)

    // Clear messages
    if (chat?.settings.featureId) {
      // Clear from SessionManager
      try {
        const sessionManager = getSessionManager(chat.settings.projectRoot)
        await sessionManager.clearMessages(sessionId, chat.settings.featureId)
      } catch {
        // SessionManager may not have this session
      }
    }
    this.messages.delete(sessionId)

    // Clear memory
    this.memories.delete(sessionId)

    // Clear context cache
    this.contextCache.delete(sessionId)

    // Clear persisted project-level data if no featureId
    if (chat && !chat.settings.featureId) {
      await this.clearPersistedData(chat.settings.projectRoot)
    }

    // Remove from active chats
    this.activeChats.delete(sessionId)
  }

  /**
   * Get messages for a session.
   */
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const chat = this.activeChats.get(sessionId)
    if (!chat) {
      return this.messages.get(sessionId) || []
    }
    return this.loadMessages(sessionId, chat.settings)
  }

  /**
   * Get memory for a session.
   */
  async getMemory(sessionId: string): Promise<Memory | null> {
    const chat = this.activeChats.get(sessionId)
    if (chat?.settings.featureId) {
      try {
        const sessionManager = getSessionManager(chat.settings.projectRoot)
        return await sessionManager.getMemory(sessionId, chat.settings.featureId)
      } catch {
        // Fall through to in-memory
      }
    }

    // Check in-memory
    const memoryMemory = this.memories.get(sessionId)
    if (memoryMemory) {
      return memoryMemory
    }

    // Try file-based persistence for project-level chats
    if (chat && !chat.settings.featureId) {
      const persisted = await this.loadPersistedMemory(chat.settings.projectRoot)
      if (persisted) {
        this.memories.set(sessionId, persisted)
        return persisted
      }
    }

    return null
  }

  /**
   * Check if a session is currently being compacted.
   */
  isCompacting(sessionId: string): boolean {
    return this.compactingSessionIds.has(sessionId)
  }

  /**
   * Manually trigger compaction for a session.
   * Compacts messages into a memory summary.
   */
  async compact(sessionId: string): Promise<{ success: boolean; error?: string }> {
    // Prevent concurrent compaction
    if (this.compactingSessionIds.has(sessionId)) {
      return { success: false, error: 'Compaction already in progress' }
    }

    const chat = this.activeChats.get(sessionId)
    if (!chat) {
      return { success: false, error: 'Chat session not found' }
    }

    const messages = await this.loadMessages(sessionId, chat.settings)
    if (messages.length === 0) {
      return { success: false, error: 'No messages to compact' }
    }

    this.compactingSessionIds.add(sessionId)

    try {
      const estimatedTokens = estimateMessagesTokens(messages)
      const existingMemory = await this.getMemory(sessionId)

      // Emit start event
      this.broadcastEvent('unified-chat:compaction-start', {
        sessionId,
        messagesCount: messages.length,
        estimatedTokens
      })

      console.log(`[ChatService] Compacting ${messages.length} messages for ${sessionId}`)

      // Build compaction prompt
      const prompt = buildCompactionPrompt(existingMemory, messages)

      // Call Claude to compact messages
      const agentService = getAgentService()
      let responseText = ''

      const stream = agentService.streamQuery({
        prompt,
        cwd: chat.settings.projectRoot,
        allowedTools: [],
        permissionMode: 'bypassPermissions'
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

      // Create updated memory
      const now = new Date().toISOString()
      const newMemory: Memory = {
        version: (existingMemory?.version || 0) + 1,
        createdAt: existingMemory?.createdAt || now,
        updatedAt: now,
        summary: newSummary,
        compactionInfo: {
          messagesCompacted: messages.length,
          oldestMessageTimestamp: messages[0]?.timestamp || now,
          newestMessageTimestamp: messages[messages.length - 1]?.timestamp || now,
          compactedAt: now
        },
        stats: {
          totalCompactions: (existingMemory?.stats.totalCompactions || 0) + 1,
          totalMessages: (existingMemory?.stats.totalMessages || 0) + messages.length,
          totalTokens: (existingMemory?.stats.totalTokens || 0) + estimatedTokens
        }
      }

      // Save memory and clear messages
      await this.saveMemory(sessionId, chat.settings, newMemory)
      await this.clearMessages(sessionId, chat.settings)

      console.log(
        `[ChatService] Compacted ${messages.length} messages for ${sessionId} (memory v${newMemory.version})`
      )

      // Emit complete event
      this.broadcastEvent('unified-chat:compaction-complete', {
        sessionId,
        messagesCompacted: messages.length,
        tokensReclaimed: estimatedTokens,
        newMemoryVersion: newMemory.version,
        compactedAt: now
      })

      // Generate follow-up message based on memory
      await this.generateFollowUp(sessionId, newMemory)

      return { success: true }
    } catch (error) {
      console.error(`[ChatService] Compaction failed for ${sessionId}:`, error)

      // Emit error event
      this.broadcastEvent('unified-chat:compaction-error', {
        sessionId,
        error: error instanceof Error ? error.message : 'Compaction failed'
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Compaction failed'
      }
    } finally {
      this.compactingSessionIds.delete(sessionId)
    }
  }

  /**
   * Get the settings for an active chat session.
   */
  getSettings(sessionId: string): AgentChatSettings | undefined {
    return this.activeChats.get(sessionId)?.settings
  }

  /**
   * Add a message to a session from the frontend.
   * Used when the frontend creates split messages based on tool calls.
   */
  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const chat = this.activeChats.get(sessionId)
    if (!chat) {
      console.warn(`[ChatService] Cannot add message - session not found: ${sessionId}`)
      return
    }
    await this.saveMessage(sessionId, chat.settings, message)
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Build system prompt for a session.
   * Uses settings.systemPrompt if provided, otherwise buildAgentPrompt.
   */
  private async buildSystemPrompt(
    sessionId: string,
    settings: AgentChatSettings
  ): Promise<string> {
    // Use custom system prompt if provided
    if (settings.systemPrompt) {
      return this.appendMemoryToPrompt(sessionId, settings.systemPrompt)
    }

    // Build default agent prompt
    const basePrompt = await buildAgentPrompt({
      agentType: toPromptAgentType(settings.agentType),
      featureId: settings.featureId,
      taskId: settings.taskId
    })

    return this.appendMemoryToPrompt(sessionId, basePrompt)
  }

  /**
   * Append memory context to system prompt.
   */
  private async appendMemoryToPrompt(
    sessionId: string,
    basePrompt: string
  ): Promise<string> {
    const memory = await this.getMemory(sessionId)
    if (!memory) {
      return basePrompt
    }

    const memoryContext = this.formatMemoryForPrompt(memory)
    return basePrompt ? `${basePrompt}\n\n${memoryContext}` : memoryContext
  }

  /**
   * Generate a follow-up message after compaction based on memory.
   */
  private async generateFollowUp(sessionId: string, memory: Memory): Promise<void> {
    const chat = this.activeChats.get(sessionId)
    if (!chat) return

    const { settings } = chat
    const agentService = getAgentService()

    // Build a prompt asking the agent to continue based on memory
    const memoryContext = this.formatMemoryForPrompt(memory)
    const followUpPrompt = `The conversation was just compacted to save context space. Here's what we've discussed:

${memoryContext}

Please acknowledge this context briefly and either:
1. Ask a follow-up question to continue our work
2. Summarize what we should do next
3. If we were in the middle of something, continue from where we left off

Keep your response concise and natural - don't list everything from the context, just continue the conversation.`

    // Build system prompt
    const systemPrompt = await this.buildSystemPrompt(sessionId, settings)

    // Get model from agent config if available
    let model: string | undefined
    const agentRole = toAgentRole(settings.agentType)
    if (agentRole) {
      try {
        const agentConfig = await getAgentConfig(agentRole)
        model = agentConfig.model
      } catch {
        // Config not available, use default model
      }
    }

    try {
      // Emit stream start event to UI
      this.broadcastEvent('unified-chat:stream', {
        sessionId,
        event: { type: 'message_start' }
      })

      let accumulatedContent = ''

      for await (const event of agentService.streamQuery({
        prompt: followUpPrompt,
        systemPrompt: systemPrompt || undefined,
        toolPreset: settings.toolPreset,
        permissionMode: 'bypassPermissions',
        cwd: settings.projectRoot,
        agentType: toPromptAgentType(settings.agentType),
        agentId: sessionId,
        featureId: settings.featureId,
        model
      })) {
        // Accumulate content
        if (event.type === 'message' && event.message?.type === 'assistant') {
          accumulatedContent = event.message.content
        }

        // Forward stream events to UI
        this.broadcastEvent('unified-chat:stream', {
          sessionId,
          event
        })
      }

      // Save the follow-up message
      if (accumulatedContent) {
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: accumulatedContent,
          timestamp: new Date().toISOString(),
          metadata: {
            agentType: toSessionAgentType(settings.agentType)
          }
        }
        await this.saveMessage(sessionId, settings, assistantMessage)
      }

      // Emit stream done event
      this.broadcastEvent('unified-chat:stream', {
        sessionId,
        event: { type: 'done' }
      })
    } catch (error) {
      console.error('[ChatService] Failed to generate follow-up:', error)
    }
  }

  /**
   * Format memory for inclusion in system prompt.
   */
  private formatMemoryForPrompt(memory: Memory): string {
    const sections: string[] = []

    sections.push('## Context Summary')
    sections.push('')

    if (memory.summary.critical.length > 0) {
      sections.push('**Critical:**')
      memory.summary.critical.forEach((item) => sections.push(`- ${item}`))
      sections.push('')
    }

    if (memory.summary.important.length > 0) {
      sections.push('**Important:**')
      memory.summary.important.forEach((item) => sections.push(`- ${item}`))
      sections.push('')
    }

    if (memory.summary.minor.length > 0) {
      sections.push('**Minor:**')
      memory.summary.minor.forEach((item) => sections.push(`- ${item}`))
      sections.push('')
    }

    return sections.join('\n')
  }

  /**
   * Format messages for inclusion in prompt as conversation history.
   */
  private formatMessagesForPrompt(messages: ChatMessage[]): string {
    if (messages.length === 0) return ''

    const formatted = messages.map((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant'
      return `${role}: ${msg.content}`
    })

    return '## Recent Conversation\n\n' + formatted.join('\n\n')
  }

  // ============================================
  // Message Persistence
  // ============================================

  /**
   * Load messages for a session.
   * Uses SessionManager if featureId is available, otherwise in-memory/file.
   */
  private async loadMessages(
    sessionId: string,
    settings: AgentChatSettings
  ): Promise<ChatMessage[]> {
    // Try SessionManager first if we have featureId
    if (settings.featureId) {
      try {
        const sessionManager = getSessionManager(settings.projectRoot)
        const messages = await sessionManager.getAllMessages(sessionId, settings.featureId)
        if (messages.length > 0) {
          return messages
        }
      } catch {
        // Fall through to in-memory/file
      }
    }

    // Check in-memory
    const memoryMessages = this.messages.get(sessionId)
    if (memoryMessages && memoryMessages.length > 0) {
      return memoryMessages
    }

    // Try file-based persistence for project-level chats
    if (!settings.featureId) {
      const persisted = await this.loadPersistedMessages(settings.projectRoot)
      if (persisted.length > 0) {
        this.messages.set(sessionId, persisted)
        return persisted
      }
    }

    // Initialize empty
    this.messages.set(sessionId, [])
    return []
  }

  /**
   * Save a message for a session.
   */
  private async saveMessage(
    sessionId: string,
    settings: AgentChatSettings,
    message: ChatMessage
  ): Promise<void> {
    // Save to SessionManager if we have featureId
    if (settings.featureId) {
      try {
        const sessionManager = getSessionManager(settings.projectRoot)
        await sessionManager.addMessage(sessionId, settings.featureId, {
          role: message.role,
          content: message.content,
          metadata: message.metadata
        })
      } catch (error) {
        console.warn('[ChatService] SessionManager save failed, using in-memory:', error)
        // Fall through to in-memory
      }
    }

    // Always update in-memory (for consistency and project-level chats)
    const msgs = this.messages.get(sessionId) || []
    msgs.push(message)
    this.messages.set(sessionId, msgs)

    // Persist to file for project-level chats
    if (!settings.featureId) {
      await this.savePersistedMessages(settings.projectRoot, msgs)
    }
  }

  /**
   * Clear messages for a session.
   */
  private async clearMessages(
    sessionId: string,
    settings: AgentChatSettings
  ): Promise<void> {
    // Clear from SessionManager
    if (settings.featureId) {
      try {
        const sessionManager = getSessionManager(settings.projectRoot)
        await sessionManager.clearMessages(sessionId, settings.featureId)
      } catch {
        // Ignore
      }
    }

    // Clear in-memory
    this.messages.set(sessionId, [])

    // Clear persisted for project-level
    if (!settings.featureId) {
      await this.savePersistedMessages(settings.projectRoot, [])
    }
  }

  // ============================================
  // Memory Persistence
  // ============================================

  /**
   * Save memory for a session.
   */
  private async saveMemory(
    sessionId: string,
    settings: AgentChatSettings,
    memory: Memory
  ): Promise<void> {
    // Save to SessionManager if we have featureId
    if (settings.featureId) {
      try {
        const sessionManager = getSessionManager(settings.projectRoot)
        await sessionManager.updateMemory(sessionId, settings.featureId, memory)
      } catch {
        // Fall through to in-memory
      }
    }

    // Save in-memory
    this.memories.set(sessionId, memory)

    // Persist to file for project-level chats
    if (!settings.featureId) {
      await this.savePersistedMemory(settings.projectRoot, memory)
    }
  }

  // ============================================
  // File-based Persistence (for project-level chats)
  // ============================================

  /**
   * Load persisted messages from disk.
   */
  private async loadPersistedMessages(projectRoot: string): Promise<ChatMessage[]> {
    try {
      const messagesPath = getContextChatMessagesPath(projectRoot)
      const data = await fs.readFile(messagesPath, 'utf-8')
      return JSON.parse(data) as ChatMessage[]
    } catch {
      return []
    }
  }

  /**
   * Save messages to disk.
   */
  private async savePersistedMessages(
    projectRoot: string,
    messages: ChatMessage[]
  ): Promise<void> {
    try {
      await ensureContextChatDir(projectRoot)
      const messagesPath = getContextChatMessagesPath(projectRoot)
      await fs.writeFile(messagesPath, JSON.stringify(messages, null, 2), 'utf-8')
    } catch (error) {
      console.error('[ChatService] Failed to save messages:', error)
    }
  }

  /**
   * Load persisted memory from disk.
   */
  private async loadPersistedMemory(projectRoot: string): Promise<Memory | null> {
    try {
      const memoryPath = getContextChatMemoryPath(projectRoot)
      const data = await fs.readFile(memoryPath, 'utf-8')
      return JSON.parse(data) as Memory
    } catch {
      return null
    }
  }

  /**
   * Save memory to disk.
   */
  private async savePersistedMemory(projectRoot: string, memory: Memory): Promise<void> {
    try {
      await ensureContextChatDir(projectRoot)
      const memoryPath = getContextChatMemoryPath(projectRoot)
      await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2), 'utf-8')
    } catch (error) {
      console.error('[ChatService] Failed to save memory:', error)
    }
  }

  /**
   * Clear persisted data from disk.
   */
  private async clearPersistedData(projectRoot: string): Promise<void> {
    try {
      const messagesPath = getContextChatMessagesPath(projectRoot)
      const memoryPath = getContextChatMemoryPath(projectRoot)
      await fs.unlink(messagesPath).catch(() => {})
      await fs.unlink(memoryPath).catch(() => {})
    } catch (error) {
      console.error('[ChatService] Failed to clear persisted data:', error)
    }
  }

  // ============================================
  // Event Broadcasting
  // ============================================

  /**
   * Broadcast event to all windows.
   */
  private broadcastEvent(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    }
  }
}

// Singleton instance
let chatServiceInstance: ChatService | null = null

export function getChatService(): ChatService {
  if (!chatServiceInstance) {
    chatServiceInstance = new ChatService()
  }
  return chatServiceInstance
}
