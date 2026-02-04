/**
 * SDK Detector - Detects Claude Agent SDK availability.
 * Checks if Claude Code is installed and has valid credentials.
 */
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

export interface SDKStatus {
  available: boolean
  claudeCodeInstalled: boolean
  claudeCliFound: boolean
  claudeCliPath: string | null
  hasCredentials: boolean
  message: string
}

/**
 * Check if claude CLI executable is available.
 */
function findClaudeCli(): { found: boolean; path: string | null } {
  const home = homedir()

  // Common locations for claude CLI
  const possiblePaths = [
    join(home, '.local', 'bin', 'claude.exe'),
    join(home, '.local', 'bin', 'claude'),
    join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
    join(home, 'AppData', 'Roaming', 'npm', 'claude'),
  ]

  // Check explicit paths first
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return { found: true, path: p }
    }
  }

  // Try running 'where claude' or 'which claude' to find it in PATH
  try {
    const cmd = process.platform === 'win32' ? 'where claude' : 'which claude'
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim()
    if (result) {
      return { found: true, path: result.split('\n')[0] }
    }
  } catch {
    // Command failed - claude not in PATH
  }

  return { found: false, path: null }
}

/**
 * Detect if Claude Agent SDK is available for authentication.
 * Checks:
 * 1. Claude CLI executable (required for SDK)
 * 2. Claude Code installation (via ~/.claude directory)
 * 3. Credentials file existence (via ~/.claude/.credentials.json)
 */
export function detectSDKAvailability(): SDKStatus {
  // Check for claude CLI executable
  const cliCheck = findClaudeCli()

  // Check if Claude Code is installed
  const claudeDir = join(homedir(), '.claude')
  const claudeCodeInstalled = existsSync(claudeDir)

  // Check for credentials file
  const credentialsPath = join(claudeDir, '.credentials.json')
  const hasCredentials = existsSync(credentialsPath)

  if (!cliCheck.found) {
    return {
      available: false,
      claudeCodeInstalled,
      claudeCliFound: false,
      claudeCliPath: null,
      hasCredentials,
      message: 'Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code'
    }
  }

  if (!claudeCodeInstalled) {
    return {
      available: false,
      claudeCodeInstalled: false,
      claudeCliFound: true,
      claudeCliPath: cliCheck.path,
      hasCredentials: false,
      message: 'Claude CLI found but not configured. Run "claude" to set up.'
    }
  }

  if (!hasCredentials) {
    return {
      available: false,
      claudeCodeInstalled: true,
      claudeCliFound: true,
      claudeCliPath: cliCheck.path,
      hasCredentials: false,
      message: 'Claude CLI installed but not logged in. Run "claude" to authenticate.'
    }
  }

  return {
    available: true,
    claudeCodeInstalled: true,
    claudeCliFound: true,
    claudeCliPath: cliCheck.path,
    hasCredentials: true,
    message: 'Claude Agent SDK ready'
  }
}
