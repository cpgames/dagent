import { ipcMain } from 'electron'
import { WorktreeTokenService } from '../managers/worktree-token-service'

/**
 * Manager debug IPC handlers.
 * Exposes manager and token state for debugging/monitoring.
 */
export function registerManagerHandlers(): void {
  /**
   * Get token service status.
   * Returns status of all worktree tokens (who holds them, pending requests).
   */
  ipcMain.handle('manager:getTokenStatus', async () => {
    const tokenService = WorktreeTokenService.getInstance()
    return tokenService.getStatus()
  })

  /**
   * Get all manager statuses.
   * Returns status from FeatureRouter (all registered managers).
   */
  ipcMain.handle('manager:getAllStatus', async () => {
    // This will be implemented when FeatureRouter is instantiated
    // For now, return token status as a starting point
    const tokenService = WorktreeTokenService.getInstance()
    return {
      tokens: tokenService.getStatus(),
      managers: [] // Will be populated when router is active
    }
  })
}
