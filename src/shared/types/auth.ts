export type AuthType =
  | 'claude_cli'
  | 'oauth_env'
  | 'oauth_stored'
  | 'api_key_stored'
  | 'api_key_env'
  | 'manual';

export interface AuthCredentials {
  type: AuthType;
  value: string;
  source: string;
}

export interface AuthState {
  authenticated: boolean;
  credentials: AuthCredentials | null;
  error: string | null;
}
