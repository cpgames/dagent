import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { registerIpcHandlers } from './ipc/handlers'
import { getAuthManager } from './auth'
// TODO: Git Manager - Manage git operations and repository state
// TODO: Agent Process Manager - Orchestrate AI agent processes

/**
 * Main process entry point for DAGent.
 * Handles app lifecycle and initializes managers.
 */

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  // Set app user model id for Windows
  app.setAppUserModelId('com.dagent')

  // Register all IPC handlers
  registerIpcHandlers()

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
