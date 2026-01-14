import { useState, type JSX } from 'react'
import type { TaskAgentSession, TaskAgentMessage } from '@shared/types'

type MessageFilterType = TaskAgentMessage['type'] | 'all'

export interface SessionLogDialogProps {
  session: TaskAgentSession | null
  title: string
  onClose: () => void
}

const STATUS_COLORS: Record<TaskAgentSession['status'], string> = {
  active: 'bg-blue-600',
  completed: 'bg-green-600',
  failed: 'bg-red-600',
  paused: 'bg-yellow-600'
}

const MESSAGE_TYPE_LABELS: Record<TaskAgentMessage['type'], string> = {
  intention: 'Intention',
  approval: 'Approval',
  rejection: 'Rejection',
  progress: 'Progress',
  completion: 'Completion',
  error: 'Error'
}

export default function SessionLogDialog({
  session,
  title,
  onClose
}: SessionLogDialogProps): JSX.Element {
  const [filter, setFilter] = useState<MessageFilterType>('all')

  const handleOverlayClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const messages = session?.messages ?? []
  const filteredMessages =
    filter === 'all' ? messages : messages.filter((m) => m.type === filter)

  // Get unique message types from messages for filter buttons
  const availableTypes = Array.from(new Set(messages.map((m) => m.type)))

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center" style={{ gap: '0.75rem' }}>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {session && (
              <span
                className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[session.status]} text-white capitalize`}
              >
                {session.status}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Filter controls */}
        <div
          className="flex items-center px-6 py-3 border-b border-gray-700"
          style={{ gap: '0.5rem' }}
        >
          <span className="text-sm text-gray-400">Filter:</span>
          <div className="flex" style={{ gap: '0.25rem' }}>
            <button
              onClick={() => setFilter('all')}
              className={`
                px-2 py-1 text-xs rounded transition-colors capitalize
                ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }
              `}
            >
              all
            </button>
            {availableTypes.map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`
                  px-2 py-1 text-xs rounded transition-colors capitalize
                  ${
                    filter === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }
                `}
              >
                {MESSAGE_TYPE_LABELS[type] ?? type}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-gray-500">
            {filteredMessages.length} {filteredMessages.length === 1 ? 'message' : 'messages'}
          </span>
        </div>

        {/* Messages as conversation */}
        <div
          className="flex-1 overflow-y-auto p-4"
          style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        >
          {!session ? (
            <div className="text-gray-400 text-center py-4">No session data available.</div>
          ) : filteredMessages.length === 0 ? (
            <div className="text-gray-400 text-center py-4">
              {messages.length === 0
                ? 'No session messages yet.'
                : 'No messages match the current filter.'}
            </div>
          ) : (
            filteredMessages.map((message, index) => (
              <MessageRow key={`${message.timestamp}-${index}`} message={message} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageRow({ message }: { message: TaskAgentMessage }): JSX.Element {
  const timestamp = new Date(message.timestamp).toLocaleTimeString()
  const isOutgoing = message.direction === 'task_to_harness'

  return (
    <div
      className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
      style={{ marginBottom: '0.25rem' }}
    >
      <div
        className={`
          max-w-[80%] rounded-lg p-3
          ${isOutgoing ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'}
        `}
      >
        {/* Header with direction indicator, type badge, and timestamp */}
        <div
          className="flex items-center mb-1 text-xs opacity-80"
          style={{ gap: '0.5rem' }}
        >
          <span className="font-medium">
            {isOutgoing ? 'Task → Harness' : 'Harness → Task'}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded ${isOutgoing ? 'bg-blue-700' : 'bg-purple-700'} capitalize`}
          >
            {message.type}
          </span>
          <span className="ml-auto font-mono">{timestamp}</span>
        </div>

        {/* Content */}
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>

        {/* Metadata if present */}
        {message.metadata && (
          <div className="mt-2 text-xs opacity-70">
            {message.metadata.toolName && (
              <div>Tool: {message.metadata.toolName}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
