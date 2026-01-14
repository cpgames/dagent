import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { LogEntry, AgentType as LogAgentType } from '@shared/types'
import { useExecutionStore } from '../../stores/execution-store'

type FilterType = LogAgentType | 'all'

interface AgentLogsPanelProps {
  featureId: string | null
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
  error: 'bg-red-700'
}

export function AgentLogsPanel({ featureId }: AgentLogsPanelProps): JSX.Element {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<FilterType>('all')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { execution } = useExecutionStore()

  const isRunning = execution.status === 'running'

  const loadLogs = useCallback(async () => {
    if (!featureId) {
      setEntries([])
      return
    }

    setIsLoading(true)
    try {
      const harnessLog = await window.electronAPI.storage.loadHarnessLog(featureId)
      if (harnessLog) {
        setEntries(harnessLog.entries)
      } else {
        setEntries([])
      }
    } catch (error) {
      console.error('Failed to load agent logs:', error)
      setEntries([])
    } finally {
      setIsLoading(false)
    }
  }, [featureId])

  // Load logs when featureId changes
  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  // Poll for updates when execution is running
  useEffect(() => {
    if (!isRunning || !featureId) return

    const interval = setInterval(loadLogs, 2000)
    return () => clearInterval(interval)
  }, [isRunning, featureId, loadLogs])

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  const filteredEntries = filter === 'all'
    ? entries
    : entries.filter(e => e.agent === filter)

  if (!featureId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-lg mb-2">No feature selected</p>
          <p className="text-sm">Select a feature to view agent logs</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Filter controls */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-700">
        <span className="text-sm text-gray-400">Filter:</span>
        <div className="flex gap-1">
          {(['all', 'harness', 'task', 'merge', 'pm'] as FilterType[]).map((type) => (
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
        {isRunning && (
          <span className="ml-auto text-xs text-green-400 animate-pulse">
            Live updates active
          </span>
        )}
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && entries.length === 0 ? (
          <div className="text-gray-400 text-center py-4">Loading logs...</div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-gray-400 text-center py-4">
            {entries.length === 0
              ? 'No agent logs yet. Run execution to generate logs.'
              : 'No logs match the current filter.'}
          </div>
        ) : (
          filteredEntries.map((entry, index) => (
            <LogEntryRow key={`${entry.timestamp}-${index}`} entry={entry} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function LogEntryRow({ entry }: { entry: LogEntry }): JSX.Element {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString()

  return (
    <div className="bg-gray-800 rounded p-2 text-sm">
      <div className="flex items-center gap-2 mb-1">
        {/* Timestamp */}
        <span className="text-xs text-gray-500 font-mono">{timestamp}</span>

        {/* Agent badge */}
        <span className={`px-1.5 py-0.5 text-xs rounded ${AGENT_COLORS[entry.agent]} text-white capitalize`}>
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
