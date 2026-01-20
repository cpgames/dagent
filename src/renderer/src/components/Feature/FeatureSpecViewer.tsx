import { useState, useEffect, useCallback, type JSX } from 'react'
import type { FeatureSpec } from '../../../../main/agents/feature-spec-types'
import './FeatureSpecViewer.css'

export interface FeatureSpecViewerProps {
  featureId: string
  className?: string
}

interface SectionProps {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
  count?: number
}

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
  count
}: SectionProps): JSX.Element {
  return (
    <div className="spec-viewer__section">
      <button
        onClick={onToggle}
        className="spec-viewer__section-header"
      >
        <span className="spec-viewer__section-title">{title}</span>
        <div className="spec-viewer__section-right">
          {count !== undefined && (
            <span className="spec-viewer__section-count">{count}</span>
          )}
          <svg
            className={`spec-viewer__section-chevron ${isOpen ? 'spec-viewer__section-chevron--open' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isOpen && <div className="spec-viewer__section-content">{children}</div>}
    </div>
  )
}

export function FeatureSpecViewer({
  featureId,
  className = ''
}: FeatureSpecViewerProps): JSX.Element | null {
  const [spec, setSpec] = useState<FeatureSpec | null>(null)
  const [loading, setLoading] = useState(true)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    goals: true,
    requirements: true,
    constraints: false,
    acceptance: true
  })

  const loadSpec = useCallback(async () => {
    try {
      const result = await window.electronAPI.pmSpec.getSpec({ featureId })
      setSpec(result.spec)
    } catch (error) {
      console.error('Failed to load feature spec:', error)
      setSpec(null)
    } finally {
      setLoading(false)
    }
  }, [featureId])

  // Initial load
  useEffect(() => {
    setLoading(true)
    loadSpec()
  }, [loadSpec])

  // Poll for updates every 10 seconds (fallback, events provide real-time updates)
  useEffect(() => {
    const interval = setInterval(loadSpec, 10000)
    return () => clearInterval(interval)
  }, [loadSpec])

  // Subscribe to spec updates for real-time refresh
  useEffect(() => {
    if (!window.electronAPI?.pmSpec?.onUpdated) return

    const unsubscribe = window.electronAPI.pmSpec.onUpdated((data) => {
      // Only reload if the update is for this feature
      if (data.featureId === featureId) {
        loadSpec()
      }
    })

    return unsubscribe
  }, [featureId, loadSpec])

  const toggleSection = (section: string): void => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  // Don't render anything if no spec exists
  if (loading) {
    return (
      <div className={`spec-viewer ${className}`}>
        <div className="spec-viewer__loading">Loading spec...</div>
      </div>
    )
  }

  if (!spec) {
    return (
      <div className={`spec-viewer ${className}`}>
        <div className="spec-viewer__empty">
          No spec yet. Ask the PM agent to create one for this feature.
        </div>
      </div>
    )
  }

  const completedReqs = spec.requirements.filter((r) => r.completed).length
  const passedCriteria = spec.acceptanceCriteria.filter((c) => c.passed).length

  return (
    <div className={`spec-viewer ${className}`}>
      {/* Header */}
      <div className="spec-viewer__header">
        <div className="spec-viewer__header-row">
          <svg
            className="spec-viewer__header-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span className="spec-viewer__header-title">Feature Spec</span>
        </div>
        <div className="spec-viewer__feature-name">{spec.featureName}</div>
      </div>

      {/* Goals Section */}
      {spec.goals.length > 0 && (
        <CollapsibleSection
          title="Goals"
          isOpen={openSections.goals}
          onToggle={() => toggleSection('goals')}
          count={spec.goals.length}
        >
          <ul className="spec-viewer__list">
            {spec.goals.map((goal, idx) => (
              <li key={idx} className="spec-viewer__item">
                <span className="spec-viewer__item-bullet spec-viewer__item-bullet--goal">*</span>
                <span className="spec-viewer__item-text">{goal}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Requirements Section */}
      {spec.requirements.length > 0 && (
        <CollapsibleSection
          title="Requirements"
          isOpen={openSections.requirements}
          onToggle={() => toggleSection('requirements')}
          count={spec.requirements.length}
        >
          <div className="spec-viewer__progress">
            {completedReqs}/{spec.requirements.length} complete
          </div>
          <ul className="spec-viewer__list">
            {spec.requirements.map((req) => (
              <li key={req.id} className="spec-viewer__item">
                <span className={`spec-viewer__item-check ${req.completed ? 'spec-viewer__item-check--complete' : 'spec-viewer__item-check--pending'}`}>
                  {req.completed ? 'v' : 'o'}
                </span>
                <span className={`spec-viewer__item-text ${req.completed ? 'spec-viewer__item-text--complete' : ''}`}>
                  {req.description}
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Constraints Section */}
      {spec.constraints.length > 0 && (
        <CollapsibleSection
          title="Constraints"
          isOpen={openSections.constraints}
          onToggle={() => toggleSection('constraints')}
          count={spec.constraints.length}
        >
          <ul className="spec-viewer__list">
            {spec.constraints.map((constraint, idx) => (
              <li key={idx} className="spec-viewer__item">
                <span className="spec-viewer__item-bullet spec-viewer__item-bullet--constraint">!</span>
                <span className="spec-viewer__item-text">{constraint}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Acceptance Criteria Section */}
      {spec.acceptanceCriteria.length > 0 && (
        <CollapsibleSection
          title="Acceptance Criteria"
          isOpen={openSections.acceptance}
          onToggle={() => toggleSection('acceptance')}
          count={spec.acceptanceCriteria.length}
        >
          <div className="spec-viewer__progress">
            {passedCriteria}/{spec.acceptanceCriteria.length} passed
          </div>
          <ul className="spec-viewer__list">
            {spec.acceptanceCriteria.map((criterion) => (
              <li key={criterion.id} className="spec-viewer__item">
                <span className={`spec-viewer__item-check ${criterion.passed ? 'spec-viewer__item-check--complete' : 'spec-viewer__item-check--pending'}`}>
                  {criterion.passed ? 'v' : 'o'}
                </span>
                <span className={`spec-viewer__item-text ${criterion.passed ? 'spec-viewer__item-text--complete' : ''}`}>
                  {criterion.description}
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Empty state if spec has no content */}
      {spec.goals.length === 0 &&
        spec.requirements.length === 0 &&
        spec.constraints.length === 0 &&
        spec.acceptanceCriteria.length === 0 && (
          <div className="spec-viewer__empty">Spec is empty</div>
        )}
    </div>
  )
}

export default FeatureSpecViewer
