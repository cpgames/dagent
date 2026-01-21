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
  pendingAnalysisCount?: number
  isAnalyzing?: boolean
  onAnalyze?: () => void
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

// Analyze icon SVG (magnifying glass with graph)
const AnalyzeIcon = (): JSX.Element => (
  <svg className="execution-controls__btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
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

// Magnifying glass icon for investigating state
const MagnifyingGlassIcon = (): JSX.Element => (
  <svg className="execution-controls__state-badge-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
  </svg>
)

// Question mark icon for questioning state
const QuestionMarkIcon = (): JSX.Element => (
  <svg className="execution-controls__state-badge-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
)

// Chart icon for planning state
const ChartIcon = (): JSX.Element => (
  <svg className="execution-controls__state-badge-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    />
  </svg>
)

// Badge spinner icon for creating_worktree state
const BadgeSpinnerIcon = (): JSX.Element => (
  <svg className="execution-controls__state-badge-icon execution-controls__state-badge-icon--spinning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
)

// Planning phase badge configuration
interface BadgeConfig {
  label: string
  icon: () => JSX.Element
  modifier: string
}

function getPlanningPhaseBadge(status: FeatureStatus): BadgeConfig | null {
  switch (status) {
    case 'investigating':
      return { label: 'Investigating', icon: MagnifyingGlassIcon, modifier: 'investigating' }
    case 'questioning':
      return { label: 'Questions', icon: QuestionMarkIcon, modifier: 'questioning' }
    case 'planning':
      return { label: 'Planning', icon: ChartIcon, modifier: 'planning' }
    case 'creating_worktree':
      return { label: 'Setting up', icon: BadgeSpinnerIcon, modifier: 'creating_worktree' }
    default:
      return null
  }
}

// Start button state configuration
interface StartButtonState {
  disabled: boolean
  tooltip: string
}

function getStartButtonState(
  featureStatus: FeatureStatus | undefined,
  isAnalyzing: boolean,
  isRunning: boolean,
  isPaused: boolean
): StartButtonState {
  // Check planning phases first (higher priority)
  if (featureStatus === 'creating_worktree') {
    return { disabled: true, tooltip: 'Setting up worktree...' }
  }
  if (featureStatus === 'investigating') {
    return { disabled: true, tooltip: 'PM agent investigating codebase...' }
  }
  if (featureStatus === 'questioning') {
    return { disabled: true, tooltip: 'Answer PM agent questions first' }
  }
  if (featureStatus === 'planning') {
    return { disabled: true, tooltip: 'PM agent creating tasks...' }
  }
  // Check other states
  if (isAnalyzing) {
    return { disabled: true, tooltip: 'Analyzing tasks...' }
  }
  // Running/paused states
  if (isRunning) {
    return { disabled: false, tooltip: 'Pause execution' }
  }
  if (isPaused) {
    return { disabled: false, tooltip: 'Resume execution' }
  }
  // Default: ready to start
  return { disabled: false, tooltip: 'Start execution' }
}

export default function ExecutionControls({
  featureId,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  pendingAnalysisCount = 0,
  isAnalyzing = false,
  onAnalyze
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
  const planningBadge = featureStatus ? getPlanningPhaseBadge(featureStatus) : null
  const isInPlanningPhase = planningBadge !== null

  // Get Start button state based on feature status and other conditions
  const startButtonState = getStartButtonState(featureStatus, isAnalyzing, isRunning, isPaused)

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

  // Show analyze button when there are pending tasks or analysis is running
  const showAnalyzeButton = pendingAnalysisCount > 0 || isAnalyzing

  return (
    <div className="execution-controls">
      {/* Analyze Tasks button - shown when needs_analysis tasks exist */}
      {showAnalyzeButton && (
        <button
          onClick={onAnalyze}
          disabled={isAnalyzing || !featureId || isInPlanningPhase}
          className={`execution-controls__btn execution-controls__btn--analyze ${isAnalyzing ? 'execution-controls__btn--analyzing' : ''}`}
          title={
            isInPlanningPhase
              ? 'Wait for planning to complete'
              : isAnalyzing
                ? 'Analysis in progress...'
                : `Analyze ${pendingAnalysisCount} task${pendingAnalysisCount !== 1 ? 's' : ''}`
          }
        >
          {isAnalyzing ? <SpinnerIcon /> : <AnalyzeIcon />}
          {isAnalyzing ? 'Analyzing...' : `Analyze (${pendingAnalysisCount})`}
        </button>
      )}

      {/* Play/Pause button */}
      <button
        onClick={handlePlayPause}
        disabled={isLoading || !featureId || startButtonState.disabled}
        className={getButtonClass(!isLoading && !!featureId && !startButtonState.disabled)}
        title={startButtonState.tooltip}
      >
        {isRunning ? <PauseIcon /> : <PlayIcon />}
        {isRunning ? 'Pause' : isPaused ? 'Resume' : 'Start'}
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

      {/* Feature state badge for planning phases */}
      {planningBadge && (
        <div className={`execution-controls__state-badge execution-controls__state-badge--${planningBadge.modifier}`}>
          <planningBadge.icon />
          <span>{planningBadge.label}</span>
        </div>
      )}

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
