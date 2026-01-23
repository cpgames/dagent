/**
 * IPC handlers for FeatureManagerPool operations.
 * Provides frontend access to feature manager and queue management.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { getFeatureManagerPool } from '../git/worktree-pool-manager'
import { getMergeManager } from '../services/merge-manager'
import type {
  FeatureManagerInfo,
  FeatureManagerPoolStatus
} from '@shared/types/pool'
import type { MergeRequest, MergeManagerStatus } from '../services/merge-types'

/**
 * Register feature manager pool IPC handlers
 */
export function registerPoolHandlers(): void {
  /**
   * Get the current status of the feature manager pool.
   * Returns manager info, counts, and merge queue status.
   */
  ipcMain.handle('pool:getStatus', async (): Promise<FeatureManagerPoolStatus> => {
    const managerPool = getFeatureManagerPool()
    return managerPool.getStatus()
  })

  /**
   * Get detailed info about all feature managers.
   */
  ipcMain.handle('pool:getWorktrees', async (): Promise<FeatureManagerInfo[]> => {
    const managerPool = getFeatureManagerPool()
    return managerPool.getAllManagerInfo()
  })

  /**
   * Get queue position for a specific feature.
   * Returns { featureManagerId, position } or null if not found.
   */
  ipcMain.handle(
    'pool:getFeatureQueuePosition',
    async (_event, featureId: string): Promise<{ featureManagerId: number; position: number } | null> => {
      const managerPool = getFeatureManagerPool()
      return managerPool.getFeatureQueuePosition(featureId)
    }
  )

  /**
   * Assign a feature to a feature manager.
   * Returns assignment info with queue position.
   */
  ipcMain.handle(
    'pool:assignFeature',
    async (
      _event,
      featureId: string,
      targetBranch: string
    ): Promise<{ featureManagerId: number; queuePosition: number; worktreePath: string | null }> => {
      const managerPool = getFeatureManagerPool()
      return managerPool.assignFeature(featureId, targetBranch)
    }
  )

  /**
   * Remove a feature from the manager queue.
   * Used when deleting a queued feature.
   */
  ipcMain.handle(
    'pool:removeFeature',
    async (_event, featureId: string): Promise<boolean> => {
      const managerPool = getFeatureManagerPool()
      return managerPool.removeFeatureFromQueue(featureId)
    }
  )

  /**
   * Get the current merge queue from MergeManager.
   */
  ipcMain.handle('pool:getMergeQueue', async (): Promise<MergeRequest[]> => {
    const mergeManager = getMergeManager()
    return mergeManager.getStatus().pendingRequests
  })

  /**
   * Get the full merge manager status.
   */
  ipcMain.handle('merge:getStatus', async (): Promise<MergeManagerStatus> => {
    const mergeManager = getMergeManager()
    return mergeManager.getStatus()
  })

  /**
   * Cancel a pending merge request.
   */
  ipcMain.handle(
    'merge:cancelRequest',
    async (_event, requestId: string): Promise<boolean> => {
      const mergeManager = getMergeManager()
      return mergeManager.cancelRequest(requestId)
    }
  )

  /**
   * Get the worktree path for a specific manager.
   */
  ipcMain.handle(
    'pool:getWorktreePath',
    async (_event, featureManagerId: number): Promise<string | null> => {
      const managerPool = getFeatureManagerPool()
      const managerInfo = managerPool.getManagerInfo(featureManagerId)
      return managerInfo?.worktreePath || null
    }
  )

  /**
   * Initialize the manager pool with a project root.
   * Should be called when project is opened.
   */
  ipcMain.handle(
    'pool:initialize',
    async (_event, projectRoot: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const managerPool = getFeatureManagerPool()
        await managerPool.initialize(projectRoot)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  /**
   * Cleanup manager pool resources.
   * Called when switching projects or closing app.
   */
  ipcMain.handle('pool:cleanup', async (): Promise<void> => {
    const managerPool = getFeatureManagerPool()
    await managerPool.cleanup()
  })

  // Set up event forwarding to renderer
  const managerPool = getFeatureManagerPool()

  managerPool.on('feature:assigned', (data) => {
    broadcastToWindows('pool:feature-queued', data)
  })

  managerPool.on('feature:started', (data) => {
    broadcastToWindows('pool:feature-started', data)
  })

  managerPool.on('feature:completed', (data) => {
    broadcastToWindows('pool:feature-completed', data)
  })

  managerPool.on('merge:started', (data) => {
    broadcastToWindows('pool:merge-started', data)
  })

  managerPool.on('merge:completed', (data) => {
    broadcastToWindows('pool:merge-completed', data)
  })
}

/**
 * Broadcast a message to all renderer windows.
 */
function broadcastToWindows(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}
