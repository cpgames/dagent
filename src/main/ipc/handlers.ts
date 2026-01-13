import { ipcMain, BrowserWindow } from 'electron'
import { registerStorageHandlers } from './storage-handlers'
import { registerDagHandlers } from './dag-handlers'
import { registerExecutionHandlers } from './execution-handlers'
import { registerGitHandlers } from './git-handlers'
import { registerAgentHandlers } from './agent-handlers'
import { registerHarnessHandlers } from './harness-handlers'

/**
 * Register all IPC handlers for main process.
 * Uses ipcMain.handle for request-response pattern.
 */
export function registerIpcHandlers(): void {
  // Register storage handlers (feature, DAG, chat, log operations)
  registerStorageHandlers()
  // Register DAG engine handlers (topological sort, analysis, ready tasks)
  registerDagHandlers()
  // Register execution orchestrator handlers
  registerExecutionHandlers()
  // Register git handlers (branch operations, worktree management)
  registerGitHandlers()
  // Register agent pool handlers (agent lifecycle, status management)
  registerAgentHandlers()
  // Register harness agent handlers (intention-approval workflow)
  registerHarnessHandlers()
  // Health check - proves IPC works
  ipcMain.handle('ping', async () => {
    return 'pong'
  })

  // App info - useful for debugging
  ipcMain.handle('app:getInfo', async () => {
    return {
      version: process.env.npm_package_version || '0.0.0',
      platform: process.platform,
      arch: process.arch
    }
  })

  // Window controls
  ipcMain.handle('window:minimize', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  ipcMain.handle('window:maximize', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle('window:close', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })
}
