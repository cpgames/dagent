/**
 * IPC handlers for GitHub PR operations.
 * Exposes PRService methods to the renderer process.
 */

import { ipcMain } from 'electron'
import { getPRService } from '../github'
import type { CreatePRRequest } from '../github'
import { getFeatureStatusManager } from './feature-handlers'
import { getGitManager } from '../git'

/**
 * Register IPC handlers for PR operations.
 */
export function registerPRHandlers(): void {
  // Check gh CLI status (installation and authentication)
  ipcMain.handle('pr:check-gh-cli', async () => {
    return getPRService().checkGhCli()
  })

  // Create a pull request
  ipcMain.handle('pr:create', async (_event, request: CreatePRRequest) => {
    // Push branch to remote before creating PR
    const gitManager = getGitManager()
    if (gitManager && request.head) {
      console.log(`[PR] Pushing branch ${request.head} to origin`)
      const pushResult = await gitManager.pushBranch(request.head)
      if (!pushResult.success) {
        return {
          success: false,
          error: `Failed to push branch: ${pushResult.error}`
        }
      }
    }

    const result = await getPRService().createPullRequest(request)

    // Archive feature after successful PR creation
    if (result.success && request.featureId) {
      try {
        const statusManager = getFeatureStatusManager()
        await statusManager.updateFeatureStatus(request.featureId, 'archived')
        console.log(`[PR] Feature ${request.featureId} archived after PR creation`)
      } catch (error) {
        // Log error but don't fail PR creation - PR is already created
        console.error(`[PR] Failed to archive feature ${request.featureId}:`, error)
      }
    }

    return result
  })
}
