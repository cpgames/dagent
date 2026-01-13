import type { JSX } from 'react'
import { useViewStore, type ViewType } from '../../stores'

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
 * View configuration for sidebar
 */
const views: { id: ViewType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'kanban', label: 'Kanban', Icon: KanbanIcon },
  { id: 'dag', label: 'DAG', Icon: DAGIcon },
  { id: 'context', label: 'Context', Icon: ContextIcon }
]

/**
 * Vertical sidebar for switching between views.
 * Shows icons for Kanban, DAG, and Context views with active indicator.
 */
export function ViewSidebar(): JSX.Element {
  const { activeView, requestViewChange } = useViewStore()

  return (
    <aside className="w-12 bg-gray-800 border-r border-gray-700 flex flex-col items-center py-2 gap-1">
      {views.map(({ id, label, Icon }) => {
        const isActive = activeView === id
        return (
          <button
            key={id}
            onClick={() => requestViewChange(id)}
            title={label}
            className={`
              w-10 h-10 flex items-center justify-center rounded-md transition-colors relative
              ${isActive
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:bg-gray-700 hover:text-white'}
            `}
          >
            {/* Active indicator - right border */}
            {isActive && (
              <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-500 rounded-l" />
            )}
            <Icon className="w-5 h-5" />
          </button>
        )
      })}
    </aside>
  )
}
