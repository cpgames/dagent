import type { JSX } from 'react'
import './LayoutControls.css'

interface LayoutControlsProps {
  featureId: string | null
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

/**
 * LayoutControls - Controls for DAG layout management
 * Provides new task button
 */
export default function LayoutControls({
  featureId,
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
    </div>
  )
}
