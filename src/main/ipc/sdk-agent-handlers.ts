// src/main/ipc/sdk-agent-handlers.ts
// IPC handlers for Agent SDK streaming queries
import { ipcMain } from 'electron'
import { getAgentService } from '../agent'
import type { AgentQueryOptions, AgentStreamEvent } from '../agent'

/**
 * Send an event to the renderer that initiated the query.
 * Uses the webContents from the IPC event sender.
 */
function sendToRenderer(webContents: Electron.WebContents, event: AgentStreamEvent): void {
  if (!webContents.isDestroyed()) {
    webContents.send('sdk-agent:stream', event)
  }
}

/**
 * Register IPC handlers for Agent SDK streaming.
 * These handlers enable the renderer to start streaming queries
 * and receive real-time updates via the sdk-agent:stream channel.
 */
export function registerSdkAgentHandlers(): void {
  // Start a streaming agent query
  ipcMain.handle(
    'sdk-agent:query',
    async (ipcEvent, options: AgentQueryOptions): Promise<void> => {
      const service = getAgentService()
      const webContents = ipcEvent.sender

      try {
        for await (const event of service.streamQuery(options)) {
          // Send each event to the renderer that started the query
          sendToRenderer(webContents, event)
        }
      } catch (error) {
        sendToRenderer(webContents, {
          type: 'error',
          error: error instanceof Error ? error.message : 'Agent query failed'
        } as AgentStreamEvent)
      }
    }
  )

  // Abort current agent query
  ipcMain.handle('sdk-agent:abort', async (): Promise<void> => {
    const service = getAgentService()
    service.abort()
  })
}
