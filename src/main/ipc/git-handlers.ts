/**
 * Git IPC handlers for DAGent.
 * Exposes GitManager operations to renderer process.
 */

import { ipcMain } from 'electron'
import { getGitManager } from '../git'

export function registerGitHandlers(): void {
  ipcMain.handle('git:initialize', async (_event, projectRoot: string) => {
    const manager = getGitManager()
    return manager.initialize(projectRoot)
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
}
