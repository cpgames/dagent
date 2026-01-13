import type { JSX } from 'react';
import { useState } from 'react';
import { useAuthStore } from '../../stores/auth-store';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthDialog({ isOpen, onClose }: AuthDialogProps): JSX.Element | null {
  const { setCredentials, state, isLoading } = useAuthStore();
  const [credType, setCredType] = useState<'api_key' | 'oauth'>('api_key');
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

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
      onClose();
    }
  };

  const handleClose = (): void => {
    setValue('');
    setLocalError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Configure Authentication
        </h2>

        <form onSubmit={handleSubmit}>
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
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancel
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
      </div>
    </div>
  );
}
