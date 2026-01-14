import type { JSX } from 'react'
import { ChatPanel } from './ChatPanel'
import { useDialogStore } from '../../stores/dialog-store'
import { useDAGStore } from '../../stores/dag-store'

interface TaskChatProps {
  taskId: string
  featureId: string
}

export function TaskChat({ taskId }: TaskChatProps): JSX.Element {
  const { closeTaskChat } = useDialogStore()
  const { dag } = useDAGStore()

  // Get task title for header
  const task = dag?.nodes.find((n) => n.id === taskId)
  const taskTitle = task?.title || 'Task'

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-900 z-10 animate-slide-in-right">
      {/* Back button header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
        <button
          onClick={closeTaskChat}
          className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
          title="Back to feature chat"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <span className="text-sm text-gray-300 truncate">{taskTitle}</span>
      </div>

      {/* Chat panel for task context */}
      <ChatPanel agentName="Task Agent" contextId={taskId} contextType="task" className="flex-1" />
    </div>
  )
}
