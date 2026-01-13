import type { JSX } from 'react'
import type { Feature, FeatureStatus } from '@shared/types'

interface FeatureTabsProps {
  features: Feature[]
  activeFeatureId: string | null
  onSelectFeature: (featureId: string) => void
}

const statusBorderColors: Record<FeatureStatus, string> = {
  not_started: 'border-l-gray-500',
  in_progress: 'border-l-blue-500',
  needs_attention: 'border-l-yellow-500',
  completed: 'border-l-green-500'
}

export function FeatureTabs({
  features,
  activeFeatureId,
  onSelectFeature
}: FeatureTabsProps): JSX.Element {
  if (features.length === 0) {
    return (
      <div className="px-4 py-2 text-sm text-gray-400">
        No features yet. Create one to get started.
      </div>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 px-2">
      {features.map((feature) => (
        <button
          key={feature.id}
          onClick={() => onSelectFeature(feature.id)}
          className={`
            px-3 py-1.5 rounded-t text-sm whitespace-nowrap
            border-l-4 ${statusBorderColors[feature.status]}
            ${
              feature.id === activeFeatureId
                ? 'bg-gray-700 ring-1 ring-gray-600'
                : 'bg-gray-800 hover:bg-gray-700'
            }
            text-white transition-colors
          `}
        >
          {feature.name}
        </button>
      ))}
    </div>
  )
}
