import type { JSX } from 'react';
import { useAuthStore } from '../../stores/auth-store';
import './AuthStatusIndicator.css';

interface AuthStatusIndicatorProps {
  onConfigureClick: () => void;
}

export function AuthStatusIndicator({ onConfigureClick }: AuthStatusIndicatorProps): JSX.Element {
  const { state, sdkStatus, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="auth-status auth-status--loading">
        <div className="auth-status__dot auth-status__dot--loading" />
        <span className="auth-status__text">Checking auth...</span>
      </div>
    );
  }

  // SDK available - show special status
  if (sdkStatus?.available) {
    return (
      <button
        onClick={onConfigureClick}
        className="auth-status auth-status--authenticated"
        title="Using Claude Agent SDK - automatic authentication"
      >
        <div className="auth-status__dot auth-status__dot--success" />
        <span className="auth-status__text">SDK Active</span>
      </button>
    );
  }

  // Manual auth state (existing logic)
  if (state.authenticated) {
    return (
      <button
        onClick={onConfigureClick}
        className="auth-status auth-status--authenticated"
        title={state.credentials?.source || 'Click to view or change authentication'}
      >
        <div className="auth-status__dot auth-status__dot--success" />
        <span className="auth-status__text">Authenticated</span>
      </button>
    );
  }

  // Not authenticated
  return (
    <button
      onClick={onConfigureClick}
      className="auth-status auth-status--unauthenticated"
      title="Click to configure authentication"
    >
      <div className="auth-status__dot auth-status__dot--warning" />
      <span className="auth-status__text">Not Authenticated</span>
    </button>
  );
}
