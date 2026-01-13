import type { JSX } from 'react'
import { useEffect } from 'react'
import { useProjectStore } from '../../stores'

interface ProjectSelectionDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreateNew?: () => void
  onProjectOpened?: (hasGit: boolean) => void
}

/**
 * Folder icon for Open Folder button
 */
function FolderIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  )
}

/**
 * Plus icon for Create New Project button
 */
function PlusIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )
}

/**
 * X icon for remove from recent
 */
function XIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
 * Truncate a path for display, keeping the end visible
 */
function truncatePath(path: string, maxLength: number = 40): string {
  if (path.length <= maxLength) return path
  return '...' + path.slice(-maxLength + 3)
}

/**
 * Project selection dialog for opening existing projects or creating new ones.
 * Shows recent projects list, Open Folder and Create New Project options.
 */
export function ProjectSelectionDialog({
  isOpen,
  onClose,
  onCreateNew,
  onProjectOpened
}: ProjectSelectionDialogProps): JSX.Element | null {
  const {
    openFolderDialog,
    openProject,
    loadRecentProjects,
    removeFromRecent,
    recentProjects,
    isLoading,
    error
  } = useProjectStore()

  // Load recent projects when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadRecentProjects()
    }
  }, [isOpen, loadRecentProjects])

  if (!isOpen) return null

  const handleOpenFolder = async (): Promise<void> => {
    const result = await openFolderDialog()
    if (result.success) {
      onClose()
      onProjectOpened?.(result.hasGit ?? false)
    }
  }

  const handleCreateNew = (): void => {
    if (onCreateNew) {
      onCreateNew()
    }
  }

  const handleOpenRecent = async (path: string): Promise<void> => {
    const result = await openProject(path)
    if (result.success) {
      onClose()
      onProjectOpened?.(result.hasGit ?? false)
    }
  }

  const handleRemoveFromRecent = async (
    e: React.MouseEvent,
    path: string
  ): Promise<void> => {
    e.stopPropagation()
    await removeFromRecent(path)
  }

  const handleClose = (): void => {
    if (!isLoading) {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Dialog */}
      <div
        className="relative bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Open Project</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-white focus:outline-none disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-800/80 rounded-lg flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2">
              <Spinner className="w-8 h-8 text-blue-500" />
              <span className="text-sm text-gray-300">Opening project...</span>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Recent projects section */}
        {recentProjects.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Recent Projects</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {recentProjects.map((project) => (
                <button
                  key={project.path}
                  onClick={() => handleOpenRecent(project.path)}
                  disabled={isLoading}
                  className="w-full flex items-center gap-3 px-3 py-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <FolderIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-white text-sm font-medium truncate">{project.name}</div>
                    <div className="text-xs text-gray-500 truncate" title={project.path}>
                      {truncatePath(project.path)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleRemoveFromRecent(e, project.path)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded transition-opacity"
                    title="Remove from recent"
                  >
                    <XIcon className="w-4 h-4 text-gray-400" />
                  </button>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No recent projects message */}
        {recentProjects.length === 0 && (
          <div className="mb-4 text-center py-4 text-gray-500 text-sm">
            No recent projects
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3 mt-auto">
          <button
            onClick={handleOpenFolder}
            disabled={isLoading}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <FolderIcon className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <div className="text-white font-medium">Open Folder</div>
              <div className="text-sm text-gray-400">Open an existing project folder</div>
            </div>
          </button>

          <button
            onClick={handleCreateNew}
            disabled={isLoading || !onCreateNew}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
              <PlusIcon className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <div className="text-white font-medium">Create New Project</div>
              <div className="text-sm text-gray-400">Create a new DAGent project folder</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
