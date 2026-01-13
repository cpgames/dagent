import type { JSX } from 'react'
import { useState } from 'react'
import { useProjectStore } from '../../stores'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Dialog */}
      <div
        className="relative bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Create New Project</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
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

        <form onSubmit={handleSubmit}>
          {/* Location field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Location</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={parentPath}
                readOnly
                placeholder="Select project location"
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none cursor-default"
              />
              <button
                type="button"
                onClick={handleBrowse}
                disabled={isSubmitting}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Browse for folder"
              >
                <FolderIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Project name field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={handleNameChange}
              placeholder="Enter project name"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500">
              Use letters, numbers, dashes, or underscores
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !parentPath || !projectName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
