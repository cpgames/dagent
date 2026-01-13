import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { useGitStore } from '../../stores'

interface BranchSwitcherProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Checkmark icon for current branch
 */
function CheckIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

/**
 * Spinner icon for loading state
 */
function SpinnerIcon({ className }: { className?: string }): JSX.Element {
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
 * BranchSwitcher dropdown component.
 * Displays list of local branches and allows switching between them.
 * Positioned above the status bar when open.
 */
export function BranchSwitcher({ isOpen, onClose }: BranchSwitcherProps): JSX.Element | null {
  const { branches, currentBranch, isLoadingBranches, isCheckingOut, loadBranches, checkoutBranch, error, setError } =
    useGitStore()
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load branches when dropdown opens
  useEffect(() => {
    if (isOpen) {
      loadBranches()
    }
  }, [isOpen, loadBranches])

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return (): void => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
    return
  }, [isOpen, onClose])

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return (): void => {
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
    return
  }, [isOpen, onClose])

  // Clear error when dropdown closes
  useEffect(() => {
    if (!isOpen && error) {
      setError(null)
    }
  }, [isOpen, error, setError])

  const handleBranchClick = async (branchName: string): Promise<void> => {
    if (branchName === currentBranch) {
      onClose()
      return
    }

    const success = await checkoutBranch(branchName)
    if (success) {
      onClose()
    }
    // If failed, error is set in store and shown in dropdown
  }

  if (!isOpen) {
    return null
  }

  return (
    <div
      ref={dropdownRef}
      className="absolute bottom-full left-0 mb-1 min-w-[200px] max-h-[300px] overflow-y-auto
                 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700 text-sm font-medium text-gray-300">
        Switch Branch
      </div>

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 bg-red-900/50 text-red-300 text-sm border-b border-gray-700">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoadingBranches && (
        <div className="flex items-center justify-center py-4">
          <SpinnerIcon className="w-5 h-5 text-gray-400" />
          <span className="ml-2 text-gray-400 text-sm">Loading branches...</span>
        </div>
      )}

      {/* Checkout in progress overlay */}
      {isCheckingOut && (
        <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center z-10">
          <SpinnerIcon className="w-5 h-5 text-blue-400" />
          <span className="ml-2 text-blue-300 text-sm">Switching...</span>
        </div>
      )}

      {/* Branch list */}
      {!isLoadingBranches && branches.length > 0 && (
        <div className="py-1">
          {branches.map((branch) => (
            <button
              key={branch.name}
              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2
                         hover:bg-gray-700 transition-colors
                         ${branch.current ? 'text-blue-400' : 'text-gray-300'}`}
              onClick={() => handleBranchClick(branch.name)}
              disabled={isCheckingOut}
            >
              <span className="w-4 flex-shrink-0">
                {branch.current && <CheckIcon className="w-4 h-4 text-blue-400" />}
              </span>
              <span className="truncate">{branch.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoadingBranches && branches.length === 0 && (
        <div className="px-3 py-4 text-center text-gray-500 text-sm">No branches found</div>
      )}
    </div>
  )
}
