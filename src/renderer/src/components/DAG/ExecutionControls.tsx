import type { JSX } from 'react'
import { useExecutionStore } from '../../stores/execution-store'
import { useDAGStore } from '../../stores/dag-store'

interface ExecutionControlsProps {
  featureId: string | null
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

// Play icon SVG
const PlayIcon = (): JSX.Element => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
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
    className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
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

export default function ExecutionControls({
  featureId,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false
}: ExecutionControlsProps): JSX.Element {
  const { execution, isLoading, start, pause, resume, stop } = useExecutionStore()
  const { isUndoing, isRedoing } = useDAGStore()
  const { status } = execution

  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isIdle = status === 'idle' || status === 'completed'

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

  const buttonBase = 'px-3 py-1.5 rounded text-sm flex items-center gap-1 transition-colors'
  const activeButton = 'bg-gray-700 hover:bg-gray-600 text-white'
  const disabledButton = 'bg-gray-700 text-gray-400 cursor-not-allowed'

  return (
    <div className="flex items-center gap-2">
      {/* Play/Pause button */}
      <button
        onClick={handlePlayPause}
        disabled={isLoading || !featureId}
        className={`${buttonBase} ${!isLoading && featureId ? activeButton : disabledButton}`}
        title={isRunning ? 'Pause execution' : isPaused ? 'Resume execution' : 'Start execution'}
      >
        {isRunning ? <PauseIcon /> : <PlayIcon />}
        {isRunning ? 'Pause' : isPaused ? 'Resume' : 'Play'}
      </button>

      {/* Stop button */}
      <button
        onClick={handleStop}
        disabled={isLoading || isIdle}
        className={`${buttonBase} ${!isLoading && !isIdle ? activeButton : disabledButton}`}
        title="Stop execution"
      >
        <StopIcon />
        Stop
      </button>

      <div className="border-l border-gray-600 mx-2 h-6" />

      {/* Undo button */}
      <button
        onClick={onUndo}
        disabled={!canUndo || isUndoing}
        className={`${buttonBase} ${canUndo && !isUndoing ? activeButton : disabledButton}`}
        title="Undo"
      >
        <UndoIcon spinning={isUndoing} />
        Undo
      </button>

      {/* Redo button */}
      <button
        onClick={onRedo}
        disabled={!canRedo || isRedoing}
        className={`${buttonBase} ${canRedo && !isRedoing ? activeButton : disabledButton}`}
        title="Redo"
      >
        <RedoIcon spinning={isRedoing} />
        Redo
      </button>

      {/* Status indicator */}
      {!isIdle && (
        <div className="ml-4 text-sm">
          <span
            className={`inline-block w-2 h-2 rounded-full mr-2 ${
              isRunning ? 'bg-yellow-500 animate-pulse' : isPaused ? 'bg-blue-500' : 'bg-gray-500'
            }`}
          />
          <span className="text-gray-400">
            {isRunning ? 'Running...' : isPaused ? 'Paused' : status}
          </span>
        </div>
      )}
    </div>
  )
}
