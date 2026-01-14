import { useState, type JSX } from 'react'
import type { LogEntry, AgentType as LogAgentType } from '@shared/types'

type FilterType = LogAgentType | 'all'

export interface LogDialogProps {
  entries: LogEntry[]
  title: string
  onClose: () => void
}

const AGENT_COLORS: Record<LogAgentType, string> = {
  harness: 'bg-purple-600',
  task: 'bg-blue-600',
  merge: 'bg-green-600',
  pm: 'bg-indigo-600'
}

const TYPE_COLORS: Record<string, string> = {
  intention: 'bg-gray-600',
  approval: 'bg-green-600',
  rejection: 'bg-red-600',
  modification: 'bg-yellow-600',
  action: 'bg-blue-600',
  error: 'bg-red-700',
  'pm-query': 'bg-indigo-500',
  'pm-response': 'bg-indigo-400'
}

export default function LogDialog({ entries, title, onClose }: LogDialogProps): JSX.Element {
  const [filter, setFilter] = useState<FilterType>('all')

  const handleOverlayClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const filteredEntries = filter === 'all'
    ? entries
    : entries.filter(e => e.agent === filter)

  // Get unique agent types from entries for filter buttons
  const availableAgents = Array.from(new Set(entries.map(e => e.agent)))

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
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
        <div className="flex items-center px-6 py-3 border-b border-gray-700" style={{ gap: '0.5rem' }}>
          <span className="text-sm text-gray-400">Filter:</span>
          <div className="flex" style={{ gap: '0.25rem' }}>
            <button
              onClick={() => setFilter('all')}
              className={`
                px-2 py-1 text-xs rounded transition-colors capitalize
                ${filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
              `}
            >
              all
            </button>
            {availableAgents.map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`
                  px-2 py-1 text-xs rounded transition-colors capitalize
                  ${filter === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
                `}
              >
                {type}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-gray-500">
            {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {/* Log entries */}
        <div className="flex-1 overflow-y-auto p-4" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filteredEntries.length === 0 ? (
            <div className="text-gray-400 text-center py-4">
              {entries.length === 0
                ? 'No logs yet.'
                : 'No logs match the current filter.'}
            </div>
          ) : (
            filteredEntries.map((entry, index) => (
              <LogEntryRow key={`${entry.timestamp}-${index}`} entry={entry} />
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

function LogEntryRow({ entry }: { entry: LogEntry }): JSX.Element {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString()

  return (
    <div className="bg-gray-900 rounded p-2 text-sm">
      <div className="flex items-center mb-1" style={{ gap: '0.5rem' }}>
        {/* Timestamp */}
        <span className="text-xs text-gray-500 font-mono">{timestamp}</span>

        {/* Agent badge */}
        <span className={`px-1.5 py-0.5 text-xs rounded ${AGENT_COLORS[entry.agent] || 'bg-gray-600'} text-white capitalize`}>
          {entry.agent}
        </span>

        {/* Type badge */}
        <span className={`px-1.5 py-0.5 text-xs rounded ${TYPE_COLORS[entry.type] || 'bg-gray-600'} text-white capitalize`}>
          {entry.type}
        </span>

        {/* Task ID if present */}
        {entry.taskId && (
          <span className="text-xs text-gray-500">Task: {entry.taskId.slice(0, 8)}</span>
        )}
      </div>

      {/* Content */}
      <div className="text-gray-200 whitespace-pre-wrap">{entry.content}</div>
    </div>
  )
}
