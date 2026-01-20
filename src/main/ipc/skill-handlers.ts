/**
 * Skill IPC handlers.
 * Provides renderer access to run Claude Code skills like /init.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { getContextService } from './context-handlers'

/**
 * Send skill progress update to all renderer windows.
 */
function sendProgressUpdate(message: string, detail?: string): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('skill:progress', { message, detail })
  })
}

/**
 * Register all skill-related IPC handlers.
 */
export function registerSkillHandlers(): void {
  /**
   * Run the /init skill to generate CLAUDE.md.
   * This executes Claude Code's init skill which analyzes the codebase
   * and generates a comprehensive CLAUDE.md file.
   */
  ipcMain.handle('skill:runInit', async () => {
    const contextService = getContextService()
    if (!contextService) {
      return { error: 'Context service not initialized' }
    }

    try {
      const projectRoot = contextService.getProjectRoot()

      // Clear ELECTRON_RUN_AS_NODE which breaks Claude Code subprocess spawning
      const savedElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE
      delete process.env.ELECTRON_RUN_AS_NODE

      try {
        // Dynamically import the SDK (ES module)
        const sdk = await import('@anthropic-ai/claude-agent-sdk')

        console.log('[DAGent] Running /init skill in:', projectRoot)
        sendProgressUpdate('Starting initialization...', 'Analyzing your codebase')

        // Create a query with the /init command
        const query = sdk.query({
          prompt: '/init',
          options: {
            cwd: projectRoot,
            permissionMode: 'acceptEdits' // Auto-accept file creation for CLAUDE.md
          }
        })

        // Stream through all messages until completion
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let lastMessage: any = null
        let messageCount = 0
        let lastTool = ''
        console.log('[DAGent] Starting /init skill execution...')

        for await (const message of query) {
          lastMessage = message
          messageCount++

          // Send progress updates to UI
          if (message.type === 'assistant') {
            console.log('[DAGent] /init: Claude is analyzing...')
            sendProgressUpdate('Analyzing codebase...', `Processing message ${messageCount}`)
          } else if (message.type === 'user') {
            console.log('[DAGent] /init: Processing user message...')
          } else if (message.type === 'result') {
            console.log('[DAGent] /init result:', (message as any).subtype)
          } else if (message.type === 'stream_event') {
            // Log tool use events for visibility and send to UI
            const event = (message as any).event
            if (event?.type === 'content_block_start' && event?.content_block?.type === 'tool_use') {
              const toolName = event.content_block.name
              console.log('[DAGent] /init: Using tool:', toolName)

              // Avoid spamming the same tool
              if (toolName !== lastTool) {
                lastTool = toolName
                let toolDesc = toolName
                if (toolName === 'Read') toolDesc = 'Reading files'
                else if (toolName === 'Glob') toolDesc = 'Finding files'
                else if (toolName === 'Grep') toolDesc = 'Searching code'
                else if (toolName === 'Write') toolDesc = 'Writing CLAUDE.md'
                else if (toolName === 'Bash') toolDesc = 'Running commands'

                sendProgressUpdate(toolDesc, `Using ${toolName} tool`)
              }
            }
          } else {
            console.log('[DAGent] /init message type:', message.type)
          }
        }

        console.log(`[DAGent] /init completed after ${messageCount} messages`)
        sendProgressUpdate('Complete!', 'CLAUDE.md has been generated')

        // Check if the final result was an error
        if (lastMessage?.type === 'result' && 'subtype' in lastMessage) {
          if (lastMessage.subtype !== 'success') {
            const errorType = lastMessage.subtype || 'unknown'
            return { error: `Init failed: ${errorType}` }
          }
          console.log('[DAGent] /init completed successfully')
        }

        return { success: true }
      } finally {
        // Restore ELECTRON_RUN_AS_NODE
        if (savedElectronRunAsNode !== undefined) {
          process.env.ELECTRON_RUN_AS_NODE = savedElectronRunAsNode
        }
      }
    } catch (error) {
      console.error('[DAGent] Failed to run /init skill:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
}
