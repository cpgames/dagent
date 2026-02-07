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
import { getGitManager } from '../git'

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
   * Check if CLAUDE.md has uncommitted changes.
   */
  ipcMain.handle('context:hasClaudeMdChanges', async () => {
    try {
      const gitManager = getGitManager()
      if (!gitManager.isInitialized()) {
        return { hasChanges: false }
      }

      return await gitManager.hasClaudeMdChanges()
    } catch (error) {
      console.error('[DAGent] Failed to check CLAUDE.md changes:', error)
      return { hasChanges: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  /**
   * Save CLAUDE.md content to project root (without committing).
   * Use commitAndSyncClaudeMd to commit and sync to worktrees.
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

  /**
   * Commit CLAUDE.md to current branch and sync to all worktrees via git.
   * Call this when user is ready to publish their CLAUDE.md changes.
   */
  ipcMain.handle('context:commitAndSyncClaudeMd', async () => {
    const service = getService()
    if (!service) {
      return { error: 'Context service not initialized' }
    }

    try {
      const gitManager = getGitManager()
      if (!gitManager.isInitialized()) {
        return { error: 'Git not initialized' }
      }

      // First commit CLAUDE.md to current branch
      const commitResult = await gitManager.commitClaudeMd()
      if (!commitResult.success) {
        return { error: `Failed to commit: ${commitResult.error}` }
      }

      // Then sync to all worktrees via git checkout
      const syncResult = await gitManager.syncClaudeMdToWorktrees()
      if (!syncResult.success) {
        console.warn('[DAGent] Failed to sync CLAUDE.md to worktrees:', syncResult.error)
        // Don't fail - commit succeeded, sync is best-effort
      }

      return { success: true, synced: syncResult.success }
    } catch (error) {
      console.error('[DAGent] Failed to commit and sync CLAUDE.md:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
}
