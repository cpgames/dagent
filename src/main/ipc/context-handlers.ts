/**
 * Context IPC handlers.
 * Provides renderer access to ContextService for project/feature/task context.
 */

import { ipcMain } from 'electron'
import {
  getContextService as getService,
  initContextService as initService,
  type ContextOptions,
  type FullContext
} from '../context'

// Re-export for use by other handlers (e.g., chat-handlers)
export { getService as getContextService }

/**
 * Initialize the context service with a project root.
 * Called when a project is opened or created.
 */
export function initContextService(projectRoot: string): void {
  initService(projectRoot)
  console.log('[DAGent] Context service initialized for:', projectRoot)
}

/**
 * Register all context-related IPC handlers.
 */
export function registerContextHandlers(): void {
  /**
   * Get project context (structure, CLAUDE.md, PROJECT.md, git history).
   */
  ipcMain.handle('context:getProjectContext', async () => {
    const service = getService()
    if (!service) {
      return { error: 'Context service not initialized' }
    }

    try {
      return await service.buildProjectContext()
    } catch (error) {
      console.error('[DAGent] Failed to get project context:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  /**
   * Get full context with optional feature and task context.
   */
  ipcMain.handle('context:getFullContext', async (_event, options: ContextOptions) => {
    const service = getService()
    if (!service) {
      return { error: 'Context service not initialized' }
    }

    try {
      return await service.buildFullContext(options)
    } catch (error) {
      console.error('[DAGent] Failed to get full context:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  /**
   * Get formatted prompt from full context.
   */
  ipcMain.handle('context:getFormattedPrompt', async (_event, context: FullContext) => {
    const service = getService()
    if (!service) {
      return { error: 'Context service not initialized' }
    }

    try {
      return service.formatContextAsPrompt(context)
    } catch (error) {
      console.error('[DAGent] Failed to format context prompt:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  /**
   * Get CLAUDE.md content from project root.
   */
  ipcMain.handle('context:getClaudeMd', async () => {
    const service = getService()
    if (!service) {
      return { error: 'Context service not initialized' }
    }

    try {
      const content = await service.getClaudeMd()
      return { content }
    } catch (error) {
      console.error('[DAGent] Failed to get CLAUDE.md:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  /**
   * Save CLAUDE.md content to project root.
   */
  ipcMain.handle('context:saveClaudeMd', async (_event, content: string) => {
    const service = getService()
    if (!service) {
      return { error: 'Context service not initialized' }
    }

    try {
      const { promises: fs } = await import('fs')
      const path = await import('path')
      const projectRoot = service.getProjectRoot()
      const claudeMdPath = path.join(projectRoot, 'CLAUDE.md')
      await fs.writeFile(claudeMdPath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      console.error('[DAGent] Failed to save CLAUDE.md:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
}
