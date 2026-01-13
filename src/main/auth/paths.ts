import { homedir } from 'os';
import { join } from 'path';

// Cross-platform Claude CLI config location
export function getClaudeCliConfigPath(): string {
  const home = homedir();
  if (process.platform === 'win32') {
    return join(home, '.config', 'claude');
  }
  return join(home, '.config', 'claude');
}

export function getDagentCredentialsPath(): string {
  return join(homedir(), '.dagent', 'credentials.json');
}
