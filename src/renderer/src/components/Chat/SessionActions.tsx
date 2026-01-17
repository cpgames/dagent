import { useState, useCallback, useRef, useEffect, type JSX } from 'react'
import './SessionActions.css'

interface SessionActionsProps {
  sessionId: string | null
  featureId: string
  projectRoot: string
  disabled?: boolean
}

type ActionStatus = 'idle' | 'loading' | 'success' | 'error'

export function SessionActions({
  sessionId,
  featureId,
  projectRoot,
  disabled = false
}: SessionActionsProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [actionStatus, setActionStatus] = useState<ActionStatus>('idle')
  const [showConfirmReset, setShowConfirmReset] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
    return undefined
  }, [isOpen])

  // Close dropdown on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setShowConfirmReset(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  // Clear status message after 3 seconds
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => {
        setStatusMessage(null)
        setActionStatus('idle')
      }, 3000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [statusMessage])

  const showStatus = useCallback((message: string, status: ActionStatus) => {
    setStatusMessage(message)
    setActionStatus(status)
  }, [])

  const handleClearMessages = useCallback(async () => {
    if (!sessionId) return

    setActionStatus('loading')
    try {
      await window.electronAPI.session.clearMessages(projectRoot, sessionId, featureId)
      showStatus('Messages cleared', 'success')
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to clear messages:', error)
      showStatus('Failed to clear messages', 'error')
    }
  }, [sessionId, projectRoot, featureId, showStatus])

  const handleForceCompaction = useCallback(async () => {
    if (!sessionId) return

    setActionStatus('loading')
    try {
      await window.electronAPI.session.forceCompact(projectRoot, sessionId, featureId)
      showStatus('Compaction triggered', 'success')
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to force compaction:', error)
      showStatus('Failed to trigger compaction', 'error')
    }
  }, [sessionId, projectRoot, featureId, showStatus])

  const handleResetSession = useCallback(async () => {
    if (!sessionId) return

    setActionStatus('loading')
    try {
      // Clear all messages
      await window.electronAPI.session.clearMessages(projectRoot, sessionId, featureId)
      // Archive the session (marks it as no longer active)
      await window.electronAPI.session.archive(projectRoot, sessionId, featureId)
      showStatus('Session reset', 'success')
      setShowConfirmReset(false)
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to reset session:', error)
      showStatus('Failed to reset session', 'error')
    }
  }, [sessionId, projectRoot, featureId, showStatus])

  const handleExportSession = useCallback(async () => {
    if (!sessionId) return

    setActionStatus('loading')
    try {
      // Get all session data
      const [messages, checkpoint, context, metrics] = await Promise.all([
        window.electronAPI.session.getAllMessages(projectRoot, sessionId, featureId),
        window.electronAPI.session.getCheckpoint(projectRoot, sessionId, featureId),
        window.electronAPI.session.getContext(projectRoot, sessionId, featureId),
        window.electronAPI.session.getMetrics(projectRoot, sessionId, featureId)
      ])

      // Build export object
      const exportData = {
        sessionId,
        featureId,
        exportedAt: new Date().toISOString(),
        messages,
        checkpoint,
        context,
        metrics
      }

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `session-${featureId}-${sessionId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showStatus('Session exported', 'success')
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to export session:', error)
      showStatus('Failed to export session', 'error')
    }
  }, [sessionId, projectRoot, featureId, showStatus])

  const isDisabled = disabled || !sessionId

  return (
    <div className="session-actions">
      {/* Status message toast */}
      {statusMessage && (
        <div className={`session-actions__toast session-actions__toast--${actionStatus}`}>
          {actionStatus === 'loading' && (
            <svg className="session-actions__toast-icon session-actions__toast-icon--spinning" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1v3M8 12v3M3.5 3.5l2.1 2.1M10.4 10.4l2.1 2.1M1 8h3M12 8h3M3.5 12.5l2.1-2.1M10.4 5.6l2.1-2.1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
          {actionStatus === 'success' && (
            <svg className="session-actions__toast-icon" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {actionStatus === 'error' && (
            <svg className="session-actions__toast-icon" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          {statusMessage}
        </div>
      )}

      {/* Trigger button */}
      <button
        ref={triggerRef}
        className={`session-actions__trigger ${isOpen ? 'session-actions__trigger--active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isDisabled}
        title="Session actions"
      >
        <svg viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="3" r="1.5" fill="currentColor" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <circle cx="8" cy="13" r="1.5" fill="currentColor" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div ref={dropdownRef} className="session-actions__menu">
          {/* Clear Messages */}
          <button
            className="session-actions__item"
            onClick={handleClearMessages}
            disabled={actionStatus === 'loading'}
          >
            <svg className="session-actions__item-icon" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Clear Messages
          </button>

          {/* Force Compaction */}
          <button
            className="session-actions__item"
            onClick={handleForceCompaction}
            disabled={actionStatus === 'loading'}
          >
            <svg className="session-actions__item-icon" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 4h12M4 4v8a1 1 0 001 1h6a1 1 0 001-1V4M6 7v4M10 7v4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Force Compaction
          </button>

          {/* Export Session */}
          <button
            className="session-actions__item"
            onClick={handleExportSession}
            disabled={actionStatus === 'loading'}
          >
            <svg className="session-actions__item-icon" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2v8M5 7l3 3 3-3M3 11v2a1 1 0 001 1h8a1 1 0 001-1v-2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Export Session
          </button>

          <div className="session-actions__divider" />

          {/* Reset Session (destructive) */}
          <button
            className="session-actions__item session-actions__item--danger"
            onClick={() => setShowConfirmReset(true)}
            disabled={actionStatus === 'loading'}
          >
            <svg className="session-actions__item-icon" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 4h12M5 4V2.5a.5.5 0 01.5-.5h5a.5.5 0 01.5.5V4M3 4v9.5a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5V4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M6.5 7v5M9.5 7v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Reset Session
          </button>
        </div>
      )}

      {/* Confirmation dialog for Reset */}
      {showConfirmReset && (
        <div className="session-actions__confirm-overlay" onClick={() => setShowConfirmReset(false)}>
          <div className="session-actions__confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="session-actions__confirm-header">
              <svg className="session-actions__confirm-icon" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 9v4M12 17h.01M12 3l9.5 17H2.5L12 3z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h3>Reset Session?</h3>
            </div>
            <p className="session-actions__confirm-message">
              This will permanently delete all session data including the checkpoint.
              This action cannot be undone.
            </p>
            <div className="session-actions__confirm-actions">
              <button
                className="session-actions__confirm-cancel"
                onClick={() => setShowConfirmReset(false)}
                disabled={actionStatus === 'loading'}
              >
                Cancel
              </button>
              <button
                className="session-actions__confirm-submit"
                onClick={handleResetSession}
                disabled={actionStatus === 'loading'}
              >
                {actionStatus === 'loading' ? 'Resetting...' : 'Reset Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
