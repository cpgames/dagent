import type { JSX } from 'react'
import { useGitStore } from '../../stores'

/**
 * Git branch icon
 */
function BranchIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7a2 2 0 100-4 2 2 0 000 4zM8 7v10M16 17a2 2 0 100-4 2 2 0 000 4zM16 13V7a2 2 0 10-4 0v2a2 2 0 004 0z"
      />
    </svg>
  )
}

/**
 * GitStatus component displays current git branch in status bar.
 * Click handler reserved for future branch switching (Phase 14).
 */
export function GitStatus(): JSX.Element {
  const { currentBranch, isLoading, error } = useGitStore()

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-1 text-gray-500">
        <BranchIcon className="w-3.5 h-3.5" />
        <span className="animate-pulse">...</span>
      </div>
    )
  }

  // Error state - show icon but no branch
  if (error || !currentBranch) {
    return (
      <div className="flex items-center gap-1 text-gray-500" title={error || 'No git repository'}>
        <BranchIcon className="w-3.5 h-3.5" />
        <span>—</span>
      </div>
    )
  }

  // Normal state - show branch name
  return (
    <button
      className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
      title={`Current branch: ${currentBranch}`}
      onClick={() => {
        // Placeholder for branch switching in Phase 14
        console.log('Branch switching not yet implemented')
      }}
    >
      <BranchIcon className="w-3.5 h-3.5" />
      <span>{currentBranch}</span>
    </button>
  )
}
