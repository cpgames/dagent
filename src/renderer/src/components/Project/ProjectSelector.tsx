import type { JSX } from 'react'
import { useState, useEffect, useRef } from 'react'
import { useProjectStore } from '../../stores'

interface ProjectSelectorProps {
  onOpenFullDialog: () => void
}

/**
 * Folder icon
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
 * Project selector with project name text and "..." dropdown button.
 * Shows current project name followed by a button for quick project switching.
 */
export function ProjectSelector({ onOpenFullDialog }: ProjectSelectorProps): JSX.Element {
  const { projectPath, recentProjects, loadRecentProjects, openProject } = useProjectStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const projectName = projectPath?.split(/[/\\]/).pop() || 'No Project'

  // Load recent projects on mount
  useEffect(() => {
    loadRecentProjects()
  }, [loadRecentProjects])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleProjectClick = async (path: string): Promise<void> => {
    setIsOpen(false)
    await openProject(path)
  }

  const handleOpenDialog = (): void => {
    setIsOpen(false)
    onOpenFullDialog()
  }

  // Get top 3 recent projects (excluding current)
  const recentToShow = recentProjects
    .filter((p) => p.path.toLowerCase() !== projectPath?.toLowerCase())
    .slice(0, 3)

  return (
    <div className="relative flex items-center gap-1" ref={dropdownRef}>
      {/* Project name text */}
      <span className="text-lg font-semibold text-white">{projectName}</span>

      {/* Dropdown trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 rounded border border-gray-600 transition-colors"
        title="Switch project"
      >
        ...
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 overflow-hidden">
          {/* Recent projects */}
          {recentToShow.length > 0 && (
            <div className="py-1">
              {recentToShow.map((project) => (
                <button
                  key={project.path}
                  onClick={() => handleProjectClick(project.path)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-700 transition-colors"
                >
                  <FolderIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-white truncate">{project.name}</span>
                </button>
              ))}
              <div className="border-t border-gray-600 my-1" />
            </div>
          )}

          {/* Open Project... option */}
          <button
            onClick={handleOpenDialog}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-700 transition-colors"
          >
            <span className="text-sm text-gray-300">Open Project...</span>
          </button>
        </div>
      )}
    </div>
  )
}
