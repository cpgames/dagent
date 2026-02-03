import type { JSX } from 'react'
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

/**
 * LayoutControls - Controls for DAG layout management
 * Shows auto-layout button and new task button
 */
export default function LayoutControls({
  featureId,
  onNewTask,
  onAutoLayout
}: LayoutControlsProps): JSX.Element {
  const isDisabled = !featureId

  return (
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
  )
}
