import { useEffect, type JSX, type ReactNode } from 'react'
import { useGitStore } from '../../stores'
import { GitStatus } from '../Git'

interface StatusBarProps {
  /** Content for the right section (auth indicator, etc.) */
  children?: ReactNode
}

/**
 * Bottom status bar for displaying application state.
 * Shows project/git info on left, auth status on right.
 */
export function StatusBar({ children }: StatusBarProps): JSX.Element {
  const { loadBranch } = useGitStore()

  // Load git branch on mount
  useEffect(() => {
    loadBranch()
  }, [loadBranch])

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
