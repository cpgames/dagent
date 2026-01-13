import { ipcMain, dialog, BrowserWindow } from 'electron'
import { mkdir, stat } from 'fs/promises'
import path from 'path'
import { getGitManager } from '../git'
import { initializeStorage } from './storage-handlers'
import { setHistoryProjectRoot } from './history-handlers'
import { ensureDagentStructure } from '../storage/paths'

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

  /**
   * Open native folder picker for selecting parent directory.
   * Used when creating a new project.
   */
  ipcMain.handle('project:select-parent-dialog', async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender)

    const dialogOptions: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      title: 'Select Parent Folder',
      buttonLabel: 'Select'
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
   * Create a new project with .dagent-worktrees structure.
   * Creates the project folder and initializes all managers.
   */
  ipcMain.handle(
    'project:create',
    async (
      _event,
      { parentPath, projectName }: { parentPath: string; projectName: string }
    ): Promise<{ success: boolean; projectPath?: string; error?: string }> => {
      try {
        const projectPath = path.join(parentPath, projectName)

        // Check if directory already exists
        try {
          await stat(projectPath)
          return { success: false, error: `Directory "${projectName}" already exists` }
        } catch {
          // Directory doesn't exist - good, we can create it
        }

        // Create project directory
        await mkdir(projectPath, { recursive: true })

        // Create .dagent-worktrees structure
        await ensureDagentStructure(projectPath)

        // Initialize git manager for the new project
        const gitManager = getGitManager()
        const gitResult = await gitManager.initialize(projectPath)

        if (!gitResult.success) {
          console.log('[DAGent] Git initialization skipped for new project:', gitResult.error)
          // Continue anyway - project may not be a git repo yet
        }

        // Initialize storage and history for the new project
        initializeStorage(projectPath)
        setHistoryProjectRoot(projectPath)

        // Update current project path
        currentProjectPath = projectPath

        console.log('[DAGent] New project created at:', projectPath)

        return { success: true, projectPath }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[DAGent] Failed to create project:', message)
        return { success: false, error: message }
      }
    }
  )
}
