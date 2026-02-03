import { type JSX } from 'react'
import type { PanelId } from './DockablePanel'
import './PanelToolbar.css'

// Icons for each panel type
const ChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const SpecIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
)

const DescriptionIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="17" y1="10" x2="3" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="17" y1="18" x2="3" y2="18" />
  </svg>
)

const TaskIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
)

interface PanelToolbarProps {
  activePanels: PanelId[]
  onTogglePanel: (panelId: PanelId) => void
}

const PANEL_CONFIG: { id: PanelId; icon: () => JSX.Element; label: string }[] = [
  { id: 'chat', icon: ChatIcon, label: 'Chat' },
  { id: 'spec', icon: SpecIcon, label: 'Spec' },
  { id: 'description', icon: DescriptionIcon, label: 'Description' },
  { id: 'task', icon: TaskIcon, label: 'Task Editor' }
]

export function PanelToolbar({
  activePanels,
  onTogglePanel
}: PanelToolbarProps): JSX.Element {
  return (
    <div className="panel-toolbar">
      {PANEL_CONFIG.map(({ id, icon: Icon, label }) => {
        const isActive = activePanels.includes(id)

        return (
          <button
            key={id}
            className={`panel-toolbar__btn ${isActive ? 'panel-toolbar__btn--active' : ''}`}
            onClick={() => onTogglePanel(id)}
            title={isActive ? `Hide ${label}` : `Show ${label}`}
          >
            <Icon />
          </button>
        )
      })}
    </div>
  )
}

export default PanelToolbar
