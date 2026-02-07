import { useState, useEffect, useCallback } from 'react'
import type { JSX } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '../UI/Dialog'

interface GitHubSetupDialogProps {
  isOpen: boolean
  onClose: () => void
}

type SetupState = 'checking' | 'not_installed' | 'not_authenticated' | 'ready' | 'authenticating'

/**
 * Dialog for setting up GitHub CLI (gh).
 * Shown on startup if gh CLI is not installed or not authenticated.
 * DAGent requires gh CLI for git operations like creating PRs and publishing repos.
 */
export function GitHubSetupDialog({
  isOpen,
  onClose
}: GitHubSetupDialogProps): JSX.Element {
  const [state, setState] = useState<SetupState>('checking')
  const [error, setError] = useState<string | null>(null)

  const checkGhStatus = useCallback(async (): Promise<void> => {
    setState('checking')
    setError(null)

    try {
      const status = await window.electronAPI.github.checkGhCli()

      if (!status.installed) {
        setState('not_installed')
      } else if (!status.authenticated) {
        setState('not_authenticated')
      } else {
        setState('ready')
        // Auto-close after a brief moment if everything is good
        setTimeout(() => {
          onClose()
        }, 1000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check gh CLI status')
      setState('not_installed')
    }
  }, [onClose])

  // Check status when dialog opens
  useEffect(() => {
    if (isOpen) {
      checkGhStatus()
    }
  }, [isOpen, checkGhStatus])

  const handleStartAuth = async (): Promise<void> => {
    setState('authenticating')
    setError(null)

    try {
      const result = await window.electronAPI.github.authLogin()

      if (!result.success) {
        setError(result.error || 'Failed to start authentication')
        setState('not_authenticated')
      }
      // Don't change state here - user needs to complete auth in browser
      // They'll click "Check Again" when done
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start authentication')
      setState('not_authenticated')
    }
  }

  const handleClose = (): void => {
    // Only allow closing if we're in ready state or user explicitly dismisses
    if (state === 'ready' || state === 'checking') {
      onClose()
    }
  }

  const renderContent = (): JSX.Element => {
    switch (state) {
      case 'checking':
        return (
          <div className="flex items-center gap-3 py-4">
            <svg className="w-5 h-5 animate-spin text-blue-400" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-gray-300">Checking GitHub CLI status...</span>
          </div>
        )

      case 'not_installed':
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-md">
              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-yellow-400 font-medium">GitHub CLI not found</p>
                <p className="text-gray-400 text-sm mt-1">
                  DAGent requires the GitHub CLI (gh) to be installed for git operations like creating pull requests and publishing repositories.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-300 font-medium">To install GitHub CLI:</p>
              <ol className="text-sm text-gray-400 list-decimal list-inside space-y-1">
                <li>
                  Visit{' '}
                  <a
                    href="https://cli.github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    cli.github.com
                  </a>
                </li>
                <li>Download and install for your operating system</li>
                <li>Restart DAGent after installation</li>
              </ol>
            </div>

            {error && (
              <div className="p-3 bg-red-900/30 border border-red-800 rounded-md text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        )

      case 'not_authenticated':
      case 'authenticating':
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-blue-900/20 border border-blue-800/50 rounded-md">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-blue-400 font-medium">GitHub CLI requires authentication</p>
                <p className="text-gray-400 text-sm mt-1">
                  The GitHub CLI is installed but not logged in. DAGent needs GitHub access to create pull requests and publish repositories.
                </p>
              </div>
            </div>

            {state === 'authenticating' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-gray-300">
                  <svg className="w-5 h-5 animate-spin text-blue-400" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Waiting for browser authentication...</span>
                </div>
                <p className="text-sm text-gray-500">
                  Complete the authentication in your browser, then click "Check Again" below.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-300 font-medium">Click the button below to authenticate:</p>
                <p className="text-sm text-gray-500">
                  This will open your browser to log in with GitHub.
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-900/30 border border-red-800 rounded-md text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        )

      case 'ready':
        return (
          <div className="flex items-center gap-3 py-4">
            <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <p className="text-green-400 font-medium">GitHub CLI is ready!</p>
              <p className="text-gray-400 text-sm">You're all set to use DAGent's git features.</p>
            </div>
          </div>
        )
    }
  }

  const renderFooter = (): JSX.Element => {
    switch (state) {
      case 'checking':
        return <></>

      case 'not_installed':
        return (
          <div className="flex gap-2 justify-end">
            <button
              onClick={checkGhStatus}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
            >
              Check Again
            </button>
            <button
              onClick={() => window.open('https://cli.github.com', '_blank')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
            >
              Download GitHub CLI
            </button>
          </div>
        )

      case 'not_authenticated':
        return (
          <div className="flex gap-2 justify-end">
            <button
              onClick={checkGhStatus}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
            >
              Check Again
            </button>
            <button
              onClick={handleStartAuth}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Login with GitHub
            </button>
          </div>
        )

      case 'authenticating':
        return (
          <div className="flex gap-2 justify-end">
            <button
              onClick={checkGhStatus}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
            >
              Check Again
            </button>
          </div>
        )

      case 'ready':
        return (
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
            >
              Continue
            </button>
          </div>
        )
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      size="md"
      closeOnBackdrop={state === 'ready'}
      closeOnEscape={state === 'ready'}
      showCloseButton={false}
    >
      <DialogHeader
        title="GitHub Setup Required"
        description="DAGent requires GitHub CLI to create pull requests and manage repositories."
      />

      <DialogBody>
        {renderContent()}
      </DialogBody>

      <DialogFooter>
        {renderFooter()}
      </DialogFooter>
    </Dialog>
  )
}
