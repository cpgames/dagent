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
  TaskWorktreeResult
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
