import { memo, type JSX } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Task, TaskStatus } from '@shared/types'
import type { TaskLoopStatus } from '../../../../main/dag-engine/orchestrator-types'
import { getTaskStatusLabel } from '@shared/types/task'
import './TaskNode.css'

export interface TaskNodeData extends Record<string, unknown> {
  task: Task
  loopStatus?: TaskLoopStatus | null
  onEdit: (taskId: string) => void
  onDelete: (taskId: string) => void
  onLog: (taskId: string) => void
}

// State badge configuration for active execution states
const stateBadgeConfig: Partial<Record<TaskStatus, { label: string; cssClass: string }>> = {
  in_progress: { label: 'DEV', cssClass: 'task-node__badge--dev' },
  ready_for_qa: { label: 'QA', cssClass: 'task-node__badge--qa' },
  ready_for_merge: { label: 'MERGE', cssClass: 'task-node__badge--merge' },
  failed: { label: 'FAILED', cssClass: 'task-node__badge--failed' }
}

function TaskNodeComponent({ data, selected }: NodeProps): JSX.Element {
  const nodeData = data as TaskNodeData
  // loopStatus kept in data for NodeDialog/debugging, but not rendered on TaskNode
  const { task, loopStatus: _loopStatus, onEdit, onDelete, onLog } = nodeData

  const nodeClasses = [
    'task-node',
    `task-node--${task.status}`,
    selected ? 'task-node--selected' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={nodeClasses}>
      {/* Target handle (left) - input from dependencies */}
      <Handle type="target" position={Position.Left} className="task-node__handle" />

      {/* Header */}
      <div className="task-node__header">
        <div className="task-node__title">
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
          <span className="task-node__title-text">{task.title}</span>
        </div>
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
      </div>

      {/* Dynamic state badge - only shows for active execution states */}
      {stateBadgeConfig[task.status] && (
        <div className="task-node__badge-section">
          <span
            className={`task-node__badge ${stateBadgeConfig[task.status]!.cssClass}`}
            title={`State: ${stateBadgeConfig[task.status]!.label}${task.assignedAgentId ? `\nAgent: ${task.assignedAgentId}` : ''}`}
          >
            {stateBadgeConfig[task.status]!.label}
          </span>
        </div>
      )}

      {/* Status indicator */}
      <div className="task-node__status">
        <span className="task-node__status-text">{getTaskStatusLabel(task.status)}</span>
      </div>

      {/* Source handle (right) - output to dependents */}
      <Handle type="source" position={Position.Right} className="task-node__handle" />
    </div>
  )
}

export const TaskNode = memo(TaskNodeComponent)
