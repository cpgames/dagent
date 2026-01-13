/**
 * Git IPC handlers for DAGent.
 * Exposes GitManager operations to renderer process.
 */

import { ipcMain } from 'electron'
import { getGitManager } from '../git'
import { initializeStorage } from './storage-handlers'
import { setHistoryProjectRoot } from './history-handlers'

export function registerGitHandlers(): void {
  ipcMain.handle('git:initialize', async (_event, projectRoot: string) => {
    const manager = getGitManager()
    const result = await manager.initialize(projectRoot)
    // Also initialize storage and history with same project root
    if (result.success) {
      initializeStorage(projectRoot)
      setHistoryProjectRoot(projectRoot)
    }
    return result
  })

  ipcMain.handle('git:is-initialized', async () => {
    const manager = getGitManager()
    return manager.isInitialized()
  })

  ipcMain.handle('git:get-config', async () => {
    const manager = getGitManager()
    return manager.getConfig()
  })

  ipcMain.handle('git:get-current-branch', async () => {
    const manager = getGitManager()
    return manager.getCurrentBranch()
  })

  ipcMain.handle('git:list-branches', async () => {
    const manager = getGitManager()
    return manager.listBranches()
  })

  ipcMain.handle('git:branch-exists', async (_event, branchName: string) => {
    const manager = getGitManager()
    return manager.branchExists(branchName)
  })

  ipcMain.handle('git:create-branch', async (_event, branchName: string, checkout: boolean = false) => {
    const manager = getGitManager()
    return manager.createBranch(branchName, checkout)
  })

  ipcMain.handle('git:delete-branch', async (_event, branchName: string, force: boolean = false) => {
    const manager = getGitManager()
    return manager.deleteBranch(branchName, force)
  })

  ipcMain.handle('git:get-status', async () => {
    const manager = getGitManager()
    return manager.getStatus()
  })

  // Worktree operations
  ipcMain.handle('git:list-worktrees', async () => {
    const manager = getGitManager()
    return manager.listWorktrees()
  })

  ipcMain.handle('git:get-worktree', async (_event, worktreePath: string) => {
    const manager = getGitManager()
    return manager.getWorktree(worktreePath)
  })

  ipcMain.handle('git:worktree-exists', async (_event, worktreePath: string) => {
    const manager = getGitManager()
    return manager.worktreeExists(worktreePath)
  })

  ipcMain.handle('git:create-feature-worktree', async (_event, featureId: string) => {
    const manager = getGitManager()
    return manager.createFeatureWorktree(featureId)
  })

  ipcMain.handle(
    'git:create-task-worktree',
    async (_event, featureId: string, taskId: string) => {
      const manager = getGitManager()
      return manager.createTaskWorktree(featureId, taskId)
    }
  )

  ipcMain.handle(
    'git:remove-worktree',
    async (_event, worktreePath: string, deleteBranch: boolean = false) => {
      const manager = getGitManager()
      return manager.removeWorktree(worktreePath, deleteBranch)
    }
  )

  // Merge operations
  ipcMain.handle('git:merge-branch', async (_event, branchName: string, message?: string) => {
    const manager = getGitManager()
    return manager.mergeBranch(branchName, message)
  })

  ipcMain.handle('git:get-conflicts', async () => {
    const manager = getGitManager()
    return manager.getConflicts()
  })

  ipcMain.handle('git:abort-merge', async () => {
    const manager = getGitManager()
    return manager.abortMerge()
  })

  ipcMain.handle('git:is-merge-in-progress', async () => {
    const manager = getGitManager()
    return manager.isMergeInProgress()
  })

  ipcMain.handle(
    'git:merge-task-into-feature',
    async (
      _event,
      featureId: string,
      taskId: string,
      removeWorktreeOnSuccess: boolean = true
    ) => {
      const manager = getGitManager()
      return manager.mergeTaskIntoFeature(featureId, taskId, removeWorktreeOnSuccess)
    }
  )

  ipcMain.handle('git:get-log', async (_event, maxCount: number = 10, branch?: string) => {
    const manager = getGitManager()
    return manager.getLog(maxCount, branch)
  })

  ipcMain.handle('git:get-diff-summary', async (_event, from: string, to: string) => {
    const manager = getGitManager()
    return manager.getDiffSummary(from, to)
  })
}
