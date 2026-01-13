import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getGitManager } from '../git'
import { initializeStorage } from './storage-handlers'
import { setHistoryProjectRoot } from './history-handlers'

/**
 * Current project root path.
 * Updated when project is changed via setProject.
 */
let currentProjectPath: string = process.cwd()

/**
 * Get the current project root path.
 */
export function getCurrentProjectPath(): string {
  return currentProjectPath
}

/**
 * Register all project-related IPC handlers.
 * Handles project selection, switching, and path management.
 */
export function registerProjectHandlers(): void {
  /**
   * Open native folder picker dialog.
   * Returns selected path or null if cancelled.
   */
  ipcMain.handle('project:open-dialog', async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender)

    const dialogOptions: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      title: 'Select Project Folder',
      buttonLabel: 'Open Project'
    }

    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  /**
   * Set the current project and reinitialize all managers.
   * This switches DAGent to work with a different project folder.
   */
  ipcMain.handle(
    'project:set-project',
    async (_event, projectRoot: string): Promise<{ success: boolean; error?: string }> => {
      try {
        // Initialize git manager for the new project
        const gitManager = getGitManager()
        const gitResult = await gitManager.initialize(projectRoot)

        if (!gitResult.success) {
          console.log('[DAGent] Git initialization skipped for project:', gitResult.error)
          // Continue anyway - project may not be a git repo
        }

        // Initialize storage and history for the new project
        initializeStorage(projectRoot)
        setHistoryProjectRoot(projectRoot)

        // Update current project path
        currentProjectPath = projectRoot

        console.log('[DAGent] Project switched to:', projectRoot)

        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[DAGent] Failed to set project:', message)
        return { success: false, error: message }
      }
    }
  )

  /**
   * Get the current project root path.
   */
  ipcMain.handle('project:get-current', async () => {
    return currentProjectPath
  })
}
