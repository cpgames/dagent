import { useState, type JSX } from 'react'
import type { DevAgentSession, DevAgentMessage } from '@shared/types'
import { Dialog, DialogHeader, DialogBody, DialogFooter, Button } from '../UI'
import './SessionLogDialog.css'

type MessageFilterType = DevAgentMessage['type'] | 'all'

export interface SessionLogDialogProps {
  session: DevAgentSession | null
  title: string
  onClose: () => void
}

const MESSAGE_TYPE_LABELS: Record<DevAgentMessage['type'], string> = {
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

  const messages = session?.messages ?? []
  const filteredMessages =
    filter === 'all' ? messages : messages.filter((m) => m.type === filter)

  // Get unique message types from messages for filter buttons
  const availableTypes = Array.from(new Set(messages.map((m) => m.type)))

  return (
    <Dialog open={true} onClose={onClose} size="lg">
      <DialogHeader>
        <div className="session-dialog__header-content">
          <h2 className="ui-dialog__title">{title}</h2>
          {session && (
            <span className={`session-dialog__status-badge session-dialog__status-badge--${session.status}`}>
              {session.status}
            </span>
          )}
        </div>
      </DialogHeader>

      {/* Filter controls */}
      <div className="session-dialog__filter-bar">
        <span className="session-dialog__filter-label">Filter:</span>
        <div className="session-dialog__filter-buttons">
          <button
            onClick={() => setFilter('all')}
            className={`session-dialog__filter-btn ${
              filter === 'all' ? 'session-dialog__filter-btn--active' : 'session-dialog__filter-btn--inactive'
            }`}
          >
            all
          </button>
          {availableTypes.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`session-dialog__filter-btn ${
                filter === type ? 'session-dialog__filter-btn--active' : 'session-dialog__filter-btn--inactive'
              }`}
            >
              {MESSAGE_TYPE_LABELS[type] ?? type}
            </button>
          ))}
        </div>
        <span className="session-dialog__count">
          {filteredMessages.length} {filteredMessages.length === 1 ? 'message' : 'messages'}
        </span>
      </div>

      <DialogBody>
        {/* Messages as conversation */}
        <div className="session-dialog__messages">
          {!session ? (
            <div className="session-dialog__empty">No session data available.</div>
          ) : filteredMessages.length === 0 ? (
            <div className="session-dialog__empty">
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
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function MessageRow({ message }: { message: DevAgentMessage }): JSX.Element {
  const timestamp = new Date(message.timestamp).toLocaleTimeString()
  const isOutgoing = message.direction === 'task_to_harness'

  return (
    <div className={`session-dialog__message-row ${isOutgoing ? 'session-dialog__message-row--outgoing' : 'session-dialog__message-row--incoming'}`}>
      <div className={`session-dialog__message ${isOutgoing ? 'session-dialog__message--outgoing' : 'session-dialog__message--incoming'}`}>
        {/* Header with direction indicator, type badge, and timestamp */}
        <div className="session-dialog__message-header">
          <span className="session-dialog__direction">
            {isOutgoing ? 'Task → Harness' : 'Harness → Task'}
          </span>
          <span className={`session-dialog__type-badge ${isOutgoing ? 'session-dialog__type-badge--outgoing' : 'session-dialog__type-badge--incoming'}`}>
            {message.type}
          </span>
          <span className="session-dialog__timestamp">{timestamp}</span>
        </div>

        {/* Content */}
        <div className="session-dialog__message-content">{message.content}</div>

        {/* Metadata if present */}
        {message.metadata && (
          <div className="session-dialog__metadata">
            {message.metadata.toolName && (
              <div>Tool: {message.metadata.toolName}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
