import { useState, type JSX } from 'react'
import type { LogEntry, AgentType as LogAgentType } from '@shared/types'
import { Dialog, DialogHeader, DialogBody, DialogFooter, Button } from '../UI'
import './LogDialog.css'

type FilterType = LogAgentType | 'all'

export interface LogDialogProps {
  entries: LogEntry[]
  title: string
  onClose: () => void
}

export default function LogDialog({ entries, title, onClose }: LogDialogProps): JSX.Element {
  const [filter, setFilter] = useState<FilterType>('all')

  const filteredEntries = filter === 'all'
    ? entries
    : entries.filter(e => e.agent === filter)

  // Get unique agent types from entries for filter buttons
  const availableAgents = Array.from(new Set(entries.map(e => e.agent)))

  return (
    <Dialog open={true} onClose={onClose} size="lg">
      <DialogHeader title={title} />

      {/* Filter controls */}
      <div className="log-dialog__filter-bar">
        <span className="log-dialog__filter-label">Filter:</span>
        <div className="log-dialog__filter-buttons">
          <button
            onClick={() => setFilter('all')}
            className={`log-dialog__filter-btn ${
              filter === 'all' ? 'log-dialog__filter-btn--active' : 'log-dialog__filter-btn--inactive'
            }`}
          >
            all
          </button>
          {availableAgents.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`log-dialog__filter-btn ${
                filter === type ? 'log-dialog__filter-btn--active' : 'log-dialog__filter-btn--inactive'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <span className="log-dialog__count">
          {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <DialogBody>
        {/* Log entries */}
        <div className="log-dialog__entries">
          {filteredEntries.length === 0 ? (
            <div className="log-dialog__empty">
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
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function LogEntryRow({ entry }: { entry: LogEntry }): JSX.Element {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString()

  return (
    <div className="log-dialog__entry">
      <div className="log-dialog__entry-header">
        {/* Timestamp */}
        <span className="log-dialog__timestamp">{timestamp}</span>

        {/* Agent badge */}
        <span className={`log-dialog__badge log-dialog__badge--${entry.agent}`}>
          {entry.agent}
        </span>

        {/* Type badge */}
        <span className={`log-dialog__badge log-dialog__badge--${entry.type}`}>
          {entry.type}
        </span>

        {/* Task ID if present */}
        {entry.taskId && (
          <span className="log-dialog__task-id">Task: {entry.taskId.slice(0, 8)}</span>
        )}
      </div>

      {/* Content */}
      <div className="log-dialog__content">{entry.content}</div>
    </div>
  )
}
