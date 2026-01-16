/**
 * PRService - GitHub CLI wrapper for pull request operations.
 *
 * Uses the `gh` CLI tool to interact with GitHub.
 * Provides PR creation and status checking functionality.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import type { CreatePRRequest, CreatePRResult, GhCliStatus } from './pr-types'

const execFileAsync = promisify(execFile)

/**
 * Service for interacting with GitHub via the gh CLI.
 * Singleton pattern - use getPRService() to access.
 */
export class PRService {
  /**
   * Check if the gh CLI is installed and authenticated.
   * Tests both installation and auth status.
   */
  async checkGhCli(): Promise<GhCliStatus> {
    try {
      // First check if gh is installed by running gh --version
      try {
        await execFileAsync('gh', ['--version'])
      } catch {
        return {
          installed: false,
          authenticated: false,
          error: 'GitHub CLI (gh) is not installed or not in PATH'
        }
      }

      // Check authentication status
      try {
        await execFileAsync('gh', ['auth', 'status'])
        return {
          installed: true,
          authenticated: true
        }
      } catch (error) {
        const errorMsg = (error as Error).message || ''
        // gh auth status returns non-zero if not authenticated
        if (errorMsg.includes('not logged') || errorMsg.includes('You are not logged')) {
          return {
            installed: true,
            authenticated: false,
            error: 'GitHub CLI is not authenticated. Run: gh auth login'
          }
        }
        return {
          installed: true,
          authenticated: false,
          error: `Authentication check failed: ${errorMsg}`
        }
      }
    } catch (error) {
      return {
        installed: false,
        authenticated: false,
        error: (error as Error).message
      }
    }
  }

  /**
   * Create a pull request using gh CLI.
   *
   * @param req - PR creation parameters
   * @returns Result with PR number and URLs on success
   */
  async createPullRequest(req: CreatePRRequest): Promise<CreatePRResult> {
    try {
      // Build gh pr create command
      const args = [
        'pr',
        'create',
        '--title',
        req.title,
        '--body',
        req.body,
        '--head',
        req.head,
        '--base',
        req.base
      ]

      // Add draft flag if requested
      if (req.draft) {
        args.push('--draft')
      }

      // Request JSON output for parsing
      args.push('--json', 'number,url')

      const { stdout } = await execFileAsync('gh', args)

      // Parse JSON output
      // Format: {"number":123,"url":"https://api.github.com/repos/owner/repo/pulls/123"}
      const result = JSON.parse(stdout.trim())

      // Construct HTML URL from API URL
      // API: https://api.github.com/repos/owner/repo/pulls/123
      // HTML: https://github.com/owner/repo/pull/123
      let htmlUrl = result.url
      if (result.url && result.url.includes('api.github.com')) {
        htmlUrl = result.url
          .replace('api.github.com/repos', 'github.com')
          .replace('/pulls/', '/pull/')
      }

      return {
        success: true,
        prNumber: result.number,
        prUrl: result.url,
        htmlUrl
      }
    } catch (error) {
      const errorMsg = (error as Error).message || 'Unknown error'

      // Check for common errors
      if (errorMsg.includes('not logged') || errorMsg.includes('authentication')) {
        return {
          success: false,
          error: 'GitHub CLI is not authenticated. Run: gh auth login'
        }
      }

      if (errorMsg.includes('already exists')) {
        return {
          success: false,
          error: 'A pull request already exists for this branch'
        }
      }

      if (errorMsg.includes('not found') || errorMsg.includes('Could not resolve')) {
        return {
          success: false,
          error: 'Repository not found or not a GitHub repository'
        }
      }

      return {
        success: false,
        error: errorMsg
      }
    }
  }
}

// Singleton instance
let prServiceInstance: PRService | null = null

/**
 * Get the singleton PRService instance.
 */
export function getPRService(): PRService {
  if (!prServiceInstance) {
    prServiceInstance = new PRService()
  }
  return prServiceInstance
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetPRService(): void {
  prServiceInstance = null
}
