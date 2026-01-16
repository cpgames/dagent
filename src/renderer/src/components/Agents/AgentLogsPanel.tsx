import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { LogEntry, AgentType as LogAgentType } from '@shared/types'
import { useExecutionStore } from '../../stores/execution-store'
import './AgentLogsPanel.css'

type FilterType = LogAgentType | 'all'

interface AgentLogsPanelProps {
  featureId: string | null
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
      <div className="agent-logs__empty">
        <div className="agent-logs__empty-content">
          <p className="agent-logs__empty-title">No feature selected</p>
          <p className="agent-logs__empty-subtitle">Select a feature to view agent logs</p>
        </div>
      </div>
    )
  }

  return (
    <div className="agent-logs">
      {/* Filter controls */}
      <div className="agent-logs__filters">
        <span className="agent-logs__filter-label">Filter:</span>
        <div className="agent-logs__filter-group">
          {(['all', 'harness', 'task', 'merge', 'pm'] as FilterType[]).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`agent-logs__filter-btn ${filter === type ? 'agent-logs__filter-btn--active' : ''}`}
            >
              {type}
            </button>
          ))}
        </div>
        {isRunning && (
          <span className="agent-logs__live-indicator">
            Live updates active
          </span>
        )}
      </div>

      {/* Log entries */}
      <div className="agent-logs__entries">
        {isLoading && entries.length === 0 ? (
          <div className="agent-logs__loading">Loading logs...</div>
        ) : filteredEntries.length === 0 ? (
          <div className="agent-logs__loading">
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
    <div className="agent-logs__entry">
      <div className="agent-logs__entry-header">
        {/* Timestamp */}
        <span className="agent-logs__timestamp">{timestamp}</span>

        {/* Agent badge */}
        <span className={`agent-logs__agent-badge agent-logs__agent-badge--${entry.agent}`}>
          {entry.agent}
        </span>

        {/* Type badge */}
        <span className={`agent-logs__type-badge agent-logs__type-badge--${entry.type}`}>
          {entry.type}
        </span>

        {/* Task ID if present */}
        {entry.taskId && (
          <span className="agent-logs__task-id">Task: {entry.taskId.slice(0, 8)}</span>
        )}
      </div>

      {/* Content */}
      <div className="agent-logs__content">{entry.content}</div>
    </div>
  )
}
