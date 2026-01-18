import { ipcMain, BrowserWindow } from 'electron'
import { registerStorageHandlers } from './storage-handlers'
import { registerDagHandlers } from './dag-handlers'
import { registerExecutionHandlers } from './execution-handlers'
import { registerGitHandlers } from './git-handlers'
import { registerAgentHandlers } from './agent-handlers'
import { registerHarnessHandlers } from './harness-handlers'
import { registerDevAgentHandlers } from './dev-agent-handlers'
import { registerMergeAgentHandlers } from './merge-agent-handlers'
import { registerAuthHandlers } from './auth-handlers'
import { registerHistoryHandlers } from './history-handlers'
import { registerProjectHandlers } from './project-handlers'
import { registerChatHandlers } from './chat-handlers'
import { registerSdkAgentHandlers } from './sdk-agent-handlers'
import { registerAgentConfigHandlers } from './agent-config-handlers'
import { registerPMToolsHandlers } from './pm-tools-handlers'
import { registerFeatureHandlers } from './feature-handlers'
import { registerContextHandlers } from './context-handlers'
import { registerPRHandlers } from './pr-handlers'
import { registerFeatureMergeAgentHandlers } from './feature-merge-agent-handlers'
import { registerPMSpecHandlers } from './pm-spec-handlers'
import { registerDAGLayoutHandlers } from './dag-layout-handlers'
import { registerSessionHandlers } from './session-handlers'
import { registerAnalysisHandlers } from './analysis-handlers'

/**
 * Register all IPC handlers for main process.
 * Uses ipcMain.handle for request-response pattern.
 */
export function registerIpcHandlers(): void {
  // Register storage handlers (feature, DAG, chat, log operations)
  registerStorageHandlers()
  // Register feature handlers (feature deletion with cleanup)
  registerFeatureHandlers()
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
  // Register dev agent handlers (task execution lifecycle)
  registerDevAgentHandlers()
  // Register merge agent handlers (branch integration)
  registerMergeAgentHandlers()
  // Register auth handlers (credential management)
  registerAuthHandlers()
  // Register history handlers (undo/redo versioning)
  registerHistoryHandlers()
  // Register project handlers (project selection, switching)
  registerProjectHandlers()
  // Register chat handlers (AI chat integration)
  registerChatHandlers()
  // Register SDK agent handlers (Agent SDK streaming)
  registerSdkAgentHandlers()
  // Register agent configuration handlers (agent roles, persistence)
  registerAgentConfigHandlers()
  // Register PM tools handlers (task creation, listing)
  registerPMToolsHandlers()
  // Register context handlers (project/feature/task context for agents)
  registerContextHandlers()
  // Register PR handlers (GitHub PR operations via gh CLI)
  registerPRHandlers()
  // Register feature merge agent handlers (merging features into main)
  registerFeatureMergeAgentHandlers()
  // Register PM spec handlers (feature specification management)
  registerPMSpecHandlers()
  // Register DAG layout handlers (layout persistence)
  registerDAGLayoutHandlers()
  // Register session handlers (session & checkpoint management)
  registerSessionHandlers()
  // Register analysis handlers (task analysis orchestrator)
  registerAnalysisHandlers()
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

  ipcMain.handle('window:setTitle', async (event, title: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.setTitle(title)
    } else {
      console.error('[DAGent] Could not find window to set title')
    }
  })
}
