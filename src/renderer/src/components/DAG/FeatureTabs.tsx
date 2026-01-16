import type { JSX } from 'react'
import type { Feature } from '@shared/types'
import './FeatureTabs.css'

interface FeatureTabsProps {
  features: Feature[]
  activeFeatureId: string | null
  onSelectFeature: (featureId: string) => void
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
        const tabClasses = [
          'feature-tabs__tab',
          `feature-tabs__tab--${feature.status}`,
          feature.id === activeFeatureId ? 'feature-tabs__tab--active' : ''
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <button
            key={feature.id}
            onClick={() => onSelectFeature(feature.id)}
            className={tabClasses}
          >
            {feature.name}
          </button>
        )
      })}
    </div>
  )
}
