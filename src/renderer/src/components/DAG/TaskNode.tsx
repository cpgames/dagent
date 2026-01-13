import { memo, type JSX } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Task, TaskStatus } from '@shared/types'

export interface TaskNodeData extends Record<string, unknown> {
  task: Task
  onEdit: (taskId: string) => void
  onDelete: (taskId: string) => void
}

const statusBorderColors: Record<TaskStatus, string> = {
  blocked: 'border-blue-500',
  ready: 'border-blue-500',
  running: 'border-yellow-500',
  merging: 'border-yellow-500',
  completed: 'border-green-500',
  failed: 'border-red-500'
}

const statusBgColors: Record<TaskStatus, string> = {
  blocked: 'bg-blue-500/10',
  ready: 'bg-blue-500/10',
  running: 'bg-yellow-500/10',
  merging: 'bg-yellow-500/10',
  completed: 'bg-green-500/10',
  failed: 'bg-red-500/10'
}

function TaskNodeComponent({ data, selected }: NodeProps): JSX.Element {
  const nodeData = data as TaskNodeData
  const { task, onEdit, onDelete } = nodeData
  const borderColor = statusBorderColors[task.status]
  const bgColor = statusBgColors[task.status]

  return (
    <div
      className={`
        min-w-[180px] rounded-lg shadow-lg border-2
        ${borderColor} ${bgColor}
        ${selected ? 'ring-2 ring-white/50' : ''}
        bg-gray-800
      `}
    >
      {/* Target handle (left) - input from dependencies */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-600"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          {task.locked && (
            <svg
              className="w-4 h-4 text-gray-400"
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
          <span className="text-sm font-medium text-white truncate max-w-[120px]">
            {task.title}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit(task.id)
            }}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
            title="Edit task"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              onDelete(task.id)
            }}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400"
            title="Delete task"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* Status indicator */}
      <div className="px-3 py-2">
        <span className="text-xs text-gray-400 capitalize">{task.status}</span>
      </div>

      {/* Source handle (right) - output to dependents */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-600"
      />
    </div>
  )
}

export const TaskNode = memo(TaskNodeComponent)
