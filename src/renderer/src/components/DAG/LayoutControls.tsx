import type { JSX } from 'react'
import './LayoutControls.css'

interface LayoutControlsProps {
  featureId: string | null
  onResetLayout: () => void
  onNewTask: () => void
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

// Refresh/Reset icon SVG (arrow-path)
const ResetIcon = (): JSX.Element => (
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
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
)

/**
 * LayoutControls - Controls for DAG layout management
 * Provides new task and reset layout buttons
 */
export default function LayoutControls({
  featureId,
  onResetLayout,
  onNewTask
}: LayoutControlsProps): JSX.Element {
  const isDisabled = !featureId

  return (
    <div className="layout-controls">
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
      <button
        onClick={onResetLayout}
        disabled={isDisabled}
        className={`layout-controls__btn ${
          isDisabled ? 'layout-controls__btn--disabled' : 'layout-controls__btn--active'
        }`}
        title="Reset to auto-calculated positions"
      >
        <ResetIcon />
        Reset Layout
      </button>
    </div>
  )
}
