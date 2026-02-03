import { memo, useState, type JSX } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Task, TaskStatus } from '@shared/types'
import { DiffDialog } from './DiffDialog'
import './TaskNode.css'

export interface TaskNodeData extends Record<string, unknown> {
  task: Task
  isBeingAnalyzed?: boolean
  worktreePath?: string
}

// Status badge configuration
const statusBadgeConfig: Record<TaskStatus, { label: string; cssClass: string }> = {
  ready: { label: 'READY', cssClass: 'task-node__badge--ready' },
  analyzing: { label: 'ANALYZING', cssClass: 'task-node__badge--analyzing' },
  developing: { label: 'DEV', cssClass: 'task-node__badge--dev' },
  developing_paused: { label: 'PAUSED (DEV)', cssClass: 'task-node__badge--paused' },
  verifying: { label: 'QA', cssClass: 'task-node__badge--qa' },
  verifying_paused: { label: 'PAUSED (QA)', cssClass: 'task-node__badge--paused' },
  done: { label: 'DONE', cssClass: 'task-node__badge--completed' }
}

function TaskNodeComponent({ data, selected }: NodeProps): JSX.Element {
  const nodeData = data as TaskNodeData
  const { task, isBeingAnalyzed, worktreePath } = nodeData
  const [showDiffDialog, setShowDiffDialog] = useState(false)

  const handleCommitClick = (e: React.MouseEvent): void => {
    e.stopPropagation() // Prevent node selection
    if (!task.commitHash) return
    setShowDiffDialog(true)
  }

  const nodeClasses = [
    'task-node',
    `task-node--${task.status}`,
    selected ? 'task-node--selected' : '',
    isBeingAnalyzed ? 'task-node--analyzing' : ''
  ]
    .filter(Boolean)
    .join(' ')

  // Status badge - always show the actual status
  const statusConfig = statusBadgeConfig[task.status]

  return (
    <div className={nodeClasses}>
      {/* Target handle (top) - input from dependencies */}
      <Handle type="target" position={Position.Top} className="task-node__handle" />

      {/* Status Badges */}
      <div className="task-node__badge-section">
        {/* Primary status badge */}
        <span
          className={`task-node__badge ${statusConfig.cssClass}`}
          title={
            task.status === 'ready'
              ? 'This task is ready to start'
              : `Status: ${statusConfig.label}${task.assignedAgentId ? `\nAgent: ${task.assignedAgentId}` : ''}`
          }
        >
          {statusConfig.label}
        </span>
        {/* Commit hash - shown next to DONE badge */}
        {task.status === 'done' && task.commitHash && (
          <button
            type="button"
            className="task-node__badge task-node__badge--commit"
            title={`Commit: ${task.commitHash}\nClick to view diff`}
            onClick={handleCommitClick}
          >
            {task.commitHash.slice(0, 7)}
          </button>
        )}
        {/* Blocked badge - shown alongside status */}
        {task.blocked && (
          <span
            className="task-node__badge task-node__badge--blocked"
            title="Blocked - waiting on dependencies"
          >
            BLOCKED
          </span>
        )}
        {/* Paused badge - shown alongside status */}
        {task.isPaused && !task.blocked && (
          <span
            className="task-node__badge task-node__badge--paused"
            title="Task execution paused"
          >
            PAUSED
          </span>
        )}
      </div>

      {/* Title - fixed width with ellipsis overflow */}
      <div className="task-node__body">
        <h3 className="task-node__title" title={task.title}>{task.title}</h3>
      </div>

      {/* Status indicator - below title */}
      {isBeingAnalyzed && (
        <div className="task-node__status-indicator">
          <div className="task-node__status-spinner" />
          <span>Analyzing...</span>
        </div>
      )}
      {!isBeingAnalyzed && task.status === 'developing' && !task.isPaused && (
        <div className="task-node__status-indicator">
          <div className="task-node__status-spinner" />
          <span>Developing...</span>
        </div>
      )}
      {!isBeingAnalyzed && task.status === 'verifying' && !task.isPaused && (
        <div className="task-node__status-indicator">
          <div className="task-node__status-spinner" />
          <span>Testing...</span>
        </div>
      )}
      {/* Source handle (bottom) - output to dependents */}
      <Handle type="source" position={Position.Bottom} className="task-node__handle" />

      {/* Diff Dialog */}
      {showDiffDialog && task.commitHash && (
        <DiffDialog
          commitHash={task.commitHash}
          worktreePath={worktreePath}
          onClose={() => setShowDiffDialog(false)}
        />
      )}
    </div>
  )
}

export const TaskNode = memo(TaskNodeComponent)
