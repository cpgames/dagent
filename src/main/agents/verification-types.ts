/**
 * Verification types for DAGent automated build/lint/test verification.
 * Used by VerificationRunner to execute and report on verification checks
 * during Ralph Loop iterations.
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Identifier for verification check types.
 */
export type VerificationCheckId = 'build' | 'lint' | 'test'

/**
 * Result of executing a shell command.
 */
export interface CommandResult {
  /** Process exit code (0 = success) */
  exitCode: number
  /** Captured stdout (truncated to MAX_OUTPUT_LENGTH) */
  stdout: string
  /** Captured stderr (truncated to MAX_OUTPUT_LENGTH) */
  stderr: string
  /** Execution time in milliseconds */
  duration: number
  /** True if command exceeded timeout */
  timedOut?: boolean
}

/**
 * Definition of a verification check to execute.
 */
export interface VerificationCheck {
  /** Check identifier */
  id: VerificationCheckId
  /** Human-readable description */
  description: string
  /** Command to execute (e.g., "npm run build") */
  command: string
  /** If true, failure blocks subsequent checks */
  required: boolean
  /** If true, run next check even if this one fails */
  continueOnFail?: boolean
}

/**
 * Result of running a verification check.
 */
export interface VerificationResult {
  /** Check identifier */
  checkId: VerificationCheckId
  /** True if exitCode === 0 */
  passed: boolean
  /** Actual command that was run */
  command: string
  /** Full command result */
  result: CommandResult
  /** Formatted error message if failed */
  error?: string
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default verification checks to run.
 * Build is required; lint continues on fail; test is optional.
 */
export const DEFAULT_VERIFICATION_CHECKS: VerificationCheck[] = [
  {
    id: 'build',
    description: 'Build passes without errors',
    command: 'npm run build',
    required: true
  },
  {
    id: 'lint',
    description: 'Lint passes',
    command: 'npm run lint',
    required: false,
    continueOnFail: true
  },
  {
    id: 'test',
    description: 'Tests pass',
    command: 'npm test',
    required: false
  }
]

/**
 * Maximum length for stdout/stderr output before truncation.
 */
export const MAX_OUTPUT_LENGTH = 2000

/**
 * Default timeout for command execution (5 minutes).
 */
export const DEFAULT_TIMEOUT = 300000
