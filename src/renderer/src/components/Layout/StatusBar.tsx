import { useEffect, useRef, type JSX, type ReactNode } from 'react'
import { useGitStore } from '../../stores'
import { GitStatus } from '../Git'

/** Status refresh interval in milliseconds (30 seconds) */
const STATUS_REFRESH_INTERVAL = 30_000

interface StatusBarProps {
  /** Content for the right section (auth indicator, etc.) */
  children?: ReactNode
}

/**
 * Bottom status bar for displaying application state.
 * Shows project/git info on left, auth status on right.
 * Automatically refreshes git status periodically and on window focus.
 */
export function StatusBar({ children }: StatusBarProps): JSX.Element {
  const { loadBranch, refreshStatus } = useGitStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load git branch on mount and set up periodic refresh
  useEffect(() => {
    // Initial load
    loadBranch()

    // Set up periodic status refresh (every 30 seconds)
    intervalRef.current = setInterval(() => {
      refreshStatus()
    }, STATUS_REFRESH_INTERVAL)

    // Handle visibility change (refresh when window regains focus)
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        refreshStatus()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadBranch, refreshStatus])

  return (
    <footer className="h-8 bg-gray-800 border-t border-gray-700 flex items-center justify-end px-3 text-xs">
      {/* Right section: Auth and git status */}
      <div className="flex items-center gap-3">
        {children}
        <GitStatus />
      </div>
    </footer>
  )
}
