import { ipcMain, dialog, BrowserWindow } from 'electron'
import { mkdir, stat, writeFile, readFile } from 'fs/promises'
import path from 'path'
import { getGitManager } from '../git'
import { initializeStorage } from './storage-handlers'
import { setHistoryProjectRoot } from './history-handlers'
import { setAgentConfigProjectRoot, initializeAgentConfigs } from './agent-config-handlers'
import { ensureDagentStructure } from '../storage/paths'
import {
  getRecentProjects,
  addRecentProject,
  removeRecentProject,
  clearRecentProjects
} from '../storage/recent-projects'
import { initContextService } from './context-handlers'
import { initializeSettingsStore } from '../storage/settings-store'
import { getFeatureManagerPool } from '../git/worktree-pool-manager'

/**
 * DAGent directories that should be git-ignored.
 */
const DAGENT_GITIGNORE_PATTERNS = ['.dagent-worktrees/', '.dagent/', '.attachments/']

/**
 * Ensure DAGent directories are in .gitignore.
 * Creates .gitignore if it doesn't exist, or appends missing patterns.
 */
async function ensureDagentGitignore(projectRoot: string): Promise<void> {
  const gitignorePath = path.join(projectRoot, '.gitignore')
  let content = ''

  try {
    content = await readFile(gitignorePath, 'utf-8')
  } catch {
    // File doesn't exist - we'll create it with all patterns
  }

  const missingPatterns = DAGENT_GITIGNORE_PATTERNS.filter(
    (pattern) => !content.includes(pattern)
  )

  if (missingPatterns.length > 0) {
    const addition =
      (content.length > 0 && !content.endsWith('\n') ? '\n' : '') +
      (content.length > 0 && !content.includes('# DAGent') ? '\n# DAGent directories\n' : '') +
      missingPatterns.join('\n') +
      '\n'

    await writeFile(gitignorePath, content + addition)
    console.log('[DAGent] Updated .gitignore with:', missingPatterns.join(', '))
  }
}

/**
 * Current project root path.
 * Updated when project is changed via setProject.
 * Empty string means no project is currently open.
 */
let currentProjectPath: string = ''

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
   * Returns hasGit: false if the directory is not a git repository.
   */
  ipcMain.handle(
    'project:set-project',
    async (
      _event,
      projectRoot: string
    ): Promise<{ success: boolean; hasGit?: boolean; error?: string }> => {
      try {
        // Check if this is a git repository
        const gitManager = getGitManager()
        let isGitRepo = await gitManager.isGitRepo(projectRoot)

        // If not a git repo, initialize one
        if (!isGitRepo) {
          console.log('[DAGent] Project is not a git repository, initializing...')
          const initResult = await gitManager.initRepo(projectRoot)
          if (initResult.success) {
            isGitRepo = true
            console.log('[DAGent] Git repository initialized')
          } else {
            console.warn('[DAGent] Failed to initialize git repo:', initResult.error)
          }
        }

        // Initialize git manager if it's a git repo
        if (isGitRepo) {
          const gitResult = await gitManager.initialize(projectRoot)
          if (!gitResult.success) {
            console.log('[DAGent] Git initialization failed:', gitResult.error)
          } else {
            // Ensure DAGent directories are in .gitignore
            await ensureDagentGitignore(projectRoot)

            // Check if there are any commits - if not, create initial commit
            const hasCommits = await gitManager.hasCommits()
            if (!hasCommits) {
              console.log('[DAGent] No commits found, creating initial commit...')
              try {
                const simpleGit = (await import('simple-git')).default
                const git = simpleGit({ baseDir: projectRoot })

                // Stage all files and create initial commit
                await git.add('.')
                await git.commit('Initial commit - DAGent project')
                console.log('[DAGent] Initial commit created')
              } catch (error) {
                console.warn('[DAGent] Failed to create initial commit:', error)
              }
            }

            // Commit .gitignore if it was updated
            const gitignoreResult = await gitManager.commitGitignore()
            if (!gitignoreResult.success) {
              console.warn('[DAGent] Failed to commit .gitignore:', gitignoreResult.error)
            }

            // Commit CLAUDE.md if it exists and is untracked/modified
            const claudeMdResult = await gitManager.commitClaudeMd()
            if (!claudeMdResult.success) {
              console.warn('[DAGent] Failed to commit CLAUDE.md:', claudeMdResult.error)
            }
          }
        }

        // Initialize storage, history, agent config, context, settings, and pool manager for the new project
        initializeStorage(projectRoot)
        setHistoryProjectRoot(projectRoot)
        setAgentConfigProjectRoot(projectRoot)
        await initializeAgentConfigs(projectRoot) // Create agent config files if missing
        initContextService(projectRoot)
        initializeSettingsStore(projectRoot)

        // Initialize worktree pool manager (discovers existing pools or prepares for lazy creation)
        const poolManager = getFeatureManagerPool()
        await poolManager.initialize(projectRoot)

        // Update current project path
        currentProjectPath = projectRoot

        // Add to recent projects
        const projectName = path.basename(projectRoot)
        await addRecentProject(projectRoot, projectName)

        console.log('[DAGent] Project switched to:', projectRoot)

        return { success: true, hasGit: isGitRepo }
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

        // Initialize git repository for new project
        const gitManager = getGitManager()

        // Check if it's already a git repo
        const isRepo = await gitManager.isGitRepo(projectPath)
        if (!isRepo) {
          // Initialize new git repo
          console.log('[DAGent] Initializing git repository for new project...')
          const initResult = await gitManager.initRepo(projectPath)
          if (!initResult.success) {
            console.warn('[DAGent] Failed to initialize git repo:', initResult.error)
          } else {
            // Create initial commit so branches can be created
            const simpleGit = (await import('simple-git')).default
            const git = simpleGit({ baseDir: projectPath })

            // Ensure DAGent directories are in .gitignore
            await ensureDagentGitignore(projectPath)

            // Stage and commit
            await git.add('.')
            await git.commit('Initial commit - DAGent project')
            console.log('[DAGent] Git repository initialized with initial commit')
          }
        }

        // Now initialize git manager with the repo
        const gitResult = await gitManager.initialize(projectPath)
        if (!gitResult.success) {
          console.log('[DAGent] Git manager initialization failed:', gitResult.error)
          // Continue anyway - some features may not work without git
        }

        // Initialize storage, history, agent config, context, and settings for the new project
        initializeStorage(projectPath)
        setHistoryProjectRoot(projectPath)
        setAgentConfigProjectRoot(projectPath)
        await initializeAgentConfigs(projectPath) // Create agent config files if missing
        initContextService(projectPath)
        initializeSettingsStore(projectPath)

        // Update current project path
        currentProjectPath = projectPath

        // Add to recent projects
        await addRecentProject(projectPath, projectName)

        console.log('[DAGent] New project created at:', projectPath)

        return { success: true, projectPath }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[DAGent] Failed to create project:', message)
        return { success: false, error: message }
      }
    }
  )

  /**
   * Get recent projects list.
   */
  ipcMain.handle('project:get-recent', async () => {
    return getRecentProjects()
  })

  /**
   * Add a project to recent projects list.
   */
  ipcMain.handle('project:add-recent', async (_event, projectPath: string, name: string) => {
    await addRecentProject(projectPath, name)
  })

  /**
   * Remove a project from recent projects list.
   */
  ipcMain.handle('project:remove-recent', async (_event, projectPath: string) => {
    await removeRecentProject(projectPath)
  })

  /**
   * Clear all recent projects.
   */
  ipcMain.handle('project:clear-recent', async () => {
    await clearRecentProjects()
  })
}
