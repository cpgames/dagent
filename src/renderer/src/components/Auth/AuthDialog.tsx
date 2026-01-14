import type { JSX } from 'react';
import { useState } from 'react';
import { useAuthStore } from '../../stores/auth-store';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthDialog({ isOpen, onClose }: AuthDialogProps): JSX.Element | null {
  const { setCredentials, refreshAuth, checkSDK, state, sdkStatus, isLoading } = useAuthStore();
  const [credType, setCredType] = useState<'api_key' | 'oauth'>('api_key');
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [showChangeForm, setShowChangeForm] = useState(false);

  if (!isOpen) return null;

  const isAuthenticated = state.authenticated;
  const showForm = !isAuthenticated || showChangeForm;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setLocalError(null);

    if (!value.trim()) {
      setLocalError('Please enter a value');
      return;
    }

    if (credType === 'api_key' && !value.startsWith('sk-')) {
      setLocalError('API key should start with "sk-"');
      return;
    }

    await setCredentials(credType, value.trim());

    // Check if auth succeeded
    const { state: newState } = useAuthStore.getState();
    if (newState.authenticated) {
      setValue('');
      setShowChangeForm(false);
      onClose();
    }
  };

  const handleClose = (): void => {
    setValue('');
    setLocalError(null);
    setShowChangeForm(false);
    onClose();
  };

  const handleRefresh = async (): Promise<void> => {
    await checkSDK();
    await refreshAuth();
  };

  // Mask credential value for display (show first and last few chars)
  const maskCredential = (cred: string | undefined): string => {
    if (!cred) return '(automatic)';
    if (cred.length <= 12) return '(automatic)';
    return `${cred.substring(0, 8)}....${cred.substring(cred.length - 4)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Authentication</h2>

        {/* SDK Status Section - Always show */}
        <div className="mb-4 p-3 bg-gray-700/50 rounded-lg border border-gray-600">
          <div className="text-sm font-medium text-gray-300 mb-2">Claude Agent SDK</div>
          <div
            className={`text-sm ${sdkStatus?.available ? 'text-green-400' : 'text-yellow-400'}`}
          >
            {sdkStatus?.message || 'Checking SDK status...'}
          </div>
          {sdkStatus?.available && (
            <div className="text-xs text-gray-500 mt-1">
              Authentication handled automatically by Claude Code
            </div>
          )}
        </div>

        {/* SDK Available - Simplified View */}
        {sdkStatus?.available && !showChangeForm && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-700/50 rounded-lg border border-green-600/30">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-400">SDK Active</span>
              </div>
              <p className="text-sm text-gray-400">
                Using Claude Agent SDK for authentication. No manual configuration needed.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={() => setShowChangeForm(true)}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Use Manual Auth
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Manual Auth - Current credentials display */}
        {!sdkStatus?.available && isAuthenticated && !showChangeForm && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-400">Authenticated</span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Source:</span>
                  <span className="text-gray-200">{state.credentials?.source || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Credential:</span>
                  <span className="text-gray-200 font-mono text-xs">
                    {maskCredential(state.credentials?.value)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                title="Re-detect credentials from Claude Code"
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={() => setShowChangeForm(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Change
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Credential entry form - Manual auth fallback */}
        {showForm && (!sdkStatus?.available || showChangeForm) && (
          <form onSubmit={handleSubmit}>
            {/* Manual auth fallback header */}
            {sdkStatus?.available && showChangeForm && (
              <div className="mb-4 text-sm text-gray-400">
                Override SDK with manual credentials:
              </div>
            )}
            {!sdkStatus?.available && (
              <div className="mb-4 text-sm text-gray-400">Manual authentication (fallback):</div>
            )}

            {/* Credential type selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Credential Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="radio"
                    name="credType"
                    value="api_key"
                    checked={credType === 'api_key'}
                    onChange={() => setCredType('api_key')}
                    className="text-blue-500 focus:ring-blue-500"
                  />
                  API Key
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="radio"
                    name="credType"
                    value="oauth"
                    checked={credType === 'oauth'}
                    onChange={() => setCredType('oauth')}
                    className="text-blue-500 focus:ring-blue-500"
                  />
                  OAuth Token
                </label>
              </div>
            </div>

            {/* Value input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {credType === 'api_key' ? 'API Key' : 'OAuth Token'}
              </label>
              <input
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={credType === 'api_key' ? 'sk-ant-...' : 'Enter OAuth token'}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>

            {/* Error display */}
            {(localError || state.error) && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md text-sm text-red-400">
                {localError || state.error}
              </div>
            )}

            {/* Help text */}
            <p className="mb-4 text-xs text-gray-500">
              Get your API key from{' '}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                console.anthropic.com
              </a>
            </p>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={showChangeForm ? () => setShowChangeForm(false) : handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                {showChangeForm ? 'Back' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
