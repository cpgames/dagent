import type { JSX } from 'react'
import type { Feature } from '@shared/types'
import './FeatureTabs.css'

interface FeatureTabsProps {
  features: Feature[]
  activeFeatureId: string | null
  onSelectFeature: (featureId: string) => void
}

// Status display config
const STATUS_LABELS: Record<string, string> = {
  backlog: 'BACKLOG',
  active: 'ACTIVE',
  merging: 'MERGING',
  archived: 'ARCHIVED'
}

export function FeatureTabs({
  features,
  activeFeatureId,
  onSelectFeature
}: FeatureTabsProps): JSX.Element {
  if (features.length === 0) {
    return <div className="feature-tabs__empty">No features yet. Create one to get started.</div>
  }

  return (
    <div className="feature-tabs">
      {features.map((feature) => {
        const isActive = feature.id === activeFeatureId
        const tabClasses = [
          'feature-tabs__tab',
          `feature-tabs__tab--${feature.status}`,
          isActive ? 'feature-tabs__tab--selected' : ''
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <button
            key={feature.id}
            onClick={() => onSelectFeature(feature.id)}
            className={tabClasses}
          >
            <span className="feature-tabs__name">{feature.name}</span>
            <span className={`feature-tabs__status feature-tabs__status--${feature.status}`}>
              {STATUS_LABELS[feature.status] || feature.status.toUpperCase()}
            </span>
          </button>
        )
      })}
    </div>
  )
}
