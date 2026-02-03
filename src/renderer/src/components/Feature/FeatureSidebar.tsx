import { useState, useEffect, type JSX } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../UI'
import { FeatureDescription } from './FeatureDescription'
import { FeatureSpecViewer } from './FeatureSpecViewer'
import { FeatureChat } from '../Chat'
import { TaskDetailsPanel } from '../DAG/TaskDetailsPanel'
import type { Task, DevAgentSession } from '@shared/types'
import './FeatureSidebar.css'

export interface FeatureSidebarProps {
  featureId: string
  worktreePath?: string
  onShowLogs?: () => void
  className?: string
  dockPosition?: 'left' | 'right'
  onToggleDock?: () => void
  // Task details props
  selectedTask?: Task | null
  taskSession?: DevAgentSession | null
  onAbortLoop?: (taskId: string) => void
  onClearLogs?: (taskId: string) => void
}

type SidebarTab = 'description' | 'spec' | 'chat' | 'task'

// Dock toggle icon
const DockIcon = ({ position }: { position: 'left' | 'right' }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transform: position === 'left' ? 'scaleX(-1)' : 'none' }}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </svg>
)

/**
 * Tabbed sidebar for feature details in DAG view.
 * Contains tabs: Description, Spec, Chat, and Task (when selected).
 */
export function FeatureSidebar({
  featureId,
  worktreePath,
  onShowLogs,
  className = '',
  dockPosition = 'right',
  onToggleDock,
  selectedTask,
  taskSession,
  onAbortLoop,
  onClearLogs
}: FeatureSidebarProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<SidebarTab>('chat')

  // Auto-switch to task tab when a task is selected
  useEffect(() => {
    if (selectedTask) {
      setActiveTab('task')
    }
  }, [selectedTask])

  return (
    <div className={`feature-sidebar ${className}`}>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SidebarTab)}
        variant="underline"
        className="feature-sidebar__tabs"
      >
        <TabsList className="feature-sidebar__tabs-list">
          {/* Dock toggle button */}
          {onToggleDock && (
            <button
              onClick={onToggleDock}
              className="feature-sidebar__dock-btn"
              title={`Move panel to ${dockPosition === 'left' ? 'right' : 'left'}`}
            >
              <DockIcon position={dockPosition} />
            </button>
          )}
          <TabsTrigger value="description" className="feature-sidebar__tab">
            Description
          </TabsTrigger>
          <TabsTrigger value="spec" className="feature-sidebar__tab">
            Spec
          </TabsTrigger>
          <TabsTrigger value="chat" className="feature-sidebar__tab">
            Chat
          </TabsTrigger>
          {selectedTask && (
            <TabsTrigger value="task" className="feature-sidebar__tab feature-sidebar__tab--task">
              Task
            </TabsTrigger>
          )}
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

        {selectedTask && (
          <TabsContent value="task" className="feature-sidebar__content">
            <TaskDetailsPanel
              task={selectedTask}
              session={taskSession}
              worktreePath={worktreePath}
              onAbortLoop={onAbortLoop}
              onClearLogs={onClearLogs}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

export default FeatureSidebar
