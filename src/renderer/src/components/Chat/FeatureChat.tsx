import type { JSX } from 'react'
import { ChatPanel } from './ChatPanel'

interface FeatureChatProps {
  featureId: string
  onShowLogs?: () => void
}

export function FeatureChat({ featureId, onShowLogs }: FeatureChatProps): JSX.Element {
  return (
    <ChatPanel
      contextId={featureId}
      contextType="feature"
      onShowLogs={onShowLogs}
      className="h-full"
    />
  )
}
