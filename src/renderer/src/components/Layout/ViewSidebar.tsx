import type { JSX } from 'react'
import { useViewStore, type ViewType } from '../../stores'
import './ViewSidebar.css'

/**
 * Icon for Kanban view - grid/board layout
 */
function KanbanIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
      />
    </svg>
  )
}

/**
 * Icon for DAG view - nodes connected by edges
 */
function DAGIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {/* Three nodes connected: top-left -> top-right, top-left -> bottom */}
      <circle cx="6" cy="6" r="2.5" strokeWidth={2} />
      <circle cx="18" cy="6" r="2.5" strokeWidth={2} />
      <circle cx="12" cy="18" r="2.5" strokeWidth={2} />
      {/* Edges */}
      <path strokeLinecap="round" strokeWidth={2} d="M8.5 6h7M7.5 8l3.5 8M16.5 8l-3.5 8" />
    </svg>
  )
}

/**
 * Icon for Context view - document
 */
function ContextIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  )
}

/**
 * Icon for Agents view - team/users representing AI agents
 */
function AgentsIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
      />
    </svg>
  )
}

/**
 * Icon for Worktrees view - git branches/folders representing worktree pools
 */
function WorktreesIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {/* Git-style branching icon */}
      <circle cx="6" cy="6" r="2" strokeWidth={2} />
      <circle cx="18" cy="12" r="2" strokeWidth={2} />
      <circle cx="6" cy="18" r="2" strokeWidth={2} />
      <path strokeLinecap="round" strokeWidth={2} d="M6 8v8M8 6h6a2 2 0 012 2v2" />
    </svg>
  )
}

/**
 * View configuration for sidebar
 */
const views: { id: ViewType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'kanban', label: 'Kanban', Icon: KanbanIcon },
  { id: 'dag', label: 'DAG', Icon: DAGIcon },
  { id: 'context', label: 'Context', Icon: ContextIcon },
  { id: 'agents', label: 'Agents', Icon: AgentsIcon },
  { id: 'worktrees', label: 'Worktrees', Icon: WorktreesIcon }
]

/**
 * Vertical sidebar for switching between views.
 * Shows icons for Kanban, DAG, Context, and Agents views with active indicator.
 */
export function ViewSidebar(): JSX.Element {
  const { activeView, requestViewChange } = useViewStore()

  return (
    <aside className="view-sidebar">
      {views.map(({ id, label, Icon }) => {
        const isActive = activeView === id
        return (
          <button
            key={id}
            onClick={() => requestViewChange(id)}
            title={label}
            className={`view-sidebar__button ${isActive ? 'view-sidebar__button--active' : ''}`}
          >
            {/* Active indicator - right edge glow */}
            {isActive && <span className="view-sidebar__indicator" />}
            <Icon className="view-sidebar__icon" />
          </button>
        )
      })}
    </aside>
  )
}
