import type { JSX } from 'react'
import { useState, useEffect, useRef } from 'react'
import { useProjectStore } from '../../stores'
import './ProjectSelector.css'

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
    <div className="project-selector" ref={dropdownRef}>
      {/* Project name text */}
      <span className="project-selector__name">{projectName}</span>

      {/* Dropdown trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="project-selector__trigger"
        title="Switch project"
      >
        ...
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="project-selector__dropdown">
          {/* Recent projects */}
          {recentToShow.length > 0 && (
            <div className="project-selector__recent-list">
              {recentToShow.map((project) => (
                <button
                  key={project.path}
                  onClick={() => handleProjectClick(project.path)}
                  className="project-selector__recent-item"
                >
                  <FolderIcon className="project-selector__recent-icon" />
                  <span className="project-selector__recent-name">{project.name}</span>
                </button>
              ))}
              <div className="project-selector__divider" />
            </div>
          )}

          {/* Open Project... option */}
          <button
            onClick={handleOpenDialog}
            className="project-selector__open-item"
          >
            <span className="project-selector__open-text">Open Project...</span>
          </button>
        </div>
      )}
    </div>
  )
}
