/**
 * VerificationRunner - Automated build/lint/test verification in worktrees.
 *
 * Enables Ralph Loop to run automated verification checks after each DevAgent
 * iteration. The runner detects available npm scripts, executes them in the
 * worktree, captures output, and returns structured results.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { ChecklistStatus } from './task-plan-types'
import type {
  VerificationCheck,
  VerificationResult,
  VerificationCheckId,
  CommandResult
} from './verification-types'
import {
  DEFAULT_VERIFICATION_CHECKS,
  MAX_OUTPUT_LENGTH,
  DEFAULT_TIMEOUT
} from './verification-types'

const execFileAsync = promisify(execFile)

/**
 * Configuration for running verification checks.
 */
export interface VerificationConfig {
  /** Run build step (default: true) */
  runBuild?: boolean
  /** Run lint step (default: true) */
  runLint?: boolean
  /** Run tests step (default: false) */
  runTests?: boolean
  /** Override build command */
  buildCommand?: string
  /** Override lint command */
  lintCommand?: string
  /** Override test command */
  testCommand?: string
}

/**
 * Runner for executing verification checks in a worktree.
 */
export class VerificationRunner {
  constructor(private worktreePath: string) {}

  /**
   * Detect which npm scripts are available in the worktree.
   * Reads package.json and returns available script names.
   */
  async detectAvailableScripts(): Promise<Set<string>> {
    try {
      const packageJsonPath = path.join(this.worktreePath, 'package.json')
      const content = await fs.readFile(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(content)

      if (packageJson.scripts && typeof packageJson.scripts === 'object') {
        return new Set(Object.keys(packageJson.scripts))
      }

      return new Set()
    } catch {
      // package.json doesn't exist or is invalid
      return new Set()
    }
  }

  /**
   * Check if a specific verification command is available.
   * For npm commands, checks if script exists in package.json.
   */
  async isCheckAvailable(check: VerificationCheck): Promise<boolean> {
    const command = check.command.trim()

    // Extract script name for npm commands
    if (command.startsWith('npm run ')) {
      const scriptName = command.slice('npm run '.length).trim()
      const availableScripts = await this.detectAvailableScripts()
      return availableScripts.has(scriptName)
    }

    if (command === 'npm test') {
      const availableScripts = await this.detectAvailableScripts()
      return availableScripts.has('test')
    }

    // For non-npm commands, assume available
    return true
  }

  /**
   * Run a single verification check.
   * Executes command in worktree, captures output, returns structured result.
   */
  async runCheck(check: VerificationCheck): Promise<VerificationResult> {
    const { command, args } = this.parseCommand(check.command)
    const result = await this.executeCommand(command, args)

    const verificationResult: VerificationResult = {
      checkId: check.id,
      passed: result.exitCode === 0,
      command: check.command,
      result
    }

    if (!verificationResult.passed) {
      verificationResult.error = this.formatError(check, result)
    }

    return verificationResult
  }

  /**
   * Run all applicable verification checks.
   * Skips unavailable checks (e.g., no lint script).
   * Respects continueOnFail settings.
   */
  async runAllChecks(config?: VerificationConfig): Promise<VerificationResult[]> {
    const results: VerificationResult[] = []
    const checks = this.buildCheckList(config)

    for (const check of checks) {
      // Skip if check is not available
      const isAvailable = await this.isCheckAvailable(check)
      if (!isAvailable) {
        continue
      }

      const result = await this.runCheck(check)
      results.push(result)

      // If check failed and continueOnFail is not set, stop
      if (!result.passed && !check.continueOnFail) {
        break
      }
    }

    return results
  }

  /**
   * Convert verification result to ChecklistStatus for TaskPlan.
   */
  resultToStatus(result: VerificationResult): ChecklistStatus {
    return result.passed ? 'pass' : 'fail'
  }

  /**
   * Format verification results into human-readable summary.
   */
  formatResultsSummary(results: VerificationResult[]): string {
    if (results.length === 0) {
      return 'No verification checks were run.'
    }

    const lines: string[] = ['Verification Results:', '']

    for (const result of results) {
      const status = result.passed ? 'PASS' : 'FAIL'
      const duration = `${result.result.duration}ms`
      lines.push(`  ${result.checkId}: ${status} (${duration})`)

      if (!result.passed && result.error) {
        // Indent error message
        const errorLines = result.error.split('\n').slice(0, 5)
        for (const line of errorLines) {
          lines.push(`    ${line}`)
        }
        if (result.error.split('\n').length > 5) {
          lines.push('    ...')
        }
      }
    }

    const passCount = results.filter((r) => r.passed).length
    const failCount = results.length - passCount
    lines.push('')
    lines.push(`Summary: ${passCount} passed, ${failCount} failed`)

    return lines.join('\n')
  }

  /**
   * Run a command in the worktree and capture output.
   */
  private async executeCommand(
    command: string,
    args: string[],
    timeout?: number
  ): Promise<CommandResult> {
    const startTime = Date.now()
    const timeoutMs = timeout ?? DEFAULT_TIMEOUT

    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: this.worktreePath,
        timeout: timeoutMs,
        // Use shell on Windows for npm commands
        shell: process.platform === 'win32',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      })

