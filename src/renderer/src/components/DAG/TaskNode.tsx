import { memo, type JSX } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Task, TaskStatus } from '@shared/types'
import type { TaskLoopStatus } from '../../../../main/dag-engine/orchestrator-types'
import './TaskNode.css'

export interface TaskNodeData extends Record<string, unknown> {
  task: Task
  loopStatus?: TaskLoopStatus | null
  isBeingAnalyzed?: boolean
  onEdit: (taskId: string) => void
  onDelete: (taskId: string) => void
  onLog: (taskId: string) => void
  onReanalyze: (taskId: string) => void
}

// Status badge configuration - all statuses get badges now
const statusBadgeConfig: Record<TaskStatus, { label: string; cssClass: string }> = {
  needs_analysis: { label: 'NEEDS ANALYSIS', cssClass: 'task-node__badge--needs-analysis' },
  blocked: { label: 'BLOCKED', cssClass: 'task-node__badge--blocked' },
  ready_for_dev: { label: 'READY FOR DEV', cssClass: 'task-node__badge--ready' },
  in_progress: { label: 'DEV', cssClass: 'task-node__badge--dev' },
  ready_for_qa: { label: 'QA', cssClass: 'task-node__badge--qa' },
  ready_for_merge: { label: 'MERGE', cssClass: 'task-node__badge--merge' },
  completed: { label: 'COMPLETED', cssClass: 'task-node__badge--completed' },
  failed: { label: 'FAILED', cssClass: 'task-node__badge--failed' }
}

function TaskNodeComponent({ data, selected }: NodeProps): JSX.Element {
  const nodeData = data as TaskNodeData
  // loopStatus kept in data for NodeDialog/debugging, but not rendered on TaskNode
  const { task, loopStatus: _loopStatus, isBeingAnalyzed, onEdit, onDelete, onLog, onReanalyze } = nodeData

  // Can reanalyze if task is ready_for_dev, blocked, or failed (not in progress or completed)
  const canReanalyze = ['ready_for_dev', 'blocked', 'failed'].includes(task.status)

  const nodeClasses = [
    'task-node',
    `task-node--${task.status}`,
    selected ? 'task-node--selected' : '',
    isBeingAnalyzed ? 'task-node--analyzing' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const badgeConfig = statusBadgeConfig[task.status]

  return (
    <div className={nodeClasses}>
      {/* Target handle (top) - input from dependencies */}
      <Handle type="target" position={Position.Top} className="task-node__handle" />

      {/* Status Badge */}
      <div className="task-node__badge-section">
        <span
          className={`task-node__badge ${badgeConfig.cssClass}`}
          title={
            task.status === 'needs_analysis'
              ? 'This task needs complexity analysis'
              : `Status: ${badgeConfig.label}${task.assignedAgentId ? `\nAgent: ${task.assignedAgentId}` : ''}`
          }
        >
          {badgeConfig.label}
        </span>
      </div>

      {/* Title - multiline, no ellipsis */}
      <div className="task-node__body">
        {task.locked && (
          <svg
            className="task-node__lock-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        )}
        <h3 className="task-node__title">{task.title}</h3>
      </div>

      {/* Status indicator - below title */}
      {isBeingAnalyzed && (
        <div className="task-node__status-indicator">
          <div className="task-node__status-spinner" />
          <span>Analyzing...</span>
        </div>
      )}
      {!isBeingAnalyzed && task.status === 'in_progress' && (
        <div className="task-node__status-indicator">
          <div className="task-node__status-spinner" />
          <span>Developing...</span>
        </div>
      )}
      {!isBeingAnalyzed && task.status === 'ready_for_qa' && (
        <div className="task-node__status-indicator">
          <div className="task-node__status-spinner" />
          <span>Testing...</span>
        </div>
      )}
      {!isBeingAnalyzed && task.status === 'ready_for_merge' && (
        <div className="task-node__status-indicator">
          <div className="task-node__status-spinner" />
          <span>Merging...</span>
        </div>
      )}

      {/* Error message for failed tasks */}
      {task.status === 'failed' && task.errorMessage && (
        <div className="task-node__error-indicator" title={task.errorMessage}>
          <svg
            className="task-node__error-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="task-node__error-text">
            {task.errorMessage.length > 50
              ? `${task.errorMessage.slice(0, 50)}...`
              : task.errorMessage}
          </span>
        </div>
      )}

      {/* Action buttons - absolute positioned, show on hover */}
      <div className="task-node__actions">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit(task.id)
          }}
          className="task-node__action-btn"
          title="Edit task"
        >
          <svg
            className="task-node__action-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onLog(task.id)
          }}
          className="task-node__action-btn"
          title="View agent logs for this task"
        >
          <svg
            className="task-node__action-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </button>
        {canReanalyze && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onReanalyze(task.id)
            }}
            className="task-node__action-btn task-node__action-btn--reanalyze"
            title="Re-analyze task"
          >
            <svg
              className="task-node__action-icon"
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
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(task.id)
          }}
          className="task-node__action-btn task-node__action-btn--delete"
          title="Delete task"
        >
          <svg
            className="task-node__action-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* Source handle (bottom) - output to dependents */}
      <Handle type="source" position={Position.Bottom} className="task-node__handle" />
    </div>
  )
}

export const TaskNode = memo(TaskNodeComponent)
