/**
 * SDK Detector - Detects Claude Agent SDK availability.
 * Checks if Claude Code is installed and has valid credentials.
 */
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface SDKStatus {
  available: boolean
  claudeCodeInstalled: boolean
  hasCredentials: boolean
  message: string
}

/**
 * Detect if Claude Agent SDK is available for authentication.
 * Checks:
 * 1. Claude Code installation (via ~/.claude directory)
 * 2. Credentials file existence (via ~/.claude/.credentials.json)
 */
export function detectSDKAvailability(): SDKStatus {
  // Check if Claude Code is installed
  const claudeDir = join(homedir(), '.claude')
  const claudeCodeInstalled = existsSync(claudeDir)

  // Check for credentials file
  const credentialsPath = join(claudeDir, '.credentials.json')
  const hasCredentials = existsSync(credentialsPath)

  if (!claudeCodeInstalled) {
    return {
      available: false,
      claudeCodeInstalled: false,
      hasCredentials: false,
      message: 'Claude Code not installed. Install Claude Code for automatic authentication.'
    }
  }

  if (!hasCredentials) {
    return {
      available: false,
      claudeCodeInstalled: true,
      hasCredentials: false,
      message: 'Claude Code installed but not logged in. Run "claude" CLI to authenticate.'
    }
  }

  return {
    available: true,
    claudeCodeInstalled: true,
    hasCredentials: true,
    message: 'Claude Agent SDK ready - authentication automatic'
  }
}
