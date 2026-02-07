/**
 * IPC Handlers for Session Operations
 *
 * Exposes SessionManager functionality to the renderer process.
 */

import { ipcMain } from 'electron'
import { getSessionManager } from '../services/session-manager'
import type {
  CreateSessionOptions,
  ChatMessage,
  Memory,
  SessionContext,
  AgentDescription,
  Session
} from '../../shared/types/session'

/**
 * Register all session-related IPC handlers.
 */
export function registerSessionHandlers(): void {
  // ============================================
  // Session Lifecycle
  // ============================================

  /**
   * Get or create a session.
   */
  ipcMain.handle(
    'session:getOrCreate',
    async (
      _event,
      projectRoot: string,
      options: CreateSessionOptions
    ): Promise<Session> => {
      const manager = getSessionManager(projectRoot)
      return await manager.getOrCreateSession(options)
    }
  )

  /**
   * Get session by ID.
   */
  ipcMain.handle(
    'session:getById',
    async (_event, projectRoot: string, sessionId: string, featureId: string): Promise<Session | null> => {
      const manager = getSessionManager(projectRoot)
      return await manager.getSessionById(sessionId, featureId)
    }
  )

  /**
   * Archive a session.
   */
  ipcMain.handle(
    'session:archive',
    async (_event, projectRoot: string, sessionId: string, featureId: string): Promise<void> => {
      const manager = getSessionManager(projectRoot)
      await manager.archiveSession(sessionId, featureId)
    }
  )

  // ============================================
  // Message Operations
  // ============================================

  /**
   * Add a message to a session.
   */
  ipcMain.handle(
    'session:addMessage',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string,
      message: Omit<ChatMessage, 'id' | 'timestamp'>
    ): Promise<ChatMessage> => {
      const manager = getSessionManager(projectRoot)
      return await manager.addMessage(sessionId, featureId, message)
    }
  )

  /**
   * Load all messages from a session for PM chat display.
   * Convenience wrapper that creates session if needed.
   */
  ipcMain.handle(
    'session:loadMessages',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string
    ): Promise<ChatMessage[]> => {
      const manager = getSessionManager(projectRoot)
      return await manager.getAllMessages(sessionId, featureId)
    }
  )

  /**
   * Add a user message to a session.
   * Convenience wrapper for PM chat.
   */
  ipcMain.handle(
    'session:addUserMessage',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string,
      content: string
    ): Promise<void> => {
      const manager = getSessionManager(projectRoot)
      await manager.addMessage(sessionId, featureId, {
        role: 'user',
        content
      })
    }
  )

  /**
   * Add an assistant message to a session.
   * Convenience wrapper for PM chat.
   */
  ipcMain.handle(
    'session:addAssistantMessage',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string,
      content: string,
      metadata?: Record<string, unknown>
    ): Promise<void> => {
      const manager = getSessionManager(projectRoot)
      await manager.addMessage(sessionId, featureId, {
        role: 'assistant',
        content,
        metadata: metadata as ChatMessage['metadata']
      })
    }
  )

  /**
   * Get recent messages from a session.
   */
  ipcMain.handle(
    'session:getRecentMessages',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string,
      limit?: number
    ): Promise<ChatMessage[]> => {
      const manager = getSessionManager(projectRoot)
      return await manager.getRecentMessages(sessionId, featureId, limit)
    }
  )

  /**
   * Get all messages from a session.
   */
  ipcMain.handle(
    'session:getAllMessages',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string
    ): Promise<ChatMessage[]> => {
      const manager = getSessionManager(projectRoot)
      return await manager.getAllMessages(sessionId, featureId)
    }
  )

  /**
   * Clear all messages from a session.
   */
  ipcMain.handle(
    'session:clearMessages',
    async (_event, projectRoot: string, sessionId: string, featureId: string): Promise<void> => {
      const manager = getSessionManager(projectRoot)
      await manager.clearMessages(sessionId, featureId)
    }
  )

  // ============================================
  // Memory Operations
  // ============================================

  /**
   * Get memory for a session.
   */
  ipcMain.handle(
    'session:getCheckpoint',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string
    ): Promise<Memory | null> => {
      const manager = getSessionManager(projectRoot)
      return await manager.getMemory(sessionId, featureId)
    }
  )

  /**
   * Update memory for a session.
   */
  ipcMain.handle(
    'session:updateCheckpoint',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string,
      memory: Memory
    ): Promise<void> => {
      const manager = getSessionManager(projectRoot)
      await manager.updateMemory(sessionId, featureId, memory)
    }
  )

  // ============================================
  // Context Operations
  // ============================================

  /**
   * Get context for a session.
   */
  ipcMain.handle(
    'session:getContext',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string
    ): Promise<SessionContext | null> => {
      const manager = getSessionManager(projectRoot)
      return await manager.getContext(sessionId, featureId)
    }
  )

  /**
   * Update context for a session.
   */
  ipcMain.handle(
    'session:updateContext',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string,
      context: SessionContext
    ): Promise<void> => {
      const manager = getSessionManager(projectRoot)
      await manager.updateContext(sessionId, featureId, context)
    }
  )

  // ============================================
  // Agent Description Operations
  // ============================================

  /**
   * Get agent description for a session.
   */
  ipcMain.handle(
    'session:getAgentDescription',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string
    ): Promise<AgentDescription | null> => {
      const manager = getSessionManager(projectRoot)
      return await manager.getAgentDescription(sessionId, featureId)
    }
  )

  /**
   * Set agent description for a session.
   */
  ipcMain.handle(
    'session:setAgentDescription',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string,
      description: AgentDescription
    ): Promise<void> => {
      const manager = getSessionManager(projectRoot)
      await manager.setAgentDescription(sessionId, featureId, description)
    }
  )

  // ============================================
  // Compaction Operations
  // ============================================

  /**
   * Get compaction metrics for a session.
   */
  ipcMain.handle(
    'session:getMetrics',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string
    ): Promise<{
      totalCompactions: number
      totalMessagesCompacted: number
      totalTokens: number
      lastCompactionAt?: string
    } | null> => {
      const manager = getSessionManager(projectRoot)
      return await manager.getCompactionMetrics(sessionId, featureId)
    }
  )

  /**
   * Manually trigger compaction for a session.
   */
  ipcMain.handle(
    'session:forceCompact',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string
    ): Promise<void> => {
      const manager = getSessionManager(projectRoot)
      await manager.forceCompact(sessionId, featureId)
    }
  )

  // ============================================
  // Request Building Operations
  // ============================================

  /**
   * Build complete request ready for Claude Agent SDK.
   */
  ipcMain.handle(
    'session:buildRequest',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string,
      userMessage: string
    ): Promise<{
      systemPrompt: string
      userPrompt: string
      totalTokens: number
    }> => {
      const manager = getSessionManager(projectRoot)
      return await manager.buildRequest(sessionId, featureId, userMessage)
    }
  )

  /**
   * Preview request with detailed token breakdown.
   */
  ipcMain.handle(
    'session:previewRequest',
    async (
      _event,
      projectRoot: string,
      sessionId: string,
      featureId: string,
      userMessage?: string
    ): Promise<{
      systemPrompt: string
      userPrompt: string
      breakdown: {
        agentDescTokens: number
        contextTokens: number
        memoryTokens: number
        messagesTokens: number
        userPromptTokens: number
        total: number
      }
    }> => {
      const manager = getSessionManager(projectRoot)
      return await manager.previewRequest(sessionId, featureId, userMessage)
    }
  )

  console.log('[SessionHandlers] Registered all session IPC handlers')
}
