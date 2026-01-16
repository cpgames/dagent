import type { JSX } from 'react'
import { useState } from 'react'
import { useProjectStore } from '../../stores'
import { Dialog, DialogHeader, DialogBody, DialogFooter, Input, Button } from '../UI'
import './NewProjectDialog.css'

interface NewProjectDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (projectPath: string) => void
}

/**
 * Folder icon for location picker
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
 * Validate project name
 * - Not empty
 * - No special characters except - and _
 * - Must not start with .
 */
function validateProjectName(name: string): string | null {
  const trimmed = name.trim()

  if (!trimmed) {
    return 'Project name is required'
  }

  if (trimmed.startsWith('.')) {
    return 'Project name cannot start with a dot'
  }

  // Allow alphanumeric, dash, underscore, space
  const invalidChars = /[^a-zA-Z0-9\-_ ]/g
  const matches = trimmed.match(invalidChars)
  if (matches) {
    return `Invalid characters: ${[...new Set(matches)].join(', ')}`
  }

  return null
}

/**
 * Dialog for creating a new DAGent project.
 * Allows selecting parent folder and entering project name.
 */
export function NewProjectDialog({
  isOpen,
  onClose,
  onSuccess
}: NewProjectDialogProps): JSX.Element | null {
  const [parentPath, setParentPath] = useState('')
  const [projectName, setProjectName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { createProject } = useProjectStore()

  if (!isOpen) return null

  const handleBrowse = async (): Promise<void> => {
    try {
      const selected = await window.electronAPI.project.selectParentDialog()
      if (selected) {
        setParentPath(selected)
        if (error) setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open folder dialog')
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)

    // Validate parent path
    if (!parentPath) {
      setError('Please select a location for the project')
      return
    }

    // Validate project name
    const nameError = validateProjectName(projectName)
    if (nameError) {
      setError(nameError)
      return
    }

    setIsSubmitting(true)
    try {
      const result = await createProject(parentPath, projectName.trim())
      if (result) {
        // Clear form
        setParentPath('')
        setProjectName('')
        setError(null)
        onSuccess(result)
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = (): void => {
    if (!isSubmitting) {
      setParentPath('')
      setProjectName('')
      setError(null)
      onClose()
    }
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setProjectName(e.target.value)
    if (error) setError(null)
  }

  return (
    <Dialog open={isOpen} onClose={handleClose} size="md" closeOnBackdrop={!isSubmitting}>
      <DialogHeader title="Create New Project" />

      <form onSubmit={handleSubmit}>
        <DialogBody>
          <div className="new-project-dialog__form">
            {/* Location field */}
            <div className="new-project-dialog__field">
              <label className="new-project-dialog__label">Location</label>
              <div className="new-project-dialog__location-row">
                <Input
                  type="text"
                  value={parentPath}
                  readOnly
                  placeholder="Select project location"
                  className="new-project-dialog__location-input"
                />
                <button
                  type="button"
                  onClick={handleBrowse}
                  disabled={isSubmitting}
                  className="new-project-dialog__browse-btn"
                  title="Browse for folder"
                >
                  <FolderIcon className="new-project-dialog__browse-icon" />
                </button>
              </div>
            </div>

            {/* Project name field */}
            <div className="new-project-dialog__field">
              <label className="new-project-dialog__label">Project Name</label>
              <Input
                type="text"
                value={projectName}
                onChange={handleNameChange}
                placeholder="Enter project name"
                autoFocus
                disabled={isSubmitting}
              />
              <p className="new-project-dialog__help-text">
                Use letters, numbers, dashes, or underscores
              </p>
            </div>

            {/* Error display */}
            {error && (
              <div className="new-project-dialog__error">
                {error}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || !parentPath || !projectName.trim()}
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
