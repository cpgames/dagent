import { useState, useEffect } from 'react'
import type { JSX } from 'react'
import { useGitStore } from '../../stores'
import { BranchSwitcher } from './BranchSwitcher'
import { PublishToGitHubDialog } from './PublishToGitHubDialog'

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
 * Cloud icon for remote status
 */
function CloudIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
      />
    </svg>
  )
}

/**
 * Cloud off icon for no remote
 */
function CloudOffIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
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
 * Convert a git remote URL to a browser-friendly URL.
 * Handles both SSH (git@github.com:user/repo.git) and HTTPS formats.
 */
function getRemoteBrowserUrl(remoteUrl: string): string | null {
  if (!remoteUrl) return null

  // Handle SSH format: git@github.com:user/repo.git
  const sshMatch = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
  if (sshMatch) {
    const [, host, path] = sshMatch
    return `https://${host}/${path}`
  }

  // Handle HTTPS format: https://github.com/user/repo.git
  const httpsMatch = remoteUrl.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) {
    const [, host, path] = httpsMatch
    return `https://${host}/${path}`
  }

  // Fallback: return as-is if it looks like a URL
  if (remoteUrl.startsWith('http')) {
    return remoteUrl.replace(/\.git$/, '')
  }

  return null
}

/**
 * GitStatus component displays current git branch and status in status bar.
 * Shows branch name, dirty indicator, ahead/behind counts, and change counts.
 * Click to open branch switcher dropdown for switching branches.
 */
export function GitStatus(): JSX.Element {
  const {
    currentBranch,
    isLoading,
    error,
    isDirty,
    staged,
    modified,
    untracked,
    ahead,
    behind,
    hasRemote,
    remotes,
    loadRemotes
  } = useGitStore()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false)

  // Load remotes when we have a branch (project is loaded)
  useEffect(() => {
    if (currentBranch) {
      loadRemotes()
    }
  }, [currentBranch, loadRemotes])

  const toggleDropdown = (): void => {
    setIsDropdownOpen((prev) => !prev)
  }

  const closeDropdown = (): void => {
    setIsDropdownOpen(false)
  }

  const openPublishDialog = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setIsPublishDialogOpen(true)
  }

  const closePublishDialog = (): void => {
    setIsPublishDialogOpen(false)
  }

  const openRemoteInBrowser = (): void => {
    if (remotes.length > 0) {
      const browserUrl = getRemoteBrowserUrl(remotes[0].fetchUrl)
      if (browserUrl) {
        window.open(browserUrl, '_blank')
      }
    }
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
  // Layout: [branch-icon] main [chevron] [dirty-dot] [ahead/behind] [change-counts] [remote-status]
  return (
    <div className="relative flex items-center gap-2">
      <button
        className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
        title={`Current branch: ${currentBranch}. Click to switch branches.`}
        onClick={toggleDropdown}
      >
        <BranchIcon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate max-w-32">{currentBranch}</span>
        <ChevronIcon className="w-3 h-3 flex-shrink-0" isOpen={isDropdownOpen} />
        <DirtyIndicator isDirty={isDirty} />
        <AheadBehindIndicator ahead={ahead} behind={behind} />
        <ChangeCounts staged={staged} modified={modified} untracked={untracked} />
      </button>

      {/* Remote status indicator */}
      {hasRemote ? (
        <button
          className="flex items-center text-green-500 hover:text-green-400 transition-colors"
          title={`${remotes.map(r => `${r.name}: ${r.fetchUrl}`).join('\n')}\n\nClick to open in browser`}
          onClick={openRemoteInBrowser}
        >
          <CloudIcon className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          className="flex items-center gap-1 text-yellow-500 hover:text-yellow-400 transition-colors text-xs"
          title="No remote configured. Click to publish to GitHub."
          onClick={openPublishDialog}
        >
          <CloudOffIcon className="w-3.5 h-3.5" />
          <span>Publish</span>
        </button>
      )}

      <BranchSwitcher isOpen={isDropdownOpen} onClose={closeDropdown} />
      <PublishToGitHubDialog isOpen={isPublishDialogOpen} onClose={closePublishDialog} />
    </div>
  )
}
