import type { JSX } from 'react'
import type { FeatureStatus } from '@shared/types/feature'
import { useExecutionStore } from '../../stores/execution-store'
import { useDAGStore } from '../../stores/dag-store'
import { useFeatureStore } from '../../stores/feature-store'
import './ExecutionControls.css'

interface ExecutionControlsProps {
  featureId: string | null
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  onPlan?: () => void
  isPlanningInProgress?: boolean
}

// Play icon SVG
const PlayIcon = (): JSX.Element => (
  <svg className="execution-controls__btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
)

// Pause icon SVG
const PauseIcon = (): JSX.Element => (
  <svg className="execution-controls__btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
)

// Stop icon SVG
const StopIcon = (): JSX.Element => (
  <svg className="execution-controls__btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
    />
  </svg>
)

// Undo icon SVG
const UndoIcon = ({ spinning = false }: { spinning?: boolean }): JSX.Element => (
  <svg
    className={`execution-controls__btn-icon ${spinning ? 'execution-controls__btn-icon--spinning' : ''}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
    />
  </svg>
)

// Redo icon SVG
const RedoIcon = ({ spinning = false }: { spinning?: boolean }): JSX.Element => (
  <svg
    className={`execution-controls__btn-icon ${spinning ? 'execution-controls__btn-icon--spinning' : ''}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
    />
  </svg>
)

// Plan icon SVG (clipboard with checklist)
const PlanIcon = (): JSX.Element => (
  <svg className="execution-controls__btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
    />
  </svg>
)

// Spinner icon SVG
const SpinnerIcon = (): JSX.Element => (
  <svg className="execution-controls__btn-icon execution-controls__btn-icon--spinning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
)

// Start button state configuration
interface StartButtonState {
  disabled: boolean
  tooltip: string
}

function getStartButtonState(
  featureStatus: FeatureStatus | undefined,
  isRunning: boolean,
  isPaused: boolean,
  _isPlanningInProgress: boolean
): StartButtonState {
  // Feature status checks
  if (featureStatus === 'backlog') {
    return { disabled: true, tooltip: 'Start feature first to enable execution' }
  }
  if (featureStatus === 'merging') {
    return { disabled: true, tooltip: 'All tasks done - merge or archive' }
  }
  if (featureStatus === 'archived') {
    return { disabled: true, tooltip: 'Feature archived' }
  }
  // Running/paused states
  if (isRunning) {
    return { disabled: false, tooltip: 'Pause execution' }
  }
  if (isPaused) {
    return { disabled: false, tooltip: 'Resume auto execution' }
  }
  // Default: ready to start (active status)
  return { disabled: false, tooltip: 'Start auto execution (runs all ready tasks)' }
}

export default function ExecutionControls({
  featureId,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onPlan,
  isPlanningInProgress = false
}: ExecutionControlsProps): JSX.Element {
  const { execution, isLoading, start, pause, resume, stop } = useExecutionStore()
  const { isUndoing, isRedoing } = useDAGStore()
  const { features } = useFeatureStore()
  const { status } = execution

  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isIdle = status === 'idle' || status === 'completed'

  // Get feature status to check if planning is in progress
  const feature = featureId ? features.find((f) => f.id === featureId) : null
  const featureStatus = feature?.status

  // Show Plan button for active features (simplified 4-state model)
  const showPlanButton = featureStatus === 'active'

  // Get Start button state based on feature status and other conditions
  const startButtonState = getStartButtonState(featureStatus, isRunning, isPaused, isPlanningInProgress)

  const handlePlayPause = async (): Promise<void> => {
    if (isRunning) {
      await pause()
    } else if (isPaused) {
      await resume()
    } else if (featureId) {
      await start(featureId)
    }
  }

  const handleStop = async (): Promise<void> => {
    await stop()
  }

  const getButtonClass = (isActive: boolean): string => {
    return `execution-controls__btn ${isActive ? 'execution-controls__btn--active' : 'execution-controls__btn--disabled'}`
  }

  const getStatusDotClass = (): string => {
    if (isRunning) return 'execution-controls__status-dot execution-controls__status-dot--running'
    if (isPaused) return 'execution-controls__status-dot execution-controls__status-dot--paused'
    return 'execution-controls__status-dot execution-controls__status-dot--idle'
  }

  return (
    <div className="execution-controls">
      {/* Plan button - shown when feature is active */}
      {showPlanButton && (
        <button
          onClick={onPlan}
          disabled={isPlanningInProgress || !featureId}
          className={`execution-controls__btn execution-controls__btn--plan ${isPlanningInProgress ? 'execution-controls__btn--planning' : ''}`}
          title={isPlanningInProgress ? 'Planning in progress...' : 'Start creating tasks from spec'}
        >
          {isPlanningInProgress ? <SpinnerIcon /> : <PlanIcon />}
          {isPlanningInProgress ? 'Planning...' : 'Plan'}
        </button>
      )}

      {/* Play/Pause button - Start All begins auto execution of all ready tasks */}
      <button
        onClick={handlePlayPause}
        disabled={isLoading || !featureId || startButtonState.disabled}
        className={getButtonClass(!isLoading && !!featureId && !startButtonState.disabled)}
        title={startButtonState.tooltip}
      >
        {isRunning ? <PauseIcon /> : <PlayIcon />}
        {isRunning ? 'Pause' : isPaused ? 'Resume' : 'Start All'}
      </button>

      {/* Stop button */}
      <button
        onClick={handleStop}
        disabled={isLoading || isIdle}
        className={getButtonClass(!isLoading && !isIdle)}
        title="Stop execution"
      >
        <StopIcon />
        Stop
      </button>

      <div className="execution-controls__divider" />

      {/* Undo button */}
      <button
        onClick={onUndo}
        disabled={!canUndo || isUndoing}
        className={getButtonClass(canUndo && !isUndoing)}
        title="Undo"
      >
        <UndoIcon spinning={isUndoing} />
        Undo
      </button>

      {/* Redo button */}
      <button
        onClick={onRedo}
        disabled={!canRedo || isRedoing}
        className={getButtonClass(canRedo && !isRedoing)}
        title="Redo"
      >
        <RedoIcon spinning={isRedoing} />
        Redo
      </button>

      {/* Status indicator */}
      {!isIdle && (
        <div className="execution-controls__status">
          <span className={getStatusDotClass()} />
          <span className="execution-controls__status-text">
            {isRunning ? 'Running...' : isPaused ? 'Paused' : status}
          </span>
        </div>
      )}
    </div>
  )
}
