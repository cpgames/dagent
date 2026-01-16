/**
 * IPC handlers for GitHub PR operations.
 * Exposes PRService methods to the renderer process.
 */

import { ipcMain } from 'electron'
import { getPRService } from '../github'
import type { CreatePRRequest } from '../github'

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
    return getPRService().createPullRequest(request)
  })
}
