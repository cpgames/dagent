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
        worktreesDir: path.join(path.dirname(projectRoot), '.dagent-worktrees')
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
        await this.git.branch([branchName])
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
   * Get repository status.
   */
  async getStatus(): Promise<GitOperationResult> {
    this.ensureInitialized()
    try {
      const status = await this.git.status()
      return { success: true, data: status }
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
    try {
      const branchName = getFeatureBranchName(featureId)
      const worktreeName = getFeatureWorktreeName(featureId)
      const worktreePath = path.join(this.config.worktreesDir, worktreeName)

      // Check if worktree already exists
      const worktrees = await this.listWorktrees()
      if (worktrees.some((w) => w.path === worktreePath)) {
        return {
          success: false,
          error: `Worktree already exists at ${worktreePath}`
        }
      }

      // Create branch if it doesn't exist
      const branchExistsResult = await this.branchExists(branchName)
      if (!branchExistsResult) {
        await this.git.branch([branchName])
      }

      // Create worktree
      await this.git.raw(['worktree', 'add', worktreePath, branchName])

      // Create .dagent directory in worktree
      const dagentPath = path.join(worktreePath, '.dagent')
      await fs.mkdir(dagentPath, { recursive: true })
      await fs.mkdir(path.join(dagentPath, 'nodes'), { recursive: true })
      await fs.mkdir(path.join(dagentPath, 'dag_history'), { recursive: true })

      return {
        success: true,
        worktreePath,
        branchName,
        dagentPath
      }
    } catch (error) {
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

      // Check if worktree already exists
      const worktrees = await this.listWorktrees()
      if (worktrees.some((w) => w.path === worktreePath)) {
        return {
          success: false,
          error: `Worktree already exists at ${worktreePath}`
        }
      }

      // Verify feature branch exists
      const featureBranchExists = await this.branchExists(featureBranchName)
      if (!featureBranchExists) {
        return {
          success: false,
          error: `Feature branch ${featureBranchName} does not exist`
        }
      }

      // Create task branch from feature branch and worktree
      await this.git.raw([
        'worktree',
        'add',
        '-b',
        taskBranchName,
        worktreePath,
        featureBranchName
      ])

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
      const worktree = worktrees.find((w) => w.path === worktreePath)

      if (!worktree) {
        return { success: false, error: `Worktree not found at ${worktreePath}` }
      }

      // Remove worktree
      await this.git.raw(['worktree', 'remove', worktreePath, '--force'])

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
    return worktrees.find((w) => w.path === worktreePath) || null
  }

  /**
   * Check if a worktree exists.
   */
  async worktreeExists(worktreePath: string): Promise<boolean> {
    const worktree = await this.getWorktree(worktreePath)
    return worktree !== null
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
   */
  async mergeTaskIntoFeature(
    featureId: string,
    taskId: string,
    removeWorktreeOnSuccess: boolean = true
  ): Promise<TaskMergeResult> {
    this.ensureInitialized()
    try {
      const taskBranchName = getTaskBranchName(featureId, taskId)
      const featureWorktreeName = getFeatureWorktreeName(featureId)
      const taskWorktreeName = getTaskWorktreeName(featureId, taskId)
      const featureWorktreePath = path.join(this.config.worktreesDir, featureWorktreeName)
      const taskWorktreePath = path.join(this.config.worktreesDir, taskWorktreeName)

      // Verify both worktrees exist
      const featureWorktree = await this.getWorktree(featureWorktreePath)
      const taskWorktree = await this.getWorktree(taskWorktreePath)

      if (!featureWorktree) {
        return {
          success: false,
          merged: false,
          worktreeRemoved: false,
          branchDeleted: false,
          error: `Feature worktree not found at ${featureWorktreePath}`
        }
      }

      if (!taskWorktree) {
        return {
          success: false,
          merged: false,
          worktreeRemoved: false,
          branchDeleted: false,
          error: `Task worktree not found at ${taskWorktreePath}`
        }
      }

      // Create a git instance for the feature worktree
      const featureGit = simpleGit({ baseDir: featureWorktreePath })

      // Perform merge in the feature worktree
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
          // Get conflicts from feature worktree
          const status = await featureGit.status()
          const conflicts: MergeConflict[] = status.conflicted.map((file) => ({
            file,
            type: 'both_modified' as const
          }))

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
        const removeResult = await this.removeWorktree(taskWorktreePath, true)
        worktreeRemoved = removeResult.success
        branchDeleted = removeResult.success
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
   * Ensure GitManager is initialized before operations.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('GitManager not initialized. Call initialize(projectRoot) first.')
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
