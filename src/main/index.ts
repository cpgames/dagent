import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import { createWindow } from './window'
import { registerIpcHandlers } from './ipc/handlers'
import { getAuthManager } from './auth'
import { getGitManager } from './git'
import { initializeStorage, getFeatureStore } from './ipc/storage-handlers'
import { setHistoryProjectRoot } from './ipc/history-handlers'
import { initializeSettingsStore } from './storage/settings-store'
import { FeatureStatusManager } from './services/feature-status-manager'
import { EventEmitter } from 'events'
// TODO: Agent Process Manager - Orchestrate AI agent processes

/**
 * Main process entry point for DAGent.
 * Handles app lifecycle and initializes managers.
 */

// Fix PATH for subprocess spawning (SDK needs to find 'node')
// When running from Electron, PATH might not include node's directory
function fixNodePath(): void {
  const pathsToAdd: string[] = []

  // On Windows, add common node installation paths
  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const appData = process.env['APPDATA'] || ''
    const localAppData = process.env['LOCALAPPDATA'] || ''

    pathsToAdd.push(
      path.join(programFiles, 'nodejs'),
      path.join(programFilesX86, 'nodejs'),
      path.join(appData, 'npm'),
      path.join(localAppData, 'Programs', 'node')
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
  } else {
    // On Unix-like systems, add common locations
    pathsToAdd.push(
      '/usr/local/bin',
      '/usr/bin',
      path.join(process.env['HOME'] || '', '.nvm/current/bin'),
      path.join(process.env['HOME'] || '', '.volta/bin')
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
    console.log('[DAGent] Added to PATH:', newPaths.join(', '))
  }
}

// Apply PATH fix early
fixNodePath()

// Clear ELECTRON_RUN_AS_NODE which breaks subprocess spawning
// This env var is set by VS Code and some Electron tools and causes
// the Claude Agent SDK to fail when spawning Claude Code
if (process.env.ELECTRON_RUN_AS_NODE) {
  console.log('[DAGent] Clearing ELECTRON_RUN_AS_NODE environment variable')
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

  // Run migration for feature statuses (not_started → planning)
  // This is a one-time migration that's idempotent
  try {
    const featureStore = getFeatureStore()
    if (featureStore) {
      const eventEmitter = new EventEmitter()
      const statusManager = new FeatureStatusManager(featureStore, eventEmitter)
      const migratedCount = await statusManager.migrateExistingFeatures()
      if (migratedCount > 0) {
        console.log(`[DAGent] Migrated ${migratedCount} feature(s) to new status types`)
      }

      // Recover features stuck in 'planning' status (happens when app closed during planning)
      const recoveredCount = await statusManager.recoverStuckPlanningFeatures()
      if (recoveredCount > 0) {
        console.log(`[DAGent] Recovered ${recoveredCount} feature(s) stuck in planning`)
      }
    }
  } catch (error) {
    console.error('[DAGent] Feature status migration/recovery failed:', error)
    // Don't block app startup on migration failure
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
