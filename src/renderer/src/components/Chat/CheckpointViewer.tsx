import { useEffect, useState, useCallback, type JSX } from 'react'
import type { Checkpoint } from '@shared/types/session'
import './CheckpointViewer.css'

interface CheckpointViewerProps {
  sessionId: string | null
  featureId: string
  projectRoot: string
  isOpen?: boolean
  onToggle?: () => void
}

type SectionKey = 'completed' | 'inProgress' | 'pending' | 'blockers' | 'decisions'

interface SectionConfig {
  key: SectionKey
  label: string
  icon: JSX.Element
  colorClass: string
}

const SECTIONS: SectionConfig[] = [
  {
    key: 'completed',
    label: 'Completed',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    colorClass: 'checkpoint-viewer__section--completed'
  },
  {
    key: 'inProgress',
    label: 'In Progress',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    ),
    colorClass: 'checkpoint-viewer__section--in-progress'
  },
  {
    key: 'pending',
    label: 'Pending',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    colorClass: 'checkpoint-viewer__section--pending'
  },
  {
    key: 'blockers',
    label: 'Blockers',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1.5l6.5 12H1.5L8 1.5z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 6v3M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    colorClass: 'checkpoint-viewer__section--blockers'
  },
  {
    key: 'decisions',
    label: 'Decisions',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    colorClass: 'checkpoint-viewer__section--decisions'
  }
]

export function CheckpointViewer({
  sessionId,
  featureId,
  projectRoot,
  isOpen = true,
  onToggle
}: CheckpointViewerProps): JSX.Element {
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    new Set(['completed', 'inProgress', 'blockers'])
  )
  const [isLoading, setIsLoading] = useState(false)

  const loadCheckpoint = useCallback(async () => {
    if (!sessionId || !featureId || !projectRoot) {
      setCheckpoint(null)
      return
    }

    setIsLoading(true)
    try {
      const result = await window.electronAPI.session.getCheckpoint(
        projectRoot,
        sessionId,
        featureId
      )
      setCheckpoint(result)
    } catch (error) {
      console.error('Failed to load checkpoint:', error)
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, featureId, projectRoot])

  // Load checkpoint on mount and when session changes
  useEffect(() => {
    loadCheckpoint()
  }, [loadCheckpoint])

  // Subscribe to compaction complete events to refresh
  useEffect(() => {
    const unsubscribe = window.electronAPI.session.onCompactionComplete((data) => {
      if (data.sessionId === sessionId) {
        loadCheckpoint()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [sessionId, loadCheckpoint])

  const toggleSection = (key: SectionKey) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const getSectionItems = (key: SectionKey): string[] => {
    if (!checkpoint?.summary) return []
    return checkpoint.summary[key] || []
  }

  if (!sessionId) {
    return (
      <div className="checkpoint-viewer checkpoint-viewer--empty">
        <div className="checkpoint-viewer__empty-text">No session selected</div>
      </div>
    )
  }

  if (isLoading && !checkpoint) {
    return (
      <div className="checkpoint-viewer checkpoint-viewer--loading">
        <div className="checkpoint-viewer__loading-text">Loading checkpoint...</div>
      </div>
    )
  }

  if (!checkpoint) {
    return (
      <div className="checkpoint-viewer checkpoint-viewer--empty">
        <div className="checkpoint-viewer__empty-text">No checkpoint yet</div>
        <div className="checkpoint-viewer__empty-hint">
          Checkpoints are created when sessions are compacted
        </div>
      </div>
    )
  }

  return (
    <div className={`checkpoint-viewer ${isOpen ? 'checkpoint-viewer--open' : 'checkpoint-viewer--closed'}`}>
      {/* Header */}
      <div className="checkpoint-viewer__header" onClick={onToggle}>
        <span className="checkpoint-viewer__header-title">
          Checkpoint v{checkpoint.version}
        </span>
        <span className="checkpoint-viewer__header-meta">
          {checkpoint.stats.totalMessages} messages compacted
        </span>
        {onToggle && (
          <svg
            className={`checkpoint-viewer__header-chevron ${isOpen ? 'checkpoint-viewer__header-chevron--open' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {/* Sections */}
      {isOpen && (
        <div className="checkpoint-viewer__sections">
          {SECTIONS.map((section) => {
            const items = getSectionItems(section.key)
            const isExpanded = expandedSections.has(section.key)

            return (
              <div
                key={section.key}
                className={`checkpoint-viewer__section ${section.colorClass}`}
              >
                <div
                  className="checkpoint-viewer__section-header"
                  onClick={() => toggleSection(section.key)}
                >
                  <span className="checkpoint-viewer__section-icon">{section.icon}</span>
                  <span className="checkpoint-viewer__section-label">{section.label}</span>
                  <span className="checkpoint-viewer__section-count">({items.length})</span>
                  <svg
                    className={`checkpoint-viewer__section-chevron ${isExpanded ? 'checkpoint-viewer__section-chevron--open' : ''}`}
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>

                {isExpanded && (
                  <div className="checkpoint-viewer__section-content">
                    {items.length > 0 ? (
                      <ul className="checkpoint-viewer__item-list">
                        {items.map((item, index) => (
                          <li key={index} className="checkpoint-viewer__item">
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="checkpoint-viewer__section-empty">None</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
