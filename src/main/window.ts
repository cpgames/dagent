import { BrowserWindow, shell, screen, app } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'

// Track panel windows by their ID
const panelWindows = new Map<string, BrowserWindow>()

/**
 * Creates the main application window with secure configuration.
 * Follows Electron security best practices:
 * - contextIsolation: true (isolates preload scripts from renderer)
 * - nodeIntegration: false (prevents renderer from accessing Node.js APIs)
 */
export function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: `DAGent v${app.getVersion()}`,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // External links open in default browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer based on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  const isDev = !require('electron').app.isPackaged
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export interface PanelWindowOptions {
  panelId: string
  featureId: string
  taskId?: string
  title?: string
}

/**
 * Creates a detached panel window for viewing specific feature panels.
 * The window loads the same React app with query params to show only the panel.
 */
export function createPanelWindow(options: PanelWindowOptions): BrowserWindow {
  const { panelId, featureId, taskId, title } = options

  // Generate unique window ID
  const windowId = `panel-${panelId}-${featureId}${taskId ? `-${taskId}` : ''}`

  // Check if window already exists
  const existingWindow = panelWindows.get(windowId)
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.focus()
    return existingWindow
  }

  // Get primary display dimensions for smart sizing
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  // Panel windows are smaller than main window
  const panelWidth = Math.min(500, Math.round(screenWidth * 0.4))
  const panelHeight = Math.min(700, Math.round(screenHeight * 0.8))

  const panelWindow = new BrowserWindow({
    width: panelWidth,
    height: panelHeight,
    show: false,
    autoHideMenuBar: true,
    title: title || `${panelId.charAt(0).toUpperCase() + panelId.slice(1)} - DAGent`,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  panelWindow.on('ready-to-show', () => {
    panelWindow.show()
  })

  panelWindow.on('closed', () => {
    panelWindows.delete(windowId)
  })

  // External links open in default browser
  panelWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Build URL with query params
  const isDev = !require('electron').app.isPackaged
  let url: string

  const params = new URLSearchParams({
    panel: panelId,
    featureId
  })
  if (taskId) {
    params.set('taskId', taskId)
  }

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    url = `${process.env['ELECTRON_RENDERER_URL']}?${params.toString()}`
  } else {
    // For production, we need to load file and pass hash params
    const htmlPath = join(__dirname, '../renderer/index.html')
    url = `file://${htmlPath}?${params.toString()}`
  }

  panelWindow.loadURL(url)

  // Store reference
  panelWindows.set(windowId, panelWindow)

  return panelWindow
}

/**
 * Close a specific panel window.
 */
export function closePanelWindow(panelId: string, featureId: string, taskId?: string): boolean {
  const windowId = `panel-${panelId}-${featureId}${taskId ? `-${taskId}` : ''}`
  const window = panelWindows.get(windowId)
  if (window && !window.isDestroyed()) {
    window.close()
    return true
  }
  return false
}

/**
 * Get all open panel windows.
 */
export function getPanelWindows(): Map<string, BrowserWindow> {
  return panelWindows
}
