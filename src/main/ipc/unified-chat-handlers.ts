/**
 * Unified Chat IPC Handlers
 *
 * Provides a unified interface for all interactive chat types.
 * These handlers accept agent settings and route to ChatService.
 *
 * The handlers are completely generic - any agent type can be used.
 */

import { ipcMain } from 'electron'
import { getChatService, type AgentChatSettings, type ToolPreset, type AgentType } from '../services/chat-service'
import type { AgentStreamEvent } from '../agent/types'
import type { ChatMessage, Memory } from '@shared/types/session'

/**
 * Send a stream event to the renderer.
 */
function sendToRenderer(
  webContents: Electron.WebContents,
  sessionId: string,
  event: AgentStreamEvent
): void {
  if (!webContents.isDestroyed()) {
    webContents.send('unified-chat:stream', { sessionId, event })
  }
}

/**
 * Map agent type to default tool preset.
 * This provides sensible defaults when only agentType is specified.
 */
function getDefaultToolPreset(agentType: AgentType): ToolPreset {
  switch (agentType) {
    case 'feature':
      return 'featureAgent'
    case 'project':
      return 'projectAgent'
    case 'task':
    case 'dev':
      return 'taskAgent'
    case 'qa':
      return 'qaAgent'
    case 'merge':
      return 'mergeAgent'
    case 'harness':
      return 'harnessAgent'
    default:
      return 'none'
  }
}

/**
 * Register unified chat IPC handlers.
 */
export function registerUnifiedChatHandlers(): void {
  const chatService = getChatService()

  /**
   * Initialize a chat session with agent settings.
   *
   * Accepts either:
   * 1. Full AgentChatSettings object (settings parameter)
   * 2. Legacy parameters (agentType, projectRoot, featureId) for backward compatibility
   */
  ipcMain.handle(
    'unified-chat:initialize',
    async (
      _event,
      sessionId: string,
      settingsOrAgentType: AgentChatSettings | AgentType,
      projectRoot?: string,
      featureId?: string
    ): Promise<{
      success: boolean
      greeting?: string
      context?: unknown
      messages?: ChatMessage[]
      error?: string
    }> => {
      try {
        let settings: AgentChatSettings

        // Check if full settings object was passed or legacy parameters
        if (typeof settingsOrAgentType === 'object' && 'agentType' in settingsOrAgentType) {
          // Full settings object
          settings = settingsOrAgentType
        } else {
          // Legacy parameters - construct settings
          const agentType = settingsOrAgentType as AgentType
          settings = {
            agentType,
            toolPreset: getDefaultToolPreset(agentType),
            projectRoot: projectRoot!,
            featureId
          }
        }

        const result = await chatService.initialize(sessionId, settings)
        return result
      } catch (error) {
        console.error('[UnifiedChat] Initialize failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Initialization failed'
        }
      }
    }
  )

  /**
   * Send a message to the chat.
   * Streams events via unified-chat:stream channel.
   */
  ipcMain.handle(
    'unified-chat:send',
    async (ipcEvent, sessionId: string, message: string): Promise<void> => {
      const webContents = ipcEvent.sender

      try {
        for await (const event of chatService.sendMessage(sessionId, message)) {
          sendToRenderer(webContents, sessionId, event)
        }
        // Note: 'done' event is already yielded by the stream, no need to send it again
      } catch (error) {
        console.error('[UnifiedChat] Send failed:', error)
        sendToRenderer(webContents, sessionId, {
          type: 'error',
          error: error instanceof Error ? error.message : 'Send failed'
        })
      }
    }
  )

  /**
   * Abort the current response.
   */
  ipcMain.handle('unified-chat:abort', async (_event, sessionId: string): Promise<void> => {
    try {
      chatService.abort(sessionId)
    } catch (error) {
      console.error('[UnifiedChat] Abort failed:', error)
    }
  })

  /**
   * Reset a chat session (clear messages).
   */
  ipcMain.handle(
    'unified-chat:reset',
    async (_event, sessionId: string): Promise<{ success: boolean }> => {
      try {
        await chatService.reset(sessionId)
        return { success: true }
      } catch (error) {
        console.error('[UnifiedChat] Reset failed:', error)
        return { success: false }
      }
    }
  )

  /**
   * Get messages for a session.
   */
  ipcMain.handle(
    'unified-chat:getMessages',
    async (_event, sessionId: string): Promise<ChatMessage[]> => {
      try {
        return await chatService.getMessages(sessionId)
      } catch (error) {
        console.error('[UnifiedChat] GetMessages failed:', error)
        return []
      }
    }
  )

  /**
   * Add a message to a session.
   * Used by frontend to persist split messages during streaming.
   */
  ipcMain.handle(
    'unified-chat:addMessage',
    async (_event, sessionId: string, message: ChatMessage): Promise<{ success: boolean }> => {
      try {
        await chatService.addMessage(sessionId, message)
        return { success: true }
      } catch (error) {
        console.error('[UnifiedChat] AddMessage failed:', error)
        return { success: false }
      }
    }
  )

  /**
   * Get memory for a session.
   */
  ipcMain.handle(
    'unified-chat:getMemory',
    async (_event, sessionId: string): Promise<Memory | null> => {
      try {
        return await chatService.getMemory(sessionId)
      } catch (error) {
        console.error('[UnifiedChat] GetMemory failed:', error)
        return null
      }
    }
  )

  /**
   * Manually trigger compaction for a session.
   */
  ipcMain.handle(
    'unified-chat:compact',
    async (_event, sessionId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        return await chatService.compact(sessionId)
      } catch (error) {
        console.error('[UnifiedChat] Compact failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Compaction failed'
        }
      }
    }
  )
}
