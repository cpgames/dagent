import { homedir } from 'os';
import { join } from 'path';

/**
 * Get Claude Code config directory path (cross-platform).
 * - Windows: %APPDATA%\Claude or %LOCALAPPDATA%\Claude
 * - Unix/macOS: ~/.config/claude
 */
export function getClaudeCliConfigPath(): string {
  const home = homedir();
  if (process.platform === 'win32') {
    // Windows: prefer APPDATA (Roaming), fallback to LOCALAPPDATA
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(appData, 'Claude');
  }
  // Unix/macOS
  return join(home, '.config', 'claude');
}

/**
 * Get possible Claude Code credential file paths.
 * Claude Code may store credentials in different locations depending on version.
 */
export function getClaudeCredentialPaths(): string[] {
  const configDir = getClaudeCliConfigPath();
  const home = homedir();

  return [
    join(configDir, 'credentials.json'),
    join(configDir, 'settings.json'),
    join(home, '.claude.json'),
    join(home, '.claude', 'credentials.json')
  ];
}

/**
 * Get DAGent credentials storage path.
 */
export function getDagentCredentialsPath(): string {
  return join(homedir(), '.dagent', 'credentials.json');
}
