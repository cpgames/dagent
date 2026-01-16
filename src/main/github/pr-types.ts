/**
 * Types for GitHub PR operations via gh CLI.
 */

/**
 * Base result type for PR operations.
 */
export interface PROperationResult {
  success: boolean
  error?: string
}

/**
 * Request parameters for creating a pull request.
 */
export interface CreatePRRequest {
  /** PR title */
  title: string
  /** PR body/description */
  body: string
  /** Source branch (feature branch) */
  head: string
  /** Target branch (usually 'main') */
  base: string
  /** Create as draft PR */
  draft?: boolean
}

/**
 * Result of creating a pull request.
 */
export interface CreatePRResult extends PROperationResult {
  /** PR number (e.g., 123) */
  prNumber?: number
  /** API URL for the PR */
  prUrl?: string
  /** Web URL for the PR (for display) */
  htmlUrl?: string
}

/**
 * Status of the gh CLI installation and authentication.
 */
export interface GhCliStatus {
  /** Whether gh CLI is installed and in PATH */
  installed: boolean
  /** Whether gh CLI is authenticated with GitHub */
  authenticated: boolean
  /** Error message if status check failed */
  error?: string
}
