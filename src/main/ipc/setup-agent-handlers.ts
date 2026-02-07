/**
 * Setup Agent IPC Handlers
 * Handles initialization, streaming conversation, and state management.
 */

import { ipcMain } from 'electron'
import { getSetupAgent, resetSetupAgent } from '../agents/setup-agent'
import { setSetupContext } from '../agent/setup-mcp-server'
import type { SetupAgentState, ProjectInspection } from '../agents/setup-types'
import type { AgentStreamEvent } from '../agent'

/**
 * Send a stream event to the renderer.
 */
function sendToRenderer(webContents: Electron.WebContents, event: AgentStreamEvent): void {
  if (!webContents.isDestroyed()) {
    webContents.send('setup-agent:stream', event)
  }
}

/**
 * Register IPC handlers for Setup Agent.
 */
export function registerSetupAgentHandlers(): void {
  /**
   * Initialize the Setup Agent for a project.
   * Runs project inspection and returns greeting message.
   */
  ipcMain.handle(
    'setup-agent:initialize',
    async (
      _event,
      projectRoot: string
    ): Promise<{
      success: boolean
      inspection?: ProjectInspection
      greeting?: string
      state?: SetupAgentState
      error?: string
    }> => {
      try {
        // Set context for MCP server
        setSetupContext(projectRoot)

        // Get or create agent
        const agent = getSetupAgent(projectRoot)

        // Run inspection
        const inspection = await agent.inspectProject()

        // Build greeting
        const greeting = agent.buildGreetingMessage()

        return {
          success: true,
          inspection,
          greeting,
          state: agent.getState()
        }
      } catch (error) {
        console.error('[SetupAgent] Initialization failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Initialization failed'
        }
      }
    }
  )

  /**
   * Get current Setup Agent state.
   */
  ipcMain.handle(
    'setup-agent:getState',
    async (_event, projectRoot: string): Promise<SetupAgentState | null> => {
      try {
        const agent = getSetupAgent(projectRoot)
        return agent.getState()
      } catch (error) {
        console.error('[SetupAgent] Failed to get state:', error)
        return null
      }
    }
  )

  /**
   * Start a streaming conversation with the Setup Agent.
   * Streams events to the renderer via setup-agent:stream channel.
   */
  ipcMain.handle(
    'setup-agent:query',
    async (ipcEvent, projectRoot: string, userMessage: string): Promise<void> => {
      const webContents = ipcEvent.sender

      try {
        // Ensure context is set
        setSetupContext(projectRoot)

        const agent = getSetupAgent(projectRoot)

        for await (const event of agent.streamConversation(userMessage)) {
          sendToRenderer(webContents, event as AgentStreamEvent)
        }

        // Send done event
        sendToRenderer(webContents, { type: 'done' } as AgentStreamEvent)
      } catch (error) {
        console.error('[SetupAgent] Query failed:', error)
        sendToRenderer(webContents, {
          type: 'error',
          error: error instanceof Error ? error.message : 'Setup agent query failed'
        } as AgentStreamEvent)
      }
    }
  )

  /**
   * Abort current Setup Agent query.
   */
  ipcMain.handle('setup-agent:abort', async (): Promise<void> => {
    try {
      const { getAgentService } = await import('../agent')
      getAgentService().abort()
    } catch (error) {
      console.error('[SetupAgent] Failed to abort:', error)
    }
  })

  /**
   * Reset the Setup Agent.
   */
  ipcMain.handle('setup-agent:reset', async (): Promise<{ success: boolean }> => {
    try {
      resetSetupAgent()
      return { success: true }
    } catch (error) {
      console.error('[SetupAgent] Failed to reset:', error)
      return { success: false }
    }
  })
}