      return {
        exitCode: 0,
        stdout: this.truncateOutput(stdout),
        stderr: this.truncateOutput(stderr),
        duration: Date.now() - startTime
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const execError = error as {
        code?: number | string
        killed?: boolean
        stdout?: string
        stderr?: string
        message?: string
      }

      // Check for timeout
      if (execError.killed || execError.code === 'ETIMEDOUT') {
        return {
          exitCode: 1,
          stdout: this.truncateOutput(execError.stdout || ''),
          stderr: this.truncateOutput(execError.stderr || 'Command timed out'),
          duration,
          timedOut: true
        }
      }

      // Normal command failure with exit code
      const exitCode = typeof execError.code === 'number' ? execError.code : 1

      return {
        exitCode,
        stdout: this.truncateOutput(execError.stdout || ''),
        stderr: this.truncateOutput(execError.stderr || execError.message || 'Command failed'),
        duration
      }
    }
  }

  /**
   * Parse a command string into executable and arguments.
   */
  private parseCommand(commandStr: string): { command: string; args: string[] } {
    const parts = commandStr.trim().split(/\s+/)
    const command = parts[0]
    const args = parts.slice(1)
    return { command, args }
  }

  /**
   * Truncate output to MAX_OUTPUT_LENGTH.
   */
  private truncateOutput(output: string): string {
    if (output.length <= MAX_OUTPUT_LENGTH) {
      return output
    }
    return output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (truncated)'
  }

  /**
   * Format error message from command result.
   */
  private formatError(check: VerificationCheck, result: CommandResult): string {
    const parts: string[] = []

    if (result.timedOut) {
      parts.push(`${check.description} timed out after ${result.duration}ms`)
    } else {
      parts.push(`${check.description} failed (exit code ${result.exitCode})`)
    }

    // Include stderr if available
    if (result.stderr.trim()) {
      parts.push(result.stderr.trim())
    } else if (result.stdout.trim()) {
      // Fall back to stdout if no stderr
      parts.push(result.stdout.trim())
    }

    return parts.join('\n')
  }

  /**
   * Build the list of checks based on config.
   */
  private buildCheckList(config?: VerificationConfig): VerificationCheck[] {
    const checks: VerificationCheck[] = []

    // Build check
    if (config?.runBuild !== false) {
      const buildCheck = DEFAULT_VERIFICATION_CHECKS.find((c) => c.id === 'build')!
      checks.push({
        ...buildCheck,
        command: config?.buildCommand || buildCheck.command
      })
    }

    // Lint check
    if (config?.runLint !== false) {
      const lintCheck = DEFAULT_VERIFICATION_CHECKS.find((c) => c.id === 'lint')!
      checks.push({
        ...lintCheck,
        command: config?.lintCommand || lintCheck.command
      })
    }

    // Test check
    if (config?.runTests === true) {
      const testCheck = DEFAULT_VERIFICATION_CHECKS.find((c) => c.id === 'test')!
      checks.push({
        ...testCheck,
        command: config?.testCommand || testCheck.command
      })
    }

    return checks
  }
}

// =============================================================================
// Singleton Pattern
// =============================================================================

/** Cache of VerificationRunner instances by worktree path */
const runners = new Map<string, VerificationRunner>()

/**
 * Get or create a VerificationRunner for the given worktree path.
 */
export function getVerificationRunner(worktreePath: string): VerificationRunner {
  let runner = runners.get(worktreePath)
  if (!runner) {
    runner = new VerificationRunner(worktreePath)
    runners.set(worktreePath, runner)
  }
  return runner
}

/**
 * Clear cached runners (for testing).
 */
export function clearVerificationRunners(): void {
  runners.clear()
}
