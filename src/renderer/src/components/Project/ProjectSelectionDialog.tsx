import type { JSX } from 'react'
import { useEffect } from 'react'
import { useProjectStore } from '../../stores'
import { Dialog, DialogHeader, DialogBody } from '../UI'
import './ProjectSelectionDialog.css'

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
    <svg className={`${className}`} fill="none" viewBox="0 0 24 24">
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
    <Dialog open={isOpen} onClose={handleClose} size="md" closeOnBackdrop={!isLoading}>
      <DialogHeader title="Open Project" />

      <DialogBody>
        {/* Loading overlay */}
        {isLoading && (
          <div className="project-selection-dialog__loading">
            <Spinner className="project-selection-dialog__spinner" />
            <span className="project-selection-dialog__loading-text">Opening project...</span>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="project-selection-dialog__error">
            {error}
          </div>
        )}

        {/* Recent projects section */}
        {recentProjects.length > 0 && (
          <div className="project-selection-dialog__section">
            <h3 className="project-selection-dialog__section-title">Recent Projects</h3>
            <div className="project-selection-dialog__recent-list">
              {recentProjects.map((project) => (
                <button
                  key={project.path}
                  onClick={() => handleOpenRecent(project.path)}
                  disabled={isLoading}
                  className="project-selection-dialog__recent-item"
                >
                  <FolderIcon className="project-selection-dialog__recent-icon" />
                  <div className="project-selection-dialog__recent-info">
                    <div className="project-selection-dialog__recent-name">{project.name}</div>
                    <div className="project-selection-dialog__recent-path" title={project.path}>
                      {truncatePath(project.path)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleRemoveFromRecent(e, project.path)}
                    className="project-selection-dialog__remove-btn"
                    title="Remove from recent"
                  >
                    <XIcon className="project-selection-dialog__remove-icon" />
                  </button>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No recent projects message */}
        {recentProjects.length === 0 && (
          <div className="project-selection-dialog__empty">
            No recent projects
          </div>
        )}

        {/* Action buttons */}
        <div className="project-selection-dialog__actions">
          <button
            onClick={handleOpenFolder}
            disabled={isLoading}
            className="project-selection-dialog__action-btn"
          >
            <div className="project-selection-dialog__action-icon project-selection-dialog__action-icon--blue">
              <FolderIcon />
            </div>
            <div className="project-selection-dialog__action-text">
              <div className="project-selection-dialog__action-title">Open Folder</div>
              <div className="project-selection-dialog__action-desc">Open an existing project folder</div>
            </div>
          </button>

          <button
            onClick={handleCreateNew}
            disabled={isLoading || !onCreateNew}
            className="project-selection-dialog__action-btn"
          >
            <div className="project-selection-dialog__action-icon project-selection-dialog__action-icon--green">
              <PlusIcon />
            </div>
            <div className="project-selection-dialog__action-text">
              <div className="project-selection-dialog__action-title">Create New Project</div>
              <div className="project-selection-dialog__action-desc">Create a new DAGent project folder</div>
            </div>
          </button>
        </div>
      </DialogBody>
    </Dialog>
  )
}
