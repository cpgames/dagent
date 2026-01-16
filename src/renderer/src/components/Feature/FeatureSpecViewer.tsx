import { useState, useEffect, useCallback, type JSX } from 'react'
import type { FeatureSpec } from '../../../../main/agents/feature-spec-types'

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
    <div className="border-b border-gray-700 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700/50 transition-colors"
      >
        <span className="text-sm font-medium text-gray-300">{title}</span>
        <div className="flex items-center gap-2">
          {count !== undefined && (
            <span className="text-xs text-gray-500">{count}</span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isOpen && <div className="px-3 pb-2">{children}</div>}
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

  // Poll for updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(loadSpec, 5000)
    return () => clearInterval(interval)
  }, [loadSpec])

  const toggleSection = (section: string): void => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  // Don't render anything if no spec exists
  if (loading) {
    return (
      <div className={`bg-gray-800 rounded-lg border border-gray-700 ${className}`}>
        <div className="px-3 py-2 text-xs text-gray-500">Loading spec...</div>
      </div>
    )
  }

  if (!spec) {
    return null
  }

  const completedReqs = spec.requirements.filter((r) => r.completed).length
  const passedCriteria = spec.acceptanceCriteria.filter((c) => c.passed).length

  return (
    <div className={`bg-gray-800 rounded-lg border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-blue-400"
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
          <span className="text-sm font-medium text-white">Feature Spec</span>
        </div>
        <div className="text-xs text-gray-500 mt-1 truncate">{spec.featureName}</div>
      </div>

      {/* Goals Section */}
      {spec.goals.length > 0 && (
        <CollapsibleSection
          title="Goals"
          isOpen={openSections.goals}
          onToggle={() => toggleSection('goals')}
          count={spec.goals.length}
        >
          <ul className="space-y-1">
            {spec.goals.map((goal, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-gray-300">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>{goal}</span>
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
          <div className="space-y-1">
            <div className="text-xs text-gray-500 mb-1">
              {completedReqs}/{spec.requirements.length} complete
            </div>
            {spec.requirements.map((req) => (
              <div key={req.id} className="flex items-start gap-2 text-xs">
                <span className={req.completed ? 'text-green-400' : 'text-gray-500'}>
                  {req.completed ? '✓' : '○'}
                </span>
                <span className={req.completed ? 'text-gray-400 line-through' : 'text-gray-300'}>
                  {req.description}
                </span>
              </div>
            ))}
          </div>
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
          <ul className="space-y-1">
            {spec.constraints.map((constraint, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-gray-300">
                <span className="text-yellow-400 mt-0.5">!</span>
                <span>{constraint}</span>
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
          <div className="space-y-1">
            <div className="text-xs text-gray-500 mb-1">
              {passedCriteria}/{spec.acceptanceCriteria.length} passed
            </div>
            {spec.acceptanceCriteria.map((criterion) => (
              <div key={criterion.id} className="flex items-start gap-2 text-xs">
                <span className={criterion.passed ? 'text-green-400' : 'text-gray-500'}>
                  {criterion.passed ? '✓' : '○'}
                </span>
                <span className={criterion.passed ? 'text-gray-400' : 'text-gray-300'}>
                  {criterion.description}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Empty state if spec has no content */}
      {spec.goals.length === 0 &&
        spec.requirements.length === 0 &&
        spec.constraints.length === 0 &&
        spec.acceptanceCriteria.length === 0 && (
          <div className="px-3 py-2 text-xs text-gray-500">Spec is empty</div>
        )}
    </div>
  )
}

export default FeatureSpecViewer
