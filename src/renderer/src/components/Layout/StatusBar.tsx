import type { JSX, ReactNode } from 'react'

interface StatusBarProps {
  /** Content for the right section (auth indicator, etc.) */
  children?: ReactNode
}

/**
 * Bottom status bar for displaying application state.
 * Shows project/git info on left, auth status on right.
 */
export function StatusBar({ children }: StatusBarProps): JSX.Element {
  return (
    <footer className="h-8 bg-gray-800 border-t border-gray-700 flex items-center justify-between px-3 text-xs">
      {/* Left section: Project/Git info */}
      <div className="flex items-center gap-2 text-gray-400">
        <span>DAGent</span>
      </div>

      {/* Right section: Auth and status indicators */}
      <div className="flex items-center gap-2">
        {children}
      </div>
    </footer>
  )
}
