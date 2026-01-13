import type { JSX } from 'react'
import { useState } from 'react'

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
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Dialog */}
      <div className="relative bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        {/* Header with warning icon */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 bg-yellow-600/20 rounded-full flex items-center justify-center">
            <WarningIcon className="w-6 h-6 text-yellow-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">No Git Repository</h2>
            <p className="text-sm text-gray-400 mt-1">
              The folder <span className="font-medium text-white">{projectName}</span> is not a git
              repository.
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-300 mb-6">
          DAGent requires git for version control and worktree-based task isolation. Please
          initialize a git repository or select a different project.
        </p>

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {/* Primary action - Initialize Git */}
          <button
            onClick={handleInitGit}
            disabled={isLoading}
            className="w-full px-4 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isInitializing ? (
              <>
                <Spinner className="w-4 h-4" />
                Initializing...
              </>
            ) : (
              'Initialize Git'
            )}
          </button>

          {/* Secondary actions row */}
          <div className="flex gap-3">
            <button
              onClick={onOpenAnother}
              disabled={isLoading}
              className="flex-1 px-4 py-2 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Open Another Project
            </button>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              title="Re-scan for git repository"
            >
              {isRefreshing ? (
                <Spinner className="w-4 h-4" />
              ) : (
                <RefreshIcon className="w-4 h-4" />
              )}
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
