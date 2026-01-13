/**
 * GitManager - Core git operations using simple-git.
 * Provides singleton access to git functionality for DAGent.
 */

import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git'
import type { GitManagerConfig, BranchInfo, GitOperationResult } from './types'
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
