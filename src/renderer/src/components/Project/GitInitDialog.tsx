import type { JSX } from 'react'
import { useState } from 'react'
import { Dialog, DialogBody, Button } from '../UI'
import './GitInitDialog.css'

interface GitInitDialogProps {
  isOpen: boolean
  projectPath: string
  onInitGit: () => Promise<void>
  onOpenAnother: () => void
  onRefresh: () => Promise<void>
}

/**
 * Warning icon
 */
function WarningIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  )
}

/**
 * Loading spinner
 */
function Spinner({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

/**
 * Refresh icon
 */
function RefreshIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  )
}

/**
 * Dialog shown when opening a project that is not a git repository.
 * Offers to initialize git, open another project, or refresh to re-scan.
 */
export function GitInitDialog({
  isOpen,
  projectPath,
  onInitGit,
  onOpenAnother,
  onRefresh
}: GitInitDialogProps): JSX.Element | null {
  const [isInitializing, setIsInitializing] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const projectName = projectPath.split(/[/\\]/).pop() || 'Project'
  const isLoading = isInitializing || isRefreshing

  const handleInitGit = async (): Promise<void> => {
    setIsInitializing(true)
    setError(null)
    try {
      await onInitGit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize git repository')
      setIsInitializing(false)
    }
  }

  const handleRefresh = async (): Promise<void> => {
    setIsRefreshing(true)
    setError(null)
    try {
      await onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check for git repository')
    } finally {
      setIsRefreshing(false)
    }
  }

  // Empty onClose since this dialog shouldn't be closeable by clicking backdrop
  const handleClose = (): void => {
    // Dialog cannot be closed directly - user must choose an action
  }

  return (
    <Dialog open={isOpen} onClose={handleClose} size="md" closeOnBackdrop={false} closeOnEscape={false}>
      <DialogBody>
        <div className="git-init-dialog__content">
          {/* Header with warning icon */}
          <div className="git-init-dialog__header">
            <div className="git-init-dialog__warning-icon-container">
              <WarningIcon className="git-init-dialog__warning-icon" />
            </div>
            <div className="git-init-dialog__header-text">
              <h2>No Git Repository</h2>
              <p className="git-init-dialog__header-subtitle">
                The folder <span className="git-init-dialog__project-name">{projectName}</span> is not a git
                repository.
              </p>
            </div>
          </div>

          {/* Description */}
          <p className="git-init-dialog__description">
            DAGent requires git for version control and worktree-based task isolation. Please
            initialize a git repository or select a different project.
          </p>

          {/* Error display */}
          {error && (
            <div className="git-init-dialog__error">
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="git-init-dialog__actions">
            {/* Primary action - Initialize Git */}
            <Button
              onClick={handleInitGit}
              disabled={isLoading}
              variant="primary"
              fullWidth
              leftIcon={isInitializing ? <Spinner className="git-init-dialog__spinner" /> : undefined}
            >
              {isInitializing ? 'Initializing...' : 'Initialize Git'}
            </Button>

            {/* Secondary actions row */}
            <div className="git-init-dialog__secondary-actions">
              <Button
                onClick={onOpenAnother}
                disabled={isLoading}
                variant="ghost"
              >
                Open Another Project
              </Button>
              <Button
                onClick={handleRefresh}
                disabled={isLoading}
                variant="ghost"
                leftIcon={
                  isRefreshing
                    ? <Spinner className="git-init-dialog__spinner" />
                    : <RefreshIcon className="git-init-dialog__refresh-icon" />
                }
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  )
}
