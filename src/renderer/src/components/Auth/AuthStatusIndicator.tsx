import type { JSX } from 'react';
import { useAuthStore } from '../../stores/auth-store';

interface AuthStatusIndicatorProps {
  onConfigureClick: () => void;
}

export function AuthStatusIndicator({ onConfigureClick }: AuthStatusIndicatorProps): JSX.Element {
  const { state, sdkStatus, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400">
        <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
        <span>Checking auth...</span>
      </div>
    );
  }

  // SDK available - show special status
  if (sdkStatus?.available) {
    return (
      <button
        onClick={onConfigureClick}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-green-400 hover:text-green-300 hover:bg-gray-800 rounded transition-colors"
        title="Using Claude Agent SDK - automatic authentication"
      >
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span>SDK Active</span>
      </button>
    );
  }

  // Manual auth state (existing logic)
  if (state.authenticated) {
    return (
      <button
        onClick={onConfigureClick}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-green-400 hover:text-green-300 hover:bg-gray-800 rounded transition-colors"
        title={state.credentials?.source || 'Click to view or change authentication'}
      >
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span>Authenticated</span>
      </button>
    );
  }

  // Not authenticated
  return (
    <button
      onClick={onConfigureClick}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-yellow-400 hover:text-yellow-300 hover:bg-gray-800 rounded transition-colors"
      title="Click to configure authentication"
    >
      <div className="w-2 h-2 rounded-full bg-yellow-500" />
      <span>Not Authenticated</span>
    </button>
  );
}
