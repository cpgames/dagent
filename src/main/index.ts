import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { registerIpcHandlers } from './ipc/handlers'
import { getAuthManager } from './auth'
import { getGitManager } from './git'
import { initializeStorage } from './ipc/storage-handlers'
import { setHistoryProjectRoot } from './ipc/history-handlers'
// TODO: Agent Process Manager - Orchestrate AI agent processes

/**
 * Main process entry point for DAGent.
 * Handles app lifecycle and initializes managers.
 */

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  // Set app user model id for Windows
  app.setAppUserModelId('com.dagent')

  // Register all IPC handlers
  registerIpcHandlers()

  // Initialize git manager with current working directory as default project
  // This also initializes storage and history managers
  const projectRoot = process.cwd()
  const gitManager = getGitManager()
  const gitResult = await gitManager.initialize(projectRoot)
  if (gitResult.success) {
    initializeStorage(projectRoot)
    setHistoryProjectRoot(projectRoot)
    console.log('[DAGent] Project initialized:', projectRoot)
  } else {
    console.log('[DAGent] Git initialization skipped:', gitResult.error)
    // Still initialize storage for non-git projects
    initializeStorage(projectRoot)
    setHistoryProjectRoot(projectRoot)
  }

  // Initialize auth manager (non-blocking)
  const auth = getAuthManager()
  auth.initialize().then((state) => {
    console.log('[DAGent] Auth initialized:', state.authenticated ? 'authenticated' : 'not authenticated')
  })

  createWindow()

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
