import type { JSX } from 'react'
import { useFeatureStore } from '../../stores'
import type { FeatureStatus } from '@shared/types'
import './LayoutControls.css'

interface LayoutControlsProps {
  featureId: string | null
  onNewTask: () => void
  onAutoLayout: () => void
}

// Plus icon SVG
const PlusIcon = (): JSX.Element => (
  <svg
    className="layout-controls__btn-icon"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4v16m8-8H4"
    />
  </svg>
)

// Grid/Layout icon SVG
const LayoutIcon = (): JSX.Element => (
  <svg
    className="layout-controls__btn-icon"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
    />
  </svg>
)

// Status display configuration for state-based feature lifecycle
const statusConfig: Record<FeatureStatus, { label: string; className: string }> = {
  not_started: { label: 'Not Started', className: 'layout-controls__status--not-started' },
  creating_worktree: { label: 'Creating...', className: 'layout-controls__status--creating' },
  investigating: { label: 'Investigating', className: 'layout-controls__status--investigating' },
  ready_for_planning: { label: 'Ready to Plan', className: 'layout-controls__status--ready-for-planning' },
  planning: { label: 'Planning', className: 'layout-controls__status--planning' },
  ready: { label: 'Ready', className: 'layout-controls__status--ready' },
  developing: { label: 'Developing', className: 'layout-controls__status--developing' },
  verifying: { label: 'Verifying', className: 'layout-controls__status--verifying' },
  needs_merging: { label: 'Merge Pending', className: 'layout-controls__status--needs-merging' },
  merging: { label: 'Merging', className: 'layout-controls__status--merging' },
  archived: { label: 'Archived', className: 'layout-controls__status--archived' }
}

/**
 * LayoutControls - Controls for DAG layout management
 * Shows feature status indicator, auto-layout button, and new task button
 */
export default function LayoutControls({
  featureId,
  onNewTask,
  onAutoLayout
}: LayoutControlsProps): JSX.Element {
  const { features } = useFeatureStore()
  const feature = featureId ? features.find((f) => f.id === featureId) : null
  const isDisabled = !featureId

  const status = feature?.status
  const config = status ? statusConfig[status] : null

  return (
    <>
      {/* Feature status indicator - top left */}
      {config && (
        <div className={`layout-controls__status ${config.className}`}>
          {status === 'planning' && (
            <span className="layout-controls__status-spinner" />
          )}
          <span className="layout-controls__status-label">{config.label}</span>
        </div>
      )}

      {/* Control buttons - top right */}
      <div className="layout-controls">
        <button
          onClick={onAutoLayout}
          disabled={isDisabled}
          className={`layout-controls__btn ${
            isDisabled ? 'layout-controls__btn--disabled' : 'layout-controls__btn--active'
          }`}
          title="Auto-arrange tasks in tree layout"
        >
          <LayoutIcon />
          Layout
        </button>
        <button
          onClick={onNewTask}
          disabled={isDisabled}
          className={`layout-controls__btn ${
            isDisabled ? 'layout-controls__btn--disabled' : 'layout-controls__btn--active'
          }`}
          title="Ask PM agent to add a new task"
        >
          <PlusIcon />
          New
        </button>
      </div>
    </>
  )
}
