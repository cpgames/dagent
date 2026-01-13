import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { AuthCredentials, AuthState, StoredCredentials } from './types';
import { getClaudeCliConfigPath, getDagentCredentialsPath } from './paths';

export class AuthManager {
  private state: AuthState = {
    authenticated: false,
    credentials: null,
    error: null
  };

  async initialize(): Promise<AuthState> {
    // Check priority chain in order
    const methods = [
      this.checkClaudeCli.bind(this),
      this.checkOAuthEnv.bind(this),
      this.checkOAuthStored.bind(this),
      this.checkApiKeyStored.bind(this),
      this.checkApiKeyEnv.bind(this)
    ];

    for (const method of methods) {
      const credentials = await method();
      if (credentials) {
        this.state = {
          authenticated: true,
          credentials,
          error: null
        };
        return this.state;
      }
    }

    // No credentials found - needs manual entry
    this.state = {
      authenticated: false,
      credentials: null,
      error: 'No credentials found. Please configure authentication.'
    };
    return this.state;
  }

  // Priority 1: Claude CLI auto-detect
  private async checkClaudeCli(): Promise<AuthCredentials | null> {
    // Claude CLI stores credentials in ~/.config/claude/
    // Look for session files or config
    const configPath = getClaudeCliConfigPath();
    // Implementation: check for session.json or similar
    // For now return null - Claude CLI detection is complex
    void configPath; // Acknowledge the variable is intentionally unused for now
    return null;
  }

  // Priority 2: OAuth env var
  private async checkOAuthEnv(): Promise<AuthCredentials | null> {
    const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (token) {
      return {
        type: 'oauth_env',
        value: token,
        source: 'Environment variable CLAUDE_CODE_OAUTH_TOKEN'
      };
    }
    return null;
  }

  // Priority 3: OAuth stored
  private async checkOAuthStored(): Promise<AuthCredentials | null> {
    const stored = this.loadStoredCredentials();
    if (stored?.type === 'oauth' && stored.token) {
      return {
        type: 'oauth_stored',
        value: stored.token,
        source: 'Stored OAuth token (~/.dagent/credentials.json)'
      };
    }
    return null;
  }

  // Priority 4: API key stored
  private async checkApiKeyStored(): Promise<AuthCredentials | null> {
    const stored = this.loadStoredCredentials();
    if (stored?.type === 'api_key' && stored.key) {
      return {
        type: 'api_key_stored',
        value: stored.key,
        source: 'Stored API key (~/.dagent/credentials.json)'
      };
    }
    return null;
  }

  // Priority 5: API key env
  private async checkApiKeyEnv(): Promise<AuthCredentials | null> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) {
      return {
        type: 'api_key_env',
        value: key,
        source: 'Environment variable ANTHROPIC_API_KEY'
      };
    }
    return null;
  }

  private loadStoredCredentials(): StoredCredentials | null {
    const path = getDagentCredentialsPath();
    if (!existsSync(path)) return null;
    try {
      const content = readFileSync(path, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  // Manual credential entry
  setManualCredentials(type: 'oauth' | 'api_key', value: string): void {
    this.state = {
      authenticated: true,
      credentials: {
        type: 'manual',
        value,
        source: type === 'oauth' ? 'Manual OAuth token' : 'Manual API key'
      },
      error: null
    };

    // Store for future use
    this.storeCredentials(type, value);
  }

  private storeCredentials(type: 'oauth' | 'api_key', value: string): void {
    const path = getDagentCredentialsPath();
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const stored: StoredCredentials = {
      type,
      ...(type === 'oauth' ? { token: value } : { key: value }),
      storedAt: new Date().toISOString()
    };

    writeFileSync(path, JSON.stringify(stored, null, 2));
  }

  getState(): AuthState {
    return { ...this.state };
  }

  getApiKey(): string | null {
    return this.state.credentials?.value || null;
  }

  isAuthenticated(): boolean {
    return this.state.authenticated;
  }

  clearCredentials(): void {
    this.state = {
      authenticated: false,
      credentials: null,
      error: null
    };
  }
}

// Singleton
let authManagerInstance: AuthManager | null = null;

export function getAuthManager(): AuthManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager();
  }
  return authManagerInstance;
}
