import { useState, type JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Task, DevAgentSession } from '@shared/types'
import { getTaskStatusLabel } from '@shared/types/task'
import { DiffDialog } from './DiffDialog'
import './TaskDetailsPanel.css'

export interface TaskDetailsPanelProps {
  task: Task | null
  session?: DevAgentSession | null
  canStartTask?: boolean
  worktreePath?: string
  onAbortLoop?: (taskId: string) => void
  onStartTask?: (taskId: string) => void
  onDeleteTask?: (taskId: string) => void
  onClearLogs?: (taskId: string) => void
  onAbortTask?: (taskId: string) => void
}

export function TaskDetailsPanel({
  task,
  session,
  canStartTask,
  worktreePath,
  onAbortLoop,
  onStartTask,
  onDeleteTask,
  onClearLogs,
  onAbortTask
}: TaskDetailsPanelProps): JSX.Element | null {
  const [showDiffDialog, setShowDiffDialog] = useState(false)
  const [showAbortConfirm, setShowAbortConfirm] = useState(false)

  if (!task) return null

  const handleCommitClick = (): void => {
    if (!task.commitHash) return
    setShowDiffDialog(true)
  }

  return (
    <div className="task-details">
      {/* Header with title and actions */}
      <div className="task-details__header">
        <div className="task-details__title-row">
          <h3 className="task-details__title-display">{task.title}</h3>
          <span className={`task-details__status-badge ${task.blocked ? 'task-details__status-badge--blocked' : task.isPaused ? 'task-details__status-badge--paused' : `task-details__status-badge--${task.status}`}`}>
            {task.blocked ? 'Blocked' : task.isPaused ? 'Paused' : getTaskStatusLabel(task.status)}
          </span>
        </div>
        {task.status === 'done' && task.commitHash && (
          <div className="task-details__commit-row">
            <span className="task-details__commit-label">Commit:</span>
            <button
              type="button"
              className="task-details__commit-hash"
              onClick={handleCommitClick}
              title="Click to view diff"
            >
              {task.commitHash.slice(0, 7)}
            </button>
          </div>
        )}
        {task.isPaused && task.stashId && (
          <div className="task-details__stash-row">
            <span className="task-details__stash-label">Stash:</span>
            <span className="task-details__stash-badge" title="Changes stashed when task was paused">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="12" height="12">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              Saved
            </span>
          </div>
        )}
        <div className="task-details__actions">
          {canStartTask && task.status === 'ready' && !task.blocked && onStartTask && (
            <button
              type="button"
              onClick={() => onStartTask(task.id)}
              className="task-details__action-btn task-details__action-btn--start"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Start Task
            </button>
          )}
          {task.isPaused && onStartTask && (
            <button
              type="button"
              onClick={() => onStartTask(task.id)}
              className="task-details__action-btn task-details__action-btn--start"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Resume
            </button>
          )}
          {task.isPaused && onAbortTask && (
            <button
              type="button"
              onClick={() => setShowAbortConfirm(true)}
              className="task-details__action-btn task-details__action-btn--abort"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Abort
            </button>
          )}
          {(task.status === 'developing' || task.status === 'verifying') && !task.isPaused && onAbortLoop && (
            <button
              type="button"
              onClick={() => onAbortLoop(task.id)}
              className="task-details__action-btn task-details__action-btn--pause"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pause
            </button>
          )}
          {onDeleteTask && (
            <button
              type="button"
              onClick={() => onDeleteTask(task.id)}
              className="task-details__action-btn task-details__action-btn--delete"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="task-details__body">
        <div className="task-details__spec-section">
          <div className="task-details__spec-header">
            <span className="task-details__label">Spec</span>
          </div>
          <div className="task-details__spec-content">
            {task.spec ? (
              <ReactMarkdown>{task.spec}</ReactMarkdown>
            ) : (
              <span className="task-details__spec-empty">No spec available</span>
            )}
          </div>
        </div>

        {/* Logs section - single unified view */}
        <div className="task-details__logs-section">
          <div className="task-details__logs-header">
            <span className="task-details__logs-label">Agent Logs</span>
            {onClearLogs && session?.messages && session.messages.length > 0 && (
              <button
                type="button"
                onClick={() => onClearLogs(task.id)}
                className="task-details__clear-logs-btn"
                title="Clear all logs"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear
              </button>
            )}
          </div>
          <div className="task-details__logs-content">
            {session?.messages && session.messages.length > 0 ? (
              <pre className="task-details__logs-text">
                {session.messages.map((msg, idx) => {
                  const isQa = msg.content.startsWith('[QA]')
                  const isPaused = msg.content.startsWith('[PAUSED]')
                  const isResumed = msg.content.startsWith('[RESUMED]')
                  const isSystem = isPaused || isResumed
                  const agentLabel = isSystem ? '[System]' : isQa ? '[QAAgent]' : '[DevAgent]'
                  const agentClass = isSystem ? 'task-details__log-system' : isQa ? 'task-details__log-qa' : 'task-details__log-dev'
                  const content = isQa ? msg.content.replace(/^\[QA\]\s*/, '') : msg.content
                  // Format timestamp as HH:MM:SS
                  const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false }) : ''
                  return (
                    <span key={idx}>
                      <span className="task-details__log-timestamp">[{timestamp}]</span>
                      {' '}
                      <span className={agentClass}>{agentLabel}</span>
                      {': '}
                      <span className="task-details__log-content">{content}</span>
                      {'\n'}
                    </span>
                  )
                })}
              </pre>
            ) : (
              <div className="task-details__logs-empty">No logs available</div>
            )}
          </div>
        </div>
      </div>

      {/* Diff Dialog */}
      {showDiffDialog && task.commitHash && (
        <DiffDialog
          commitHash={task.commitHash}
          worktreePath={worktreePath}
          onClose={() => setShowDiffDialog(false)}
        />
      )}

      {/* Abort Confirmation Dialog */}
      {showAbortConfirm && (
        <div className="task-details__confirm-overlay">
          <div className="task-details__confirm-dialog">
            <h4 className="task-details__confirm-title">Abort Task?</h4>
            <p className="task-details__confirm-message">
              This will discard all changes made by this task and reset it to Ready status.
              This action cannot be undone.
            </p>
            <div className="task-details__confirm-actions">
              <button
                type="button"
                className="task-details__confirm-btn task-details__confirm-btn--cancel"
                onClick={() => setShowAbortConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="task-details__confirm-btn task-details__confirm-btn--confirm"
                onClick={() => {
                  setShowAbortConfirm(false)
                  onAbortTask?.(task.id)
                }}
              >
                Abort Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
