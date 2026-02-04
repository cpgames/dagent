import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import { createWindow } from './window'
import { registerIpcHandlers } from './ipc/handlers'
import { getAuthManager } from './auth'
import { getGitManager } from './git'
import { initializeStorage } from './ipc/storage-handlers'
import { setHistoryProjectRoot } from './ipc/history-handlers'
import { initializeSettingsStore } from './storage/settings-store'

/**
 * Main process entry point for DAGent.
 * Handles app lifecycle and initializes managers.
 */

// Fix PATH for subprocess spawning (SDK needs to find 'node' and 'claude')
// When running from Electron, PATH might not include node's directory
function fixNodePath(): void {
  const pathsToAdd: string[] = []
  const home = process.env['USERPROFILE'] || process.env['HOME'] || ''

  // On Windows, add common node installation paths
  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const appData = process.env['APPDATA'] || ''
    const localAppData = process.env['LOCALAPPDATA'] || ''

    pathsToAdd.push(
      // Claude CLI location
      path.join(home, '.local', 'bin'),
      // Node.js locations
      path.join(programFiles, 'nodejs'),
      path.join(programFilesX86, 'nodejs'),
      path.join(appData, 'npm'),
      path.join(localAppData, 'Programs', 'node'),
      // fnm (Fast Node Manager) location
      path.join(localAppData, 'fnm_multishells'),
      path.join(home, '.fnm')
    )

    // Add nvm-windows paths if available
    const nvmHome = process.env['NVM_HOME']
    if (nvmHome) {
      pathsToAdd.push(nvmHome)
    }

    // Also check common nvm symlink location
    const nvmSymlink = process.env['NVM_SYMLINK']
    if (nvmSymlink) {
      pathsToAdd.push(nvmSymlink)
    }

    // Try to find where node actually is by checking process.execPath
    // Electron's execPath points to electron, but we can check common locations
    const nodePath = process.env['NODE_PATH']
    if (nodePath) {
      pathsToAdd.push(path.dirname(nodePath))
    }
  } else {
    // On Unix-like systems, add common locations
    pathsToAdd.push(
      path.join(home, '.local', 'bin'),
      '/usr/local/bin',
      '/usr/bin',
      path.join(home, '.nvm/current/bin'),
      path.join(home, '.volta/bin'),
      path.join(home, '.fnm')
    )
  }

  // Get current PATH
  const currentPath = process.env.PATH || ''
  const pathSeparator = process.platform === 'win32' ? ';' : ':'

  // Add paths that aren't already in PATH
  const currentPaths = currentPath.split(pathSeparator).map(p => p.toLowerCase())
  const newPaths = pathsToAdd.filter(p => p && !currentPaths.includes(p.toLowerCase()))

  if (newPaths.length > 0) {
    process.env.PATH = [...newPaths, currentPath].join(pathSeparator)
  }

  // Try to find node executable and add its directory
  try {
    const { execSync } = require('child_process')
    const cmd = process.platform === 'win32' ? 'where node' : 'which node'
    const nodePath = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0]
    if (nodePath) {
      const nodeDir = path.dirname(nodePath)
      if (!process.env.PATH?.toLowerCase().includes(nodeDir.toLowerCase())) {
        process.env.PATH = `${nodeDir};${process.env.PATH}`
      }
    }
  } catch {
    // Could not find node in PATH
  }
}

// Apply PATH fix early
fixNodePath()

// Clear ELECTRON_RUN_AS_NODE which breaks subprocess spawning
// This env var is set by VS Code and some Electron tools and causes
// the Claude Agent SDK to fail when spawning Claude Code
if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE
}

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
    initializeSettingsStore(projectRoot)
    console.log('[DAGent] Project initialized:', projectRoot)
  } else {
    console.log('[DAGent] Git initialization skipped:', gitResult.error)
    // Still initialize storage for non-git projects
    initializeStorage(projectRoot)
    setHistoryProjectRoot(projectRoot)
    initializeSettingsStore(projectRoot)
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
