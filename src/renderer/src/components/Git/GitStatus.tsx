import { useState } from 'react'
import type { JSX } from 'react'
import { useGitStore } from '../../stores'
import { BranchSwitcher } from './BranchSwitcher'

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
 * Chevron icon for dropdown indicator
 */
function ChevronIcon({ className, isOpen }: { className?: string; isOpen: boolean }): JSX.Element {
  return (
    <svg
      className={`${className} transition-transform ${isOpen ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
  if (ahead > 0) parts.push(`${ahead}`)
  if (behind > 0) parts.push(`${behind}`)

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
 * Click to open branch switcher dropdown for switching branches.
 */
export function GitStatus(): JSX.Element {
  const { currentBranch, isLoading, error, isDirty, staged, modified, untracked, ahead, behind } =
    useGitStore()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const toggleDropdown = (): void => {
    setIsDropdownOpen((prev) => !prev)
  }

  const closeDropdown = (): void => {
    setIsDropdownOpen(false)
  }

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

  // Normal state - show branch name with status indicators and dropdown
  // Layout: [branch-icon] main [chevron] [dirty-dot] [ahead/behind] [change-counts]
  return (
    <div className="relative">
      <button
        className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
        title={`Current branch: ${currentBranch}. Click to switch branches.`}
        onClick={toggleDropdown}
      >
        <BranchIcon className="w-3.5 h-3.5" />
        <span>{currentBranch}</span>
        <ChevronIcon className="w-3 h-3" isOpen={isDropdownOpen} />
        <DirtyIndicator isDirty={isDirty} />
        <AheadBehindIndicator ahead={ahead} behind={behind} />
        <ChangeCounts staged={staged} modified={modified} untracked={untracked} />
      </button>
      <BranchSwitcher isOpen={isDropdownOpen} onClose={closeDropdown} />
    </div>
  )
}
