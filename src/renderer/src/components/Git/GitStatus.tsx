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
 * Dirty indicator dot - shows if working tree has uncommitted changes
 */
function DirtyIndicator({ isDirty }: { isDirty: boolean }): JSX.Element {
  const color = isDirty ? 'bg-yellow-500' : 'bg-green-500'
  const title = isDirty ? 'Working tree has uncommitted changes' : 'Working tree is clean'

  return <span className={`w-2 h-2 rounded-full ${color}`} title={title} />
}

/**
 * Ahead/behind indicator - shows commits ahead/behind remote
 */
function AheadBehindIndicator({
  ahead,
  behind
}: {
  ahead: number
  behind: number
}): JSX.Element | null {
  if (ahead === 0 && behind === 0) {
    return null
  }

  const parts: string[] = []
  if (ahead > 0) parts.push(`↑${ahead}`)
  if (behind > 0) parts.push(`↓${behind}`)

  const title =
    (ahead > 0 ? `${ahead} commit${ahead > 1 ? 's' : ''} ahead of remote. ` : '') +
    (behind > 0 ? `${behind} commit${behind > 1 ? 's' : ''} behind remote.` : '')

  return (
    <span className="text-gray-500 text-xs" title={title.trim()}>
      {parts.join(' ')}
    </span>
  )
}

/**
 * Change counts indicator - shows modified/untracked counts
 */
function ChangeCounts({
  modified,
  untracked,
  staged
}: {
  modified: number
  untracked: number
  staged: number
}): JSX.Element | null {
  const total = modified + untracked + staged
  if (total === 0) {
    return null
  }

  const parts: string[] = []
  if (staged > 0) parts.push(`S:${staged}`)
  if (modified > 0) parts.push(`M:${modified}`)
  if (untracked > 0) parts.push(`U:${untracked}`)

  const title =
    (staged > 0 ? `${staged} staged file${staged > 1 ? 's' : ''}. ` : '') +
    (modified > 0 ? `${modified} modified file${modified > 1 ? 's' : ''}. ` : '') +
    (untracked > 0 ? `${untracked} untracked file${untracked > 1 ? 's' : ''}.` : '')

  return (
    <span className="text-gray-500 text-xs" title={title.trim()}>
      [{parts.join(' ')}]
    </span>
  )
}

/**
 * GitStatus component displays current git branch and status in status bar.
 * Shows branch name, dirty indicator, ahead/behind counts, and change counts.
 * Click handler reserved for future branch switching (Phase 14-02).
 */
export function GitStatus(): JSX.Element {
  const { currentBranch, isLoading, error, isDirty, staged, modified, untracked, ahead, behind } =
    useGitStore()

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
        <span>-</span>
      </div>
    )
  }

  // Normal state - show branch name with status indicators
  // Layout: [branch-icon] main [dirty-dot] [ahead/behind] [change-counts]
  return (
    <button
      className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
      title={`Current branch: ${currentBranch}`}
      onClick={() => {
        // Placeholder for branch switching in Phase 14-02
        console.log('Branch switching not yet implemented')
      }}
    >
      <BranchIcon className="w-3.5 h-3.5" />
      <span>{currentBranch}</span>
      <DirtyIndicator isDirty={isDirty} />
      <AheadBehindIndicator ahead={ahead} behind={behind} />
      <ChangeCounts staged={staged} modified={modified} untracked={untracked} />
    </button>
  )
}
