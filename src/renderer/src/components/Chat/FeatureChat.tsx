import type { JSX } from 'react'
import { ChatPanel } from './ChatPanel'

interface FeatureChatProps {
  featureId: string
}

export function FeatureChat({ featureId }: FeatureChatProps): JSX.Element {
  return (
    <ChatPanel
      agentName="Feature Chat"
      contextId={featureId}
      contextType="feature"
      className="h-full"
    />
  )
}
