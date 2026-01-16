import type { JSX } from 'react';
import { useState } from 'react';
import { useAuthStore } from '../../stores/auth-store';
import { Dialog, DialogHeader, DialogBody, DialogFooter, Button, Input, RadioGroup, Radio } from '../UI';
import './AuthDialog.css';

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
    <Dialog open={isOpen} onClose={handleClose} size="md">
      <DialogHeader title="Authentication" />

      <DialogBody>
        <div className="auth-dialog__content">
          {/* SDK Status Section - Always show */}
          <div className="auth-dialog__sdk-status">
            <div className="auth-dialog__sdk-status-title">Claude Agent SDK</div>
            <div
              className={`auth-dialog__sdk-status-value ${
                sdkStatus?.available
                  ? 'auth-dialog__sdk-status-value--available'
                  : 'auth-dialog__sdk-status-value--unavailable'
              }`}
            >
              {sdkStatus?.message || 'Checking SDK status...'}
            </div>
            {sdkStatus?.available && (
              <div className="auth-dialog__sdk-status-note">
                Authentication handled automatically by Claude Code
              </div>
            )}
          </div>

          {/* SDK Available - Simplified View */}
          {sdkStatus?.available && !showChangeForm && (
            <>
              <div className="auth-dialog__sdk-active">
                <div className="auth-dialog__sdk-active-header">
                  <div className="auth-dialog__status-dot auth-dialog__status-dot--success" />
                  <span className="auth-dialog__sdk-active-label">SDK Active</span>
                </div>
                <p className="auth-dialog__sdk-active-description">
                  Using Claude Agent SDK for authentication. No manual configuration needed.
                </p>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleRefresh}
                  disabled={isLoading}
                >
                  {isLoading ? 'Refreshing...' : 'Refresh'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowChangeForm(true)}
                >
                  Use Manual Auth
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleClose}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Manual Auth - Current credentials display */}
          {!sdkStatus?.available && isAuthenticated && !showChangeForm && (
            <>
              <div className="auth-dialog__authenticated">
                <div className="auth-dialog__authenticated-header">
                  <div className="auth-dialog__status-dot auth-dialog__status-dot--success" />
                  <span className="auth-dialog__authenticated-label">Authenticated</span>
                </div>

                <div className="auth-dialog__credential-details">
                  <div className="auth-dialog__credential-row">
                    <span className="auth-dialog__credential-label">Source:</span>
                    <span className="auth-dialog__credential-value">
                      {state.credentials?.source || 'Unknown'}
                    </span>
                  </div>
                  <div className="auth-dialog__credential-row">
                    <span className="auth-dialog__credential-label">Credential:</span>
                    <span className="auth-dialog__credential-value auth-dialog__credential-value--mono">
                      {maskCredential(state.credentials?.value)}
                    </span>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleRefresh}
                  disabled={isLoading}
                  title="Re-detect credentials from Claude Code"
                >
                  {isLoading ? 'Refreshing...' : 'Refresh'}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setShowChangeForm(true)}
                >
                  Change
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Credential entry form - Manual auth fallback */}
          {showForm && (!sdkStatus?.available || showChangeForm) && (
            <form onSubmit={handleSubmit} className="auth-dialog__form">
              {/* Manual auth fallback header */}
              {sdkStatus?.available && showChangeForm && (
                <div className="auth-dialog__form-header">
                  Override SDK with manual credentials:
                </div>
              )}
              {!sdkStatus?.available && (
                <div className="auth-dialog__form-header">Manual authentication (fallback):</div>
              )}

              {/* Credential type selection */}
              <div className="auth-dialog__field">
                <label className="auth-dialog__label">Credential Type</label>
                <RadioGroup
                  name="credType"
                  value={credType}
                  onChange={(val) => setCredType(val as 'api_key' | 'oauth')}
                  orientation="horizontal"
                  className="auth-dialog__radio-group"
                >
                  <Radio value="api_key" label="API Key" />
                  <Radio value="oauth" label="OAuth Token" />
                </RadioGroup>
              </div>

              {/* Value input */}
              <div className="auth-dialog__field">
                <label className="auth-dialog__label">
                  {credType === 'api_key' ? 'API Key' : 'OAuth Token'}
                </label>
                <Input
                  type="password"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={credType === 'api_key' ? 'sk-ant-...' : 'Enter OAuth token'}
                  autoFocus
                />
              </div>

              {/* Error display */}
              {(localError || state.error) && (
                <div className="auth-dialog__error">
                  {localError || state.error}
                </div>
              )}

              {/* Help text */}
              <p className="auth-dialog__help">
                Get your API key from{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="auth-dialog__help-link"
                >
                  console.anthropic.com
                </a>
              </p>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={showChangeForm ? () => setShowChangeForm(false) : handleClose}
                >
                  {showChangeForm ? 'Back' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}
