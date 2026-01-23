/**
 * GitManager - Core git operations using simple-git.
 * Provides singleton access to git functionality for DAGent.
 */

import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git'
import type {
  GitManagerConfig,
  BranchInfo,
  GitOperationResult,
  WorktreeInfo,
  FeatureWorktreeResult,
  TaskWorktreeResult,
  MergeResult,
  MergeConflict,
  TaskMergeResult,
  FeatureMergeResult,
  CommitInfo,
  DiffSummary
} from './types'
import {
  getFeatureBranchName,
  getTaskBranchName,
  getFeatureWorktreeName,
  getTaskWorktreeName
} from './types'
import * as path from 'path'
import * as fs from 'fs/promises'
import { BrowserWindow } from 'electron'

export class GitManager {
  private git: SimpleGit
  private config: GitManagerConfig
  private initialized: boolean = false

  constructor() {
    // Will be initialized with configure()
    this.git = simpleGit()
    this.config = { baseDir: '', worktreesDir: '' }
  }

  /**
   * Initialize GitManager with project configuration.
   * Must be called before any git operations.
   */
  async initialize(projectRoot: string): Promise<GitOperationResult> {
    try {
      this.config = {
        baseDir: projectRoot,
        worktreesDir: path.join(projectRoot, '.dagent-worktrees')
      }

      const options: Partial<SimpleGitOptions> = {
        baseDir: projectRoot,
        binary: 'git',
        maxConcurrentProcesses: 6
      }

      this.git = simpleGit(options)

      // Verify this is a git repository
      const isRepo = await this.git.checkIsRepo()
      if (!isRepo) {
        return { success: false, error: 'Not a git repository' }
      }

      // Ensure worktrees directory exists
      await fs.mkdir(this.config.worktreesDir, { recursive: true })

      this.initialized = true
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Check if GitManager is initialized.
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Check if a directory is a git repository (without initializing).
   */
  async isGitRepo(projectRoot: string): Promise<boolean> {
    try {
      const git = simpleGit({ baseDir: projectRoot })
      return await git.checkIsRepo()
    } catch {
      return false
    }
  }

  /**
   * Initialize a new git repository in the project directory.
   */
  async initRepo(projectRoot: string): Promise<GitOperationResult> {
    try {
      const git = simpleGit({ baseDir: projectRoot })
      await git.init()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Check if the repository has at least one commit.
   * This is required for creating branches.
   */
  async hasCommits(): Promise<boolean> {
    this.ensureInitialized()
    try {
      // Try to get the first commit - if it fails, no commits exist
      await this.git.revparse(['HEAD'])
      return true
    } catch {
      return false
    }
  }

  /**
   * Get current configuration.
   */
  getConfig(): GitManagerConfig {
    return { ...this.config }
  }

  /**
   * Get the underlying SimpleGit instance for advanced operations.
   */
  getGit(): SimpleGit {
    this.ensureInitialized()
    return this.git
  }

  /**
   * Get current branch name.
   */
  async getCurrentBranch(): Promise<string> {
    this.ensureInitialized()
    const status = await this.git.status()
    return status.current || ''
  }

  /**
   * Get the default/primary branch name (main or master).
   * Checks for 'main' first, then 'master', then falls back to current branch.
   */
  async getDefaultBranch(): Promise<string> {
    this.ensureInitialized()
    const branches = await this.git.branchLocal()

    // Prefer 'main' over 'master'
    if (branches.all.includes('main')) {
      return 'main'
    }
    if (branches.all.includes('master')) {
      return 'master'
    }

    // Fallback to current branch
    return branches.current || 'main'
  }

  /**
   * List all branches.
   */
  async listBranches(): Promise<BranchInfo[]> {
    this.ensureInitialized()
    const branchSummary = await this.git.branchLocal()
    return branchSummary.all.map((name) => ({
      name,
      current: name === branchSummary.current,
      commit: branchSummary.branches[name]?.commit || '',
      label: branchSummary.branches[name]?.label || ''
    }))
  }

  /**
   * Check if a branch exists.
   */
  async branchExists(branchName: string): Promise<boolean> {
    this.ensureInitialized()
    try {
      const branches = await this.git.branchLocal()
      return branches.all.includes(branchName)
    } catch {
      return false
    }
  }

  /**
   * Create a new branch from current HEAD.
   */
  async createBranch(branchName: string, checkout: boolean = false): Promise<GitOperationResult> {
    this.ensureInitialized()
    try {
      if (checkout) {
        await this.git.checkoutLocalBranch(branchName)
      } else {
        // Create from current branch to avoid 'master' not found errors
        const currentBranch = await this.getCurrentBranch()
        await this.git.branch([branchName, currentBranch || 'HEAD'])
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Delete a branch.
   */
  async deleteBranch(branchName: string, force: boolean = false): Promise<GitOperationResult> {
    this.ensureInitialized()
    try {
      const flag = force ? '-D' : '-d'
      await this.git.branch([flag, branchName])
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Push a branch to remote (origin).
   * Creates upstream tracking if not already set.
   *
   * @param branchName - Branch to push
   * @param force - Force push (use with caution)
   */
  async pushBranch(branchName: string, force: boolean = false): Promise<GitOperationResult> {
    this.ensureInitialized()
    try {
      const args = ['push', '-u', 'origin', branchName]
      if (force) {
        args.splice(1, 0, '--force')
      }
      await this.git.raw(args)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Get repository status.
   */
  async getStatus(): Promise<GitOperationResult> {
    this.ensureInitialized()
    try {
      const status = await this.git.status()
      // Extract only serializable properties to avoid IPC cloning issues
      // simple-git's StatusResult may contain non-serializable getters
      const serializableStatus = {
        current: status.current,
        tracking: status.tracking || null,
        detached: status.detached,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged,
        modified: status.modified,
        created: status.created,
        deleted: status.deleted,
        renamed: status.renamed,
        conflicted: status.conflicted,
        not_added: status.not_added,
        isClean: status.isClean()
      }
      return { success: true, data: serializableStatus }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  // ============================================
  // Stash Operations
  // ============================================

  /**
   * Stash current changes with an optional message.
   */
  async stash(message?: string): Promise<GitOperationResult> {
    this.ensureInitialized()
    try {
      if (message) {
        await this.git.stash(['push', '-m', message])
      } else {
        await this.git.stash(['push'])
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Pop the most recent stash.
   */
  async stashPop(): Promise<GitOperationResult> {
    this.ensureInitialized()
    try {
      await this.git.stash(['pop'])
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  // ============================================
  // Worktree Operations
  // ============================================

  /**
   * List all worktrees.
   */
  async listWorktrees(): Promise<WorktreeInfo[]> {
    this.ensureInitialized()
    try {
      // simple-git doesn't have built-in worktree support, use raw command
      const result = await this.git.raw(['worktree', 'list', '--porcelain'])
      return this.parseWorktreeList(result)
    } catch (error) {
      console.error('Failed to list worktrees:', error)
      return []
    }
  }

  /**
   * Create a feature worktree with .dagent directory.
   */
  async createFeatureWorktree(featureId: string): Promise<FeatureWorktreeResult> {
    this.ensureInitialized()

    // Helper to broadcast progress
    const broadcastProgress = (message: string): void => {
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('feature:worktree-progress', { featureId, message })
        }
      }
    }

    try {
      const branchName = getFeatureBranchName(featureId)
      const worktreeName = getFeatureWorktreeName(featureId)
      const worktreePath = path.join(this.config.worktreesDir, worktreeName)

      broadcastProgress('Checking for existing worktree...')

      // Check if worktree already exists in git's worktree list
      const worktrees = await this.listWorktrees()
      const normalizedWorktreePath = path.normalize(worktreePath)
      if (worktrees.some((w) => path.normalize(w.path) === normalizedWorktreePath)) {
        return {
          success: false,
          error: `Worktree already exists at ${worktreePath}`
        }
      }

      // Check if directory exists but is not a proper worktree (orphaned from failed attempt)
      try {
        const dirStat = await fs.stat(worktreePath)
        if (dirStat.isDirectory()) {
          broadcastProgress('Cleaning up orphaned worktree directory...')
          // Remove the orphaned directory
          await fs.rm(worktreePath, { recursive: true, force: true })
          console.log(`[GitManager] Removed orphaned worktree directory: ${worktreePath}`)
        }
      } catch {
        // Directory doesn't exist, which is expected
      }

      broadcastProgress('Creating feature branch...')

      // Create branch if it doesn't exist
      const branchExistsResult = await this.branchExists(branchName)
      if (!branchExistsResult) {
        // Create from current branch (HEAD) to avoid 'master' not found errors
        const currentBranch = await this.getCurrentBranch()
        await this.git.branch([branchName, currentBranch || 'HEAD'])
      }

      broadcastProgress('Copying project files to worktree...')

      // Create worktree (this is the slow operation for large repos)
      await this.git.raw(['worktree', 'add', worktreePath, branchName])

      broadcastProgress('Setting up .dagent directory...')

      // Create .dagent directory in worktree
      const dagentPath = path.join(worktreePath, '.dagent')
      await fs.mkdir(dagentPath, { recursive: true })
      await fs.mkdir(path.join(dagentPath, 'nodes'), { recursive: true })
      await fs.mkdir(path.join(dagentPath, 'dag_history'), { recursive: true })

      broadcastProgress('Worktree created successfully')

      return {
        success: true,
        worktreePath,
        branchName,
        dagentPath
      }
    } catch (error) {
      broadcastProgress(`Error: ${(error as Error).message}`)
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Create a task worktree branching from feature branch.
   */
  async createTaskWorktree(featureId: string, taskId: string): Promise<TaskWorktreeResult> {
    this.ensureInitialized()
    try {
      const featureBranchName = getFeatureBranchName(featureId)
      const taskBranchName = getTaskBranchName(featureId, taskId)
      const worktreeName = getTaskWorktreeName(featureId, taskId)
      const worktreePath = path.join(this.config.worktreesDir, worktreeName)

      // Check if worktree already exists (orphaned from previous failed run)
      const worktrees = await this.listWorktrees()
      const normalizedWorktreePath = path.normalize(worktreePath)
      const existingWorktree = worktrees.find((w) => path.normalize(w.path) === normalizedWorktreePath)
      if (existingWorktree) {
        console.log(`[GitManager] Worktree already exists at ${worktreePath}, removing orphaned worktree...`)
        try {
          // Force remove the orphaned worktree
          await this.git.raw(['worktree', 'remove', existingWorktree.path, '--force'])
          // Also prune to clean up any stale entries
          await this.git.raw(['worktree', 'prune'])
        } catch (removeError) {
          console.warn(`[GitManager] Could not remove orphaned worktree: ${removeError}`)
          return {
            success: false,
            error: `Worktree already exists at ${worktreePath} and could not be removed`
          }
        }
      }

      // Check if directory exists but isn't a registered worktree (orphaned directory)
      try {
        await fs.access(worktreePath)
        // Directory exists but isn't a registered worktree - remove it
        console.log(`[GitManager] Orphaned directory exists at ${worktreePath}, removing...`)
        await fs.rm(worktreePath, { recursive: true, force: true })
      } catch {
        // Directory doesn't exist, which is expected - continue
      }

      // Create feature branch if it doesn't exist (auto-recovery for failed feature setup)
      const featureBranchExists = await this.branchExists(featureBranchName)
      if (!featureBranchExists) {
        console.log(`[GitManager] Feature branch ${featureBranchName} not found, creating it...`)
        // Create from current branch (HEAD) to avoid 'master' not found errors
        const currentBranch = await this.getCurrentBranch()
        await this.git.branch([featureBranchName, currentBranch || 'HEAD'])
      }

      // Check if task branch already exists (orphaned from previous failed run)
      const taskBranchExists = await this.branchExists(taskBranchName)
      if (taskBranchExists) {
        console.log(`[GitManager] Task branch ${taskBranchName} already exists, deleting orphaned branch...`)
        // Force delete the orphaned branch so we can create fresh
        try {
          await this.git.branch(['-D', taskBranchName])
        } catch (deleteError) {
          console.warn(`[GitManager] Could not delete orphaned branch: ${deleteError}`)
          // Continue anyway - the worktree add might still work if branch was already merged
        }
      }

      // Get the commit SHA of the feature branch to create task branch from
      // We use the commit SHA instead of branch name because the feature branch
      // may be checked out in the feature worktree, and git doesn't allow
      // checking out the same branch in multiple worktrees.
      let featureCommit: string
      try {
        const result = await this.git.revparse([featureBranchName])
        featureCommit = result.trim()
        console.log(`[GitManager] Feature branch ${featureBranchName} is at commit ${featureCommit}`)
      } catch (revParseError) {
        console.error(`[GitManager] Failed to get commit for ${featureBranchName}:`, revParseError)
        return { success: false, error: `Failed to resolve feature branch: ${featureBranchName}` }
      }

      // Create task branch from feature branch's commit and worktree
      console.log(`[GitManager] Creating worktree at ${worktreePath} with branch ${taskBranchName} from commit ${featureCommit}`)
      await this.git.raw([
        'worktree',
        'add',
        '-b',
        taskBranchName,
        worktreePath,
        featureCommit  // Use commit SHA instead of branch name
      ])

      // Verify worktree was created successfully
      const gitFile = path.join(worktreePath, '.git')
      try {
        await fs.access(gitFile)
        console.log(`[GitManager] Worktree created successfully at ${worktreePath}`)
      } catch {
        console.error(`[GitManager] Worktree creation failed - .git file not found at ${gitFile}`)
        return { success: false, error: 'Worktree creation failed - .git file not found' }
      }

      return {
        success: true,
        worktreePath,
        branchName: taskBranchName
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Remove a worktree (and optionally its branch).
   */
  async removeWorktree(
    worktreePath: string,
    deleteBranch: boolean = false
  ): Promise<GitOperationResult> {
    this.ensureInitialized()
    try {
      // Get worktree info first
      const worktrees = await this.listWorktrees()
      const normalizedWorktreePath = path.normalize(worktreePath)
      const worktree = worktrees.find((w) => path.normalize(w.path) === normalizedWorktreePath)

      if (!worktree) {
        return { success: false, error: `Worktree not found at ${worktreePath}` }
      }

      // Remove worktree (use the path as git knows it)
      await this.git.raw(['worktree', 'remove', worktree.path, '--force'])

      // Clean up any remaining empty directory (git worktree remove sometimes leaves them)
      try {
        await fs.rm(normalizedWorktreePath, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors - directory might already be gone
      }

      // Delete branch if requested
      if (deleteBranch && worktree.branch && worktree.branch !== 'HEAD') {
        await this.deleteBranch(worktree.branch, true)
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Get a worktree by its path.
   */
  async getWorktree(worktreePath: string): Promise<WorktreeInfo | null> {
    const worktrees = await this.listWorktrees()
    // Normalize paths for comparison (git uses forward slashes, Node.js on Windows uses backslashes)
    const normalizedPath = path.normalize(worktreePath)
    return worktrees.find((w) => path.normalize(w.path) === normalizedPath) || null
  }

  /**
   * Check if a worktree exists.
   */
  async worktreeExists(worktreePath: string): Promise<boolean> {
    const worktree = await this.getWorktree(worktreePath)
    return worktree !== null
  }

  /**
   * Prune worktree administrative files.
   * Removes stale worktree references from .git/worktrees.
   */
  async pruneWorktrees(): Promise<GitOperationResult> {
    this.ensureInitialized()
    try {
      await this.git.raw(['worktree', 'prune'])
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Parse worktree list output from git.
   */
  private parseWorktreeList(output: string): WorktreeInfo[] {
    const worktrees: WorktreeInfo[] = []
    const entries = output.trim().split('\n\n')

    for (const entry of entries) {
      if (!entry.trim()) continue

      const lines = entry.split('\n')
      const info: Partial<WorktreeInfo> = {
        isDetached: false,
        isLocked: false,
        prunable: false
      }

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          info.path = line.substring(9)
        } else if (line.startsWith('HEAD ')) {
          info.head = line.substring(5)
        } else if (line.startsWith('branch ')) {
          info.branch = line.substring(7).replace('refs/heads/', '')
        } else if (line === 'detached') {
          info.isDetached = true
          info.branch = 'HEAD'
        } else if (line.startsWith('locked')) {
          info.isLocked = true
        } else if (line.startsWith('prunable')) {
          info.prunable = true
        }
      }

      if (info.path && info.head) {
        worktrees.push(info as WorktreeInfo)
      }
    }

    return worktrees
  }

  // ============================================
  // Merge Operations (Phase 4 - 04-03)
  // ============================================

  /**
   * Merge a branch into current branch.
   */
  async mergeBranch(branchName: string, message?: string): Promise<MergeResult> {
    this.ensureInitialized()
    try {
      const mergeOptions = message ? ['--no-ff', '-m', message] : ['--no-ff']
      await this.git.merge([branchName, ...mergeOptions])

      // Get the commit hash after successful merge
      const log = await this.git.log({ maxCount: 1 })
      const commitHash = log.latest?.hash

      return {
        success: true,
        merged: true,
        commitHash
      }
    } catch (error) {
      const errorMsg = (error as Error).message

      // Check for merge conflicts
      if (errorMsg.includes('CONFLICT') || errorMsg.includes('Automatic merge failed')) {
        const conflicts = await this.getConflicts()
        return {
          success: false,
          merged: false,
          conflicts,
          error: 'Merge conflicts detected'
        }
      }

      return { success: false, merged: false, error: errorMsg }
    }
  }

  /**
   * Get current merge conflicts.
   */
  async getConflicts(): Promise<MergeConflict[]> {
    this.ensureInitialized()
    try {
      const status = await this.git.status()
      const conflicts: MergeConflict[] = []

      for (const file of status.conflicted) {
        conflicts.push({
          file,
          type: 'both_modified' // Simplified - actual type requires more parsing
        })
      }

      return conflicts
    } catch {
      return []
    }
  }

  /**
   * Abort an in-progress merge.
   */
  async abortMerge(): Promise<GitOperationResult> {
    this.ensureInitialized()
    try {
      await this.git.merge(['--abort'])
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Check if there's a merge in progress.
   */
  async isMergeInProgress(): Promise<boolean> {
    this.ensureInitialized()
    try {
      const gitDir = path.join(this.config.baseDir, '.git')
      const mergeHead = path.join(gitDir, 'MERGE_HEAD')
      await fs.access(mergeHead)
      return true
    } catch {
      return false
    }
  }

  /**
   * Merge a task branch into its feature branch.
   * This is the main operation for completing a task.
   *
   * The merge is performed inside the FEATURE worktree (not task worktree):
   * 1. Verify task worktree has no uncommitted changes
   * 2. Use the feature worktree (which already has feature branch checked out)
   * 3. Merge the task branch into the feature branch
   * 4. Optionally remove the task worktree and delete the task branch
   *
   * This approach avoids the "branch already checked out" error since we
   * don't need to checkout the feature branch - it's already checked out
   * in the feature worktree.
   */
  async mergeTaskIntoFeature(
    featureId: string,
    taskId: string,
    removeWorktreeOnSuccess: boolean = true
  ): Promise<TaskMergeResult> {
    this.ensureInitialized()
    try {
      const featureBranchName = getFeatureBranchName(featureId)
      const taskBranchName = getTaskBranchName(featureId, taskId)
      const taskWorktreeName = getTaskWorktreeName(featureId, taskId)
      const taskWorktreePath = path.join(this.config.worktreesDir, taskWorktreeName)
      const featureWorktreeName = getFeatureWorktreeName(featureId)
      const featureWorktreePath = path.join(this.config.worktreesDir, featureWorktreeName)

      // Verify task worktree exists
      const taskWorktree = await this.getWorktree(taskWorktreePath)
      if (!taskWorktree) {
        return {
          success: false,
          merged: false,
          worktreeRemoved: false,
          branchDeleted: false,
          error: `Task worktree not found at ${taskWorktreePath}`
        }
      }

      // Verify feature worktree exists
      const featureWorktree = await this.getWorktree(featureWorktreePath)
      if (!featureWorktree) {
        return {
          success: false,
          merged: false,
          worktreeRemoved: false,
          branchDeleted: false,
          error: `Feature worktree not found at ${featureWorktreePath}`
        }
      }

      // Create git instances for both worktrees
      const taskGit = simpleGit({ baseDir: taskWorktreePath })
      const featureGit = simpleGit({ baseDir: featureWorktreePath })

      // Helper to filter out DAGent directories from status (these are metadata, not code)
      // These should be in .gitignore, but filter just in case
      const filterDagentFiles = (files: string[]): string[] =>
        files.filter((f) =>
          !f.startsWith('.dagent/') &&
          !f.startsWith('.dagent\\') &&
          !f.startsWith('.dagent-worktrees/') &&
          !f.startsWith('.dagent-worktrees\\') &&
          !f.startsWith('.attachments/') &&
          !f.startsWith('.attachments\\')
        )

      // Ensure all changes in task worktree are committed (excluding .dagent/ metadata)
      const taskStatus = await taskGit.status()
      const taskModified = filterDagentFiles(taskStatus.modified)
      const taskNotAdded = filterDagentFiles(taskStatus.not_added)
      const taskStaged = filterDagentFiles(taskStatus.staged)
      if (taskModified.length > 0 || taskNotAdded.length > 0 || taskStaged.length > 0) {
        return {
          success: false,
          merged: false,
          worktreeRemoved: false,
          branchDeleted: false,
          error: 'Task worktree has uncommitted changes'
        }
      }

      // Ensure feature worktree is clean (excluding .dagent/ metadata)
      const featureStatus = await featureGit.status()
      const featureModified = filterDagentFiles(featureStatus.modified)
      const featureNotAdded = filterDagentFiles(featureStatus.not_added)
      const featureStaged = filterDagentFiles(featureStatus.staged)
      if (featureModified.length > 0 || featureNotAdded.length > 0 || featureStaged.length > 0) {
        return {
          success: false,
          merged: false,
          worktreeRemoved: false,
          branchDeleted: false,
          error: 'Feature worktree has uncommitted changes'
        }
      }

      // Verify feature worktree is on the feature branch
      const currentBranch = await featureGit.revparse(['--abbrev-ref', 'HEAD'])
      if (currentBranch.trim() !== featureBranchName) {
        return {
          success: false,
          merged: false,
          worktreeRemoved: false,
          branchDeleted: false,
          error: `Feature worktree is on branch '${currentBranch.trim()}', expected '${featureBranchName}'`
        }
      }

      // Perform merge of task branch into feature branch in the FEATURE worktree
      const mergeMessage = `Merge task ${taskId} into feature ${featureId}`
      let mergeResult: MergeResult

      try {
        await featureGit.merge([taskBranchName, '--no-ff', '-m', mergeMessage])
        // Get the commit hash after successful merge
        const log = await featureGit.log({ maxCount: 1 })
        mergeResult = {
          success: true,
          merged: true,
          commitHash: log.latest?.hash
        }
      } catch (error) {
        const errorMsg = (error as Error).message

        if (errorMsg.includes('CONFLICT') || errorMsg.includes('Automatic merge failed')) {
          // Get conflicts
          const mergeStatus = await featureGit.status()
          const conflicts: MergeConflict[] = mergeStatus.conflicted.map((file) => ({
            file,
            type: 'both_modified' as const
          }))

          // Abort the merge to clean up
          try {
            await featureGit.merge(['--abort'])
          } catch {
            // Ignore abort errors
          }

          return {
            success: false,
            merged: false,
            conflicts,
            worktreeRemoved: false,
            branchDeleted: false,
            error: 'Merge conflicts detected'
          }
        }

        return {
          success: false,
          merged: false,
          worktreeRemoved: false,
          branchDeleted: false,
          error: errorMsg
        }
      }

      // On successful merge, optionally remove task worktree and branch
      let worktreeRemoved = false
      let branchDeleted = false

      if (removeWorktreeOnSuccess && mergeResult.merged) {
        // Task worktree is still on task branch, so we can remove it directly
        const removeResult = await this.removeWorktree(taskWorktreePath, false) // Don't delete task branch yet
        worktreeRemoved = removeResult.success

        // Now delete the task branch (it's been merged into feature branch)
        // Use -D (force) because -d checks against current HEAD (master), not feature branch
        if (worktreeRemoved) {
          try {
            await this.git.branch(['-D', taskBranchName])
            branchDeleted = true
          } catch {
            // Task branch might already be deleted or have issues, continue anyway
            console.warn(`[GitManager] Could not delete task branch ${taskBranchName}`)
          }
        }
      }

      return {
        success: true,
        merged: true,
        commitHash: mergeResult.commitHash,
        worktreeRemoved,
        branchDeleted
      }
    } catch (error) {
      return {
        success: false,
        merged: false,
        worktreeRemoved: false,
        branchDeleted: false,
        error: (error as Error).message
      }
    }
  }

  /**
   * Get commit log for a branch or worktree.
   */
  async getLog(maxCount: number = 10, branch?: string): Promise<CommitInfo[]> {
    this.ensureInitialized()
    try {
      const options: Record<string, string | number | undefined> = {
        maxCount,
        format: {
          hash: '%H',
          date: '%aI',
          message: '%s',
          author_name: '%an',
          author_email: '%ae'
        } as unknown as string
      }

      const result = await this.git.log(branch ? { ...options, from: branch } : options)
      return result.all.map((entry) => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        author: entry.author_name,
        email: entry.author_email
      }))
    } catch {
      return []
    }
  }

  /**
   * Get diff summary between two refs.
   */
  async getDiffSummary(from: string, to: string): Promise<DiffSummary> {
    this.ensureInitialized()
    try {
      const summary = await this.git.diffSummary([from, to])
      return {
        files: summary.files.length,
        insertions: summary.insertions,
        deletions: summary.deletions,
        changed: summary.files.map((f) => f.file)
      }
    } catch {
      return { files: 0, insertions: 0, deletions: 0, changed: [] }
    }
  }

  /**
   * Merge a feature branch into the main/working branch.
   * This is used when completing a feature and merging all its work to main.
   *
   * Unlike task merges (which use worktrees), this operates on the main repo:
   * 1. Ensure we're on the target branch (or checkout)
   * 2. Merge feature branch into target
   * 3. Optionally delete the feature branch after successful merge
   */
  async mergeFeatureIntoMain(
    featureId: string,
    deleteBranchOnSuccess: boolean = false,
    targetBranch: string = 'main',
    featureBranchOverride?: string
  ): Promise<FeatureMergeResult> {
    this.ensureInitialized()
    // Use provided branch name if available (for legacy features), otherwise compute from ID
    const featureBranchName = featureBranchOverride || getFeatureBranchName(featureId)
    let originalBranch: string | null = null

    try {
      // Verify feature branch exists
      const featureBranchExists = await this.branchExists(featureBranchName)
      if (!featureBranchExists) {
        return {
          success: false,
          merged: false,
          branchDeleted: false,
          error: `Feature branch ${featureBranchName} not found`
        }
      }

      // Verify target branch exists
      const targetBranchExists = await this.branchExists(targetBranch)
      if (!targetBranchExists) {
        return {
          success: false,
          merged: false,
          branchDeleted: false,
          error: `Target branch ${targetBranch} not found`
        }
      }

      // Check for uncommitted changes (require clean working directory)
      const status = await this.git.status()
      if (!status.isClean()) {
        return {
          success: false,
          merged: false,
          branchDeleted: false,
          error: 'Working directory has uncommitted changes. Please commit or stash changes first.'
        }
      }

      // Get current branch and switch to target if needed
      const currentBranch = await this.getCurrentBranch()
      if (currentBranch !== targetBranch) {
        originalBranch = currentBranch
        await this.git.checkout(targetBranch)
      }

      // Perform the merge with no-fast-forward to preserve branch history
      const mergeMessage = `Merge feature '${featureId}' into ${targetBranch}`
      try {
        await this.git.merge([featureBranchName, '--no-ff', '-m', mergeMessage])
      } catch (error) {
        const errorMsg = (error as Error).message

        // Check for merge conflicts
        if (errorMsg.includes('CONFLICT') || errorMsg.includes('Automatic merge failed')) {
          const conflicts = await this.getConflicts()

          // Don't abort - let caller decide how to handle conflicts
          // Return to original branch if we switched
          if (originalBranch) {
            try {
              await this.git.merge(['--abort'])
              await this.git.checkout(originalBranch)
            } catch {
              // Ignore cleanup errors
            }
          }

          return {
            success: false,
            merged: false,
            conflicts,
            branchDeleted: false,
            error: 'Merge conflicts detected'
          }
        }

        // Return to original branch on other errors
        if (originalBranch) {
          try {
            await this.git.checkout(originalBranch)
          } catch {
            // Ignore checkout errors
          }
        }

        return {
          success: false,
          merged: false,
          branchDeleted: false,
          error: errorMsg
        }
      }

      // Get commit hash after successful merge
      const log = await this.git.log({ maxCount: 1 })
      const commitHash = log.latest?.hash

      // Optionally delete feature branch and all task branches
      let branchDeleted = false
      if (deleteBranchOnSuccess) {
        try {
          // First, remove the feature worktree (it has the feature branch checked out)
          const featureWorktreeName = getFeatureWorktreeName(featureId)
          const featureWorktreePath = path.join(this.config.worktreesDir, featureWorktreeName)
          const featureWorktreeExists = await this.worktreeExists(featureWorktreePath)
          if (featureWorktreeExists) {
            console.log(`[GitManager] Removing feature worktree at ${featureWorktreePath}`)
            const removeResult = await this.removeWorktree(featureWorktreePath, false)
            if (!removeResult.success) {
              console.warn(`[GitManager] Could not remove feature worktree: ${removeResult.error}`)
            }
          }

          // Also remove any leftover task worktrees for this feature
          const worktrees = await this.listWorktrees()
          const featureWorktreePrefix = `${featureId}/`
          for (const worktree of worktrees) {
            const worktreeName = path.basename(worktree.path)
            if (worktreeName.startsWith(featureWorktreePrefix) || worktree.path.includes(featureId)) {
              try {
                console.log(`[GitManager] Removing leftover task worktree at ${worktree.path}`)
                await this.removeWorktree(worktree.path, false)
              } catch {
                // Ignore errors removing task worktrees
              }
            }
          }

          // Now delete the feature branch (no longer checked out in any worktree)
          await this.git.branch(['-D', featureBranchName])
          branchDeleted = true

          // Also clean up any leftover task branches for this feature
          const featurePrefix = `feature/${featureId.replace(/^feature-/, '')}/`
          const branches = await this.listBranches()
          for (const branch of branches) {
            if (branch.name.startsWith(featurePrefix) && branch.name !== featureBranchName) {
              try {
                await this.git.branch(['-D', branch.name])
              } catch {
                // Ignore errors deleting task branches
              }
            }
          }
        } catch (error) {
          console.warn(`[GitManager] Could not delete feature branch: ${(error as Error).message}`)
        }
      }

      // Return to original branch if we switched
      if (originalBranch) {
        try {
          await this.git.checkout(originalBranch)
        } catch {
          // Ignore checkout errors - merge was successful
        }
      }

      return {
        success: true,
        merged: true,
        commitHash,
        branchDeleted
      }
    } catch (error) {
      // Return to original branch on unexpected errors
      if (originalBranch) {
        try {
          await this.git.checkout(originalBranch)
        } catch {
          // Ignore checkout errors
        }
      }

      return {
        success: false,
        merged: false,
        branchDeleted: false,
        error: (error as Error).message
      }
    }
  }

  // ===========================================================================
  // Pool Worktree Operations
  // ===========================================================================

  /**
   * Create a worktree for a feature manager.
   * Manager worktrees are reusable across features.
   */
  async createManagerWorktree(
    featureManagerId: number,
    branchName: string,
    worktreePath: string
  ): Promise<{ success: boolean; error?: string }> {
    this.ensureInitialized()

    try {
      console.log(`[GitManager] Creating manager worktree ${featureManagerId}: branch=${branchName}, path=${worktreePath}`)

      // Check if worktree already exists
      const worktrees = await this.listWorktrees()
      const normalizedPath = path.normalize(worktreePath)
      if (worktrees.some((w) => path.normalize(w.path) === normalizedPath)) {
        console.log(`[GitManager] Manager worktree ${featureManagerId} already exists`)
        return { success: true } // Already exists is OK for managers
      }

      // Clean up orphaned directory if exists
      try {
        const dirStat = await fs.stat(worktreePath)
        if (dirStat.isDirectory()) {
          await fs.rm(worktreePath, { recursive: true, force: true })
          console.log(`[GitManager] Removed orphaned manager directory: ${worktreePath}`)
        }
      } catch {
        // Directory doesn't exist, expected
      }

      // Create branch if it doesn't exist
      const branchExists = await this.branchExists(branchName)
      if (!branchExists) {
        const currentBranch = await this.getCurrentBranch()
        await this.git.branch([branchName, currentBranch || 'HEAD'])
        console.log(`[GitManager] Created manager branch ${branchName}`)
      }

      // Create worktree
      await this.git.raw(['worktree', 'add', worktreePath, branchName])

      // Create .dagent directory in pool worktree
      const dagentPath = path.join(worktreePath, '.dagent')
      await fs.mkdir(dagentPath, { recursive: true })
      await fs.mkdir(path.join(dagentPath, 'nodes'), { recursive: true })
      await fs.mkdir(path.join(dagentPath, 'sessions'), { recursive: true })

      console.log(`[GitManager] Manager worktree ${featureManagerId} created successfully`)
      return { success: true }
    } catch (error) {
      console.error(`[GitManager] Failed to create manager worktree ${featureManagerId}:`, error)
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Reset a manager branch to sync with a target branch.
   * Used to prepare manager for a new feature.
   */
  async resetManagerBranch(
    featureManagerId: number,
    _managerBranchName: string,  // Kept for API compatibility
    targetBranch: string,
    worktreePath: string
  ): Promise<{ success: boolean; error?: string }> {
    this.ensureInitialized()

    try {
      console.log(`[GitManager] Resetting manager ${featureManagerId} to ${targetBranch}`)

      // Create a git instance for the manager worktree
      const managerGit = simpleGit({ baseDir: worktreePath })

      // Fetch latest from origin if available
      try {
        await managerGit.fetch()
      } catch {
        // Ignore fetch errors (might not have remote)
      }

      // Hard reset manager branch to target branch
      await managerGit.reset(['--hard', targetBranch])

      // Clean any untracked files
      await managerGit.clean('f', ['-d'])

      console.log(`[GitManager] Manager ${featureManagerId} reset to ${targetBranch}`)
      return { success: true }
    } catch (error) {
      console.error(`[GitManager] Failed to reset manager ${featureManagerId}:`, error)
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Merge a source branch INTO the manager branch (first phase of bidirectional merge).
   * Conflicts are resolved in the manager worktree.
   */
  async mergeIntoManagerBranch(
    featureManagerId: number,
    sourceBranch: string
  ): Promise<MergeResult> {
    this.ensureInitialized()

    // Find manager worktree path
    const worktrees = await this.listWorktrees()
    const managerWorktree = worktrees.find((w) => w.path.includes(`worktree-`) || w.path.includes(`pool-worktree-${featureManagerId}`))

    if (!managerWorktree) {
      return {
        success: false,
        merged: false,
        error: `Manager worktree ${featureManagerId} not found`
      }
    }

    try {
      console.log(`[GitManager] Merging ${sourceBranch} INTO manager ${featureManagerId}`)

      const managerGit = simpleGit({ baseDir: managerWorktree.path })

      // Fetch latest
      try {
        await managerGit.fetch()
      } catch {
        // Ignore fetch errors
      }

      // Try to merge
      try {
        const result = await managerGit.merge([sourceBranch, '--no-ff', '-m', `Merge ${sourceBranch} into manager`])

        if (result.failed) {
          // Get conflict list
          const status = await managerGit.status()
          const conflicts: MergeConflict[] = status.conflicted.map((file) => ({
            file,
            type: 'both_modified' as const
          }))

          return {
            success: false,
            merged: false,
            conflicts,
            error: 'Merge conflicts detected'
          }
        }

        console.log(`[GitManager] Successfully merged ${sourceBranch} into manager ${featureManagerId}`)
        return {
          success: true,
          merged: true,
          commitHash: (result as { hash?: string }).hash || undefined
        }
      } catch (mergeError) {
        // Check for conflicts
        const status = await managerGit.status()
        if (status.conflicted.length > 0) {
          const conflicts: MergeConflict[] = status.conflicted.map((file) => ({
            file,
            type: 'both_modified' as const
          }))

          return {
            success: false,
            merged: false,
            conflicts,
            error: 'Merge conflicts detected'
          }
        }

        throw mergeError
      }
    } catch (error) {
      console.error(`[GitManager] Failed to merge into manager ${featureManagerId}:`, error)
      return {
        success: false,
        merged: false,
        error: (error as Error).message
      }
    }
  }

  /**
   * Merge the manager branch INTO a target branch (second phase of bidirectional merge).
   * This should be clean after first phase resolved conflicts.
   */
  async mergeManagerIntoTarget(
    featureManagerId: number,
    targetBranch: string
  ): Promise<MergeResult> {
    this.ensureInitialized()

    // Find manager worktree
    const worktrees = await this.listWorktrees()
    const managerWorktree = worktrees.find((w) => w.path.includes(`worktree-`) || w.path.includes(`pool-worktree-${featureManagerId}`))

    if (!managerWorktree) {
      return {
        success: false,
        merged: false,
        error: `Manager worktree ${featureManagerId} not found`
      }
    }

    const managerBranchName = managerWorktree.branch

    try {
      console.log(`[GitManager] Merging manager ${featureManagerId} (${managerBranchName}) INTO ${targetBranch}`)

      // Switch to target branch in main repo
      await this.git.checkout(targetBranch)

      // Merge manager branch into target
      try {
        const result = await this.git.merge([managerBranchName!, '--no-ff', '-m', `Merge manager-${featureManagerId} into ${targetBranch}`])

        if (result.failed) {
          const status = await this.git.status()
          const conflicts: MergeConflict[] = status.conflicted.map((file) => ({
            file,
            type: 'both_modified' as const
          }))

          return {
            success: false,
            merged: false,
            conflicts,
            error: 'Unexpected conflicts during manager->target merge'
          }
        }

        console.log(`[GitManager] Successfully merged manager ${featureManagerId} into ${targetBranch}`)
        return {
          success: true,
          merged: true,
          commitHash: (result as { hash?: string }).hash || undefined
        }
      } catch (mergeError) {
        const status = await this.git.status()
        if (status.conflicted.length > 0) {
          const conflicts: MergeConflict[] = status.conflicted.map((file) => ({
            file,
            type: 'both_modified' as const
          }))

          return {
            success: false,
            merged: false,
            conflicts,
            error: 'Unexpected conflicts during manager->target merge'
          }
        }

        throw mergeError
      }
    } catch (error) {
      console.error(`[GitManager] Failed to merge manager ${featureManagerId} into ${targetBranch}:`, error)
      return {
        success: false,
        merged: false,
        error: (error as Error).message
      }
    }
  }

  /**
   * Merge a source branch INTO the current branch in a worktree.
   * Generic method used by MergeManager for preparation merges.
   */
  async mergeInWorktree(
    worktreePath: string,
    sourceBranch: string
  ): Promise<MergeResult> {
    this.ensureInitialized()

    try {
      console.log(`[GitManager] Merging ${sourceBranch} in worktree ${worktreePath}`)

      const worktreeGit = simpleGit({ baseDir: worktreePath })

      // Fetch latest
      try {
        await worktreeGit.fetch()
      } catch {
        // Ignore fetch errors (may be offline)
      }

      // Try to merge
      try {
        const result = await worktreeGit.merge([sourceBranch, '--no-ff', '-m', `Merge ${sourceBranch}`])

        if (result.failed) {
          const status = await worktreeGit.status()
          const conflicts: MergeConflict[] = status.conflicted.map((file) => ({
            file,
            type: 'both_modified' as const
          }))

          return {
            success: false,
            merged: false,
            conflicts,
            error: 'Merge conflicts detected'
          }
        }

        console.log(`[GitManager] Successfully merged ${sourceBranch} in worktree`)
        return {
          success: true,
          merged: true,
          commitHash: (result as { hash?: string }).hash || undefined
        }
      } catch (mergeError) {
        const status = await worktreeGit.status()
        if (status.conflicted.length > 0) {
          const conflicts: MergeConflict[] = status.conflicted.map((file) => ({
            file,
            type: 'both_modified' as const
          }))

          return {
            success: false,
            merged: false,
            conflicts,
            error: 'Merge conflicts detected'
          }
        }

        throw mergeError
      }
    } catch (error) {
      console.error(`[GitManager] Failed to merge in worktree:`, error)
      return {
        success: false,
        merged: false,
        error: (error as Error).message
      }
    }
  }

  /**
   * Merge a source branch INTO a target branch in the main repository.
   * Generic method used by MergeManager for completion merges.
   */
  async mergeBranchIntoTarget(
    sourceBranch: string,
    targetBranch: string
  ): Promise<MergeResult> {
    this.ensureInitialized()

    try {
      console.log(`[GitManager] Merging ${sourceBranch} INTO ${targetBranch}`)

      // Switch to target branch in main repo
      await this.git.checkout(targetBranch)

      // Merge source branch into target
      try {
        const result = await this.git.merge([sourceBranch, '--no-ff', '-m', `Merge ${sourceBranch} into ${targetBranch}`])

        if (result.failed) {
          const status = await this.git.status()
          const conflicts: MergeConflict[] = status.conflicted.map((file) => ({
            file,
            type: 'both_modified' as const
          }))

          return {
            success: false,
            merged: false,
            conflicts,
            error: 'Merge conflicts detected'
          }
        }

        console.log(`[GitManager] Successfully merged ${sourceBranch} into ${targetBranch}`)
        return {
          success: true,
          merged: true,
          commitHash: (result as { hash?: string }).hash || undefined
        }
      } catch (mergeError) {
        const status = await this.git.status()
        if (status.conflicted.length > 0) {
          const conflicts: MergeConflict[] = status.conflicted.map((file) => ({
            file,
            type: 'both_modified' as const
          }))

          return {
            success: false,
            merged: false,
            conflicts,
            error: 'Merge conflicts detected'
          }
        }

        throw mergeError
      }
    } catch (error) {
      console.error(`[GitManager] Failed to merge ${sourceBranch} into ${targetBranch}:`, error)
      return {
        success: false,
        merged: false,
        error: (error as Error).message
      }
    }
  }

  /**
   * Commit a merge in progress after conflicts have been resolved.
   * Used by MergeManager to commit after AI-assisted conflict resolution.
   */
  async commitMerge(
    worktreePath: string,
    message: string
  ): Promise<GitOperationResult> {
    this.ensureInitialized()

    try {
      const git = simpleGit({ baseDir: worktreePath })

      // Stage all changes (including resolved conflicts)
      await git.add('.')

      // Commit the merge
      await git.commit(message)

      console.log(`[GitManager] Committed merge in ${worktreePath}`)
      return { success: true }
    } catch (error) {
      console.error(`[GitManager] Failed to commit merge:`, error)
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Ensure GitManager is initialized before operations.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('GitManager not initialized. Call initialize(projectRoot) first.')
    }
  }

  /**
   * Commit CLAUDE.md if it exists and is untracked or modified.
   * Creates a commit with just that one file to ensure it's available in all branches.
   * Returns success: true if committed, or if CLAUDE.md doesn't exist or is already committed.
   */
  async commitClaudeMd(): Promise<GitOperationResult> {
    this.ensureInitialized()

    try {
      const claudeMdPath = 'CLAUDE.md'
      const fullPath = path.join(this.config.baseDir, claudeMdPath)

      // Check if CLAUDE.md exists
      try {
        await fs.access(fullPath)
      } catch {
        // CLAUDE.md doesn't exist - that's OK, nothing to commit
        console.log('[GitManager] CLAUDE.md does not exist, nothing to commit')
        return { success: true }
      }

      // Check git status for CLAUDE.md specifically
      const status = await this.git.status()

      const isUntracked = status.not_added.includes(claudeMdPath)
      const isModified = status.modified.includes(claudeMdPath)
      const isStaged = status.staged.includes(claudeMdPath)

      if (!isUntracked && !isModified && !isStaged) {
        // CLAUDE.md is already committed and unchanged
        console.log('[GitManager] CLAUDE.md is already committed and unchanged')
        return { success: true }
      }

      // Stage CLAUDE.md
      await this.git.add(claudeMdPath)

      // Create commit with just CLAUDE.md
      const message = isUntracked
        ? 'Add CLAUDE.md project configuration'
        : 'Update CLAUDE.md project configuration'

      await this.git.commit(message, claudeMdPath)

      console.log(`[GitManager] ${message}`)
      return { success: true }
    } catch (error) {
      console.error('[GitManager] Failed to commit CLAUDE.md:', error)
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Commit .gitignore if it exists and is untracked or modified.
   * Creates a commit with just that one file to ensure it's available in all branches.
   * Returns success: true if committed, or if .gitignore doesn't exist or is already committed.
   */
  async commitGitignore(): Promise<GitOperationResult> {
    this.ensureInitialized()

    try {
      const gitignorePath = '.gitignore'
      const fullPath = path.join(this.config.baseDir, gitignorePath)

      // Check if .gitignore exists
      try {
        await fs.access(fullPath)
      } catch {
        // .gitignore doesn't exist - that's OK, nothing to commit
        console.log('[GitManager] .gitignore does not exist, nothing to commit')
        return { success: true }
      }

      // Check git status for .gitignore specifically
      const status = await this.git.status()

      const isUntracked = status.not_added.includes(gitignorePath)
      const isModified = status.modified.includes(gitignorePath)
      const isStaged = status.staged.includes(gitignorePath)

      if (!isUntracked && !isModified && !isStaged) {
        // .gitignore is already committed and unchanged
        console.log('[GitManager] .gitignore is already committed and unchanged')
        return { success: true }
      }

      // Stage .gitignore
      await this.git.add(gitignorePath)

      // Create commit with just .gitignore
      const message = isUntracked
        ? 'Add .gitignore with DAGent directories'
        : 'Update .gitignore with DAGent directories'

      await this.git.commit(message, gitignorePath)

      console.log(`[GitManager] ${message}`)
      return { success: true }
    } catch (error) {
      console.error('[GitManager] Failed to commit .gitignore:', error)
      return { success: false, error: (error as Error).message }
    }
  }
}

// Singleton instance
let gitManagerInstance: GitManager | null = null

export function getGitManager(): GitManager {
  if (!gitManagerInstance) {
    gitManagerInstance = new GitManager()
  }
  return gitManagerInstance
}

export function resetGitManager(): void {
  gitManagerInstance = null
}
