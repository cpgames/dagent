export type AuthType =
  | 'claude_cli'
  | 'oauth_env'
  | 'oauth_stored'
  | 'api_key_stored'
  | 'api_key_env'
  | 'manual';

export interface AuthCredentials {
  type: AuthType;
  value: string; // token or API key
  source: string; // human-readable source description
}

export interface StoredCredentials {
  type: 'oauth' | 'api_key';
  token?: string;
  key?: string;
  storedAt: string;
}

export interface AuthState {
  authenticated: boolean;
  credentials: AuthCredentials | null;
  error: string | null;
}
