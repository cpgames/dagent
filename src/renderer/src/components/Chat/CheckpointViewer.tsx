import { useEffect, useState, useCallback, type JSX } from 'react'
import type { Memory } from '@shared/types/session'
import './CheckpointViewer.css'

interface CheckpointViewerProps {
  sessionId: string | null
  featureId: string
  projectRoot: string
  isOpen?: boolean
  onToggle?: () => void
}

type SectionKey = 'critical' | 'important' | 'minor'

interface SectionConfig {
  key: SectionKey
  label: string
  icon: JSX.Element
  colorClass: string
}

const SECTIONS: SectionConfig[] = [
  {
    key: 'critical',
    label: 'Critical',
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
    colorClass: 'checkpoint-viewer__section--critical'
  },
  {
    key: 'important',
    label: 'Important',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    ),
    colorClass: 'checkpoint-viewer__section--important'
  },
  {
    key: 'minor',
    label: 'Minor',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    colorClass: 'checkpoint-viewer__section--minor'
  }
]

export function CheckpointViewer({
  sessionId,
  featureId,
  projectRoot,
  isOpen = true,
  onToggle
}: CheckpointViewerProps): JSX.Element {
  const [memory, setMemory] = useState<Memory | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    new Set(['critical', 'important'])
  )
  const [isLoading, setIsLoading] = useState(false)

  const loadMemory = useCallback(async () => {
    if (!sessionId || !featureId || !projectRoot) {
      setMemory(null)
      return
    }

    setIsLoading(true)
    try {
      const result = await window.electronAPI.session.getCheckpoint(
        projectRoot,
        sessionId,
        featureId
      )
      setMemory(result)
    } catch (error) {
      console.error('Failed to load memory:', error)
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, featureId, projectRoot])

  // Load memory on mount and when session changes
  useEffect(() => {
    loadMemory()
  }, [loadMemory])

  // Subscribe to compaction complete events to refresh
  useEffect(() => {
    const unsubscribe = window.electronAPI.session.onCompactionComplete((data) => {
      if (data.sessionId === sessionId) {
        loadMemory()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [sessionId, loadMemory])

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
    if (!memory?.summary) return []
    return memory.summary[key] || []
  }

  if (!sessionId) {
    return (
      <div className="checkpoint-viewer checkpoint-viewer--empty">
        <div className="checkpoint-viewer__empty-text">No session selected</div>
      </div>
    )
  }

  if (isLoading && !memory) {
    return (
      <div className="checkpoint-viewer checkpoint-viewer--loading">
        <div className="checkpoint-viewer__loading-text">Loading memory...</div>
      </div>
    )
  }

  if (!memory) {
    return (
      <div className="checkpoint-viewer checkpoint-viewer--empty">
        <div className="checkpoint-viewer__empty-text">No memory yet</div>
        <div className="checkpoint-viewer__empty-hint">
          Memory is created when sessions are compacted
        </div>
      </div>
    )
  }

  return (
    <div className={`checkpoint-viewer ${isOpen ? 'checkpoint-viewer--open' : 'checkpoint-viewer--closed'}`}>
      {/* Header */}
      <div className="checkpoint-viewer__header" onClick={onToggle}>
        <span className="checkpoint-viewer__header-title">
          Memory v{memory.version}
        </span>
        <span className="checkpoint-viewer__header-meta">
          {memory.stats.totalMessages} messages compacted
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
