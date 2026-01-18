import { useState, type JSX } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../UI'
import { FeatureDescription } from './FeatureDescription'
import { FeatureSpecViewer } from './FeatureSpecViewer'
import { FeatureChat } from '../Chat'
import './FeatureSidebar.css'

export interface FeatureSidebarProps {
  featureId: string
  onShowLogs?: () => void
  className?: string
}

type SidebarTab = 'description' | 'spec' | 'chat'

/**
 * Tabbed sidebar for feature details in DAG view.
 * Contains three tabs: Description, Spec, and Chat.
 */
export function FeatureSidebar({
  featureId,
  onShowLogs,
  className = ''
}: FeatureSidebarProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<SidebarTab>('chat')

  return (
    <div className={`feature-sidebar ${className}`}>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SidebarTab)}
        variant="underline"
        className="feature-sidebar__tabs"
      >
        <TabsList className="feature-sidebar__tabs-list">
          <TabsTrigger value="description" className="feature-sidebar__tab">
            Description
          </TabsTrigger>
          <TabsTrigger value="spec" className="feature-sidebar__tab">
            Spec
          </TabsTrigger>
          <TabsTrigger value="chat" className="feature-sidebar__tab">
            Chat
          </TabsTrigger>
        </TabsList>

        <TabsContent value="description" className="feature-sidebar__content">
          <FeatureDescription featureId={featureId} />
        </TabsContent>

        <TabsContent value="spec" className="feature-sidebar__content">
          <FeatureSpecViewer featureId={featureId} className="feature-sidebar__spec" />
        </TabsContent>

        <TabsContent value="chat" className="feature-sidebar__content">
          <FeatureChat featureId={featureId} onShowLogs={onShowLogs} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default FeatureSidebar
