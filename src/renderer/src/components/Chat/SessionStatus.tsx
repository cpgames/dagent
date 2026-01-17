import { useEffect, useState, useCallback, type JSX } from 'react'
import './SessionStatus.css'

interface SessionStatusProps {
  sessionId: string | null
  featureId: string
  projectRoot: string
}

interface SessionMetrics {
  totalCompactions: number
  totalMessagesCompacted: number
  totalTokens: number
  lastCompactionAt?: string
}

export function SessionStatus({ sessionId, featureId, projectRoot }: SessionStatusProps): JSX.Element {
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null)
  const [checkpointVersion, setCheckpointVersion] = useState<number | null>(null)
  const [isCompacting, setIsCompacting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Token warning threshold (80k out of 100k limit)
  const TOKEN_WARNING_THRESHOLD = 80000

  const loadMetrics = useCallback(async () => {
    if (!sessionId || !featureId || !projectRoot) {
      setMetrics(null)
      setCheckpointVersion(null)
      return
    }

    setIsLoading(true)
    try {
      const metricsResult = await window.electronAPI.session.getMetrics(
        projectRoot,
        sessionId,
        featureId
      )
      setMetrics(metricsResult)

      // Load checkpoint for version info
      const checkpoint = await window.electronAPI.session.getCheckpoint(
        projectRoot,
        sessionId,
        featureId
      )
      setCheckpointVersion(checkpoint?.version ?? null)
    } catch (error) {
      console.error('Failed to load session metrics:', error)
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, featureId, projectRoot])

  // Load metrics on mount and when session changes
  useEffect(() => {
    loadMetrics()
  }, [loadMetrics])

  // Subscribe to compaction events
  useEffect(() => {
    const unsubscribeStart = window.electronAPI.session.onCompactionStart((data) => {
      if (data.sessionId === sessionId) {
        setIsCompacting(true)
      }
    })

    const unsubscribeComplete = window.electronAPI.session.onCompactionComplete((data) => {
      if (data.sessionId === sessionId) {
        setIsCompacting(false)
        setCheckpointVersion(data.newCheckpointVersion)
        // Refresh metrics after compaction
        loadMetrics()
      }
    })

    const unsubscribeError = window.electronAPI.session.onCompactionError((data) => {
      if (data.sessionId === sessionId) {
        setIsCompacting(false)
      }
    })

    return () => {
      unsubscribeStart()
      unsubscribeComplete()
      unsubscribeError()
    }
  }, [sessionId, loadMetrics])

  // Format token count (e.g., 12345 -> "12.3k")
  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`
    }
    return tokens.toString()
  }

  // Show warning when tokens exceed threshold
  const showWarning = metrics && metrics.totalTokens > TOKEN_WARNING_THRESHOLD

  if (!sessionId) {
    return (
      <div className="session-status session-status--no-session">
        <span className="session-status__item session-status__item--muted">
          No session
        </span>
      </div>
    )
  }

  if (isLoading && !metrics) {
    return (
      <div className="session-status session-status--loading">
        <span className="session-status__item session-status__item--muted">
          Loading...
        </span>
      </div>
    )
  }

  return (
    <div className="session-status">
      {/* Compacting indicator */}
      {isCompacting && (
        <span className="session-status__item session-status__compacting">
          <svg className="session-status__icon session-status__icon--spinning" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1v3M8 12v3M3.5 3.5l2.1 2.1M10.4 10.4l2.1 2.1M1 8h3M12 8h3M3.5 12.5l2.1-2.1M10.4 5.6l2.1-2.1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Compacting...
        </span>
      )}

      {/* Token count */}
      <span className={`session-status__item ${showWarning ? 'session-status__warning' : ''}`}>
        <svg className="session-status__icon" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {metrics ? formatTokens(metrics.totalTokens) : '0'} tokens
        {showWarning && (
          <svg className="session-status__icon session-status__icon--warning" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1.5l6.5 12H1.5L8 1.5z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M8 6v3M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </span>

      {/* Checkpoint version */}
      {checkpointVersion !== null && (
        <span className="session-status__item">
          <svg className="session-status__icon" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          v{checkpointVersion}
        </span>
      )}

      {/* Compaction count */}
      {metrics && metrics.totalCompactions > 0 && (
        <span className="session-status__item">
          <svg className="session-status__icon" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 8h2l2-4 2 8 2-4h4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {metrics.totalCompactions} compactions
        </span>
      )}
    </div>
  )
}
