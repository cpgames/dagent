import type { JSX } from 'react'
import { useProjectStore } from '../../stores/project-store'
import { UnifiedChatPanel } from './UnifiedChatPanel'

interface FeatureChatProps {
  featureId: string
  onShowLogs?: () => void  // TODO: Add logs button to UnifiedChatPanel if needed
}

export function FeatureChat({ featureId }: FeatureChatProps): JSX.Element {
  const projectPath = useProjectStore((state) => state.projectPath)

  // Generate session ID for this feature
  // Format: "{agentType}-{type}-{featureId}" = "feature-feature-{featureId}"
  const sessionId = `feature-feature-${featureId}`

  if (!projectPath) {
    return (
      <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>
        No project selected
      </div>
    )
  }

  return (
    <UnifiedChatPanel
      sessionId={sessionId}
      chatType="feature"
      projectRoot={projectPath}
      featureId={featureId}
      placeholder="Ask about this feature..."
      className="h-full"
    />
  )
}
