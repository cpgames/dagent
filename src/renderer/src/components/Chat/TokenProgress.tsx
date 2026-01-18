/**
 * TokenProgress Component
 * Synthwave-styled progress bar showing token usage for chat sessions
 */

import { useEffect, useState, useCallback, type JSX } from 'react'
import './TokenProgress.css'

interface TokenProgressProps {
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

// Token limits
const TOKEN_LIMIT = 100000
const TOKEN_WARNING_THRESHOLD = 80000

export function TokenProgress({ sessionId, featureId, projectRoot }: TokenProgressProps): JSX.Element {
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null)
  const [isCompacting, setIsCompacting] = useState(false)

  const loadMetrics = useCallback(async () => {
    if (!sessionId || !featureId || !projectRoot) {
      setMetrics(null)
      return
    }

    try {
      const metricsResult = await window.electronAPI.session.getMetrics(
        projectRoot,
        sessionId,
        featureId
      )
      setMetrics(metricsResult)
    } catch (error) {
      console.error('Failed to load session metrics:', error)
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
        loadMetrics()
      }
    })

    const unsubscribeError = window.electronAPI.session.onCompactionError((data) => {
      if (data.sessionId === sessionId) {
        setIsCompacting(false)
      }
    })

    // Poll for metrics updates every 5 seconds when session is active
    const pollInterval = setInterval(() => {
      loadMetrics()
    }, 5000)

    return () => {
      unsubscribeStart()
      unsubscribeComplete()
      unsubscribeError()
      clearInterval(pollInterval)
    }
  }, [sessionId, loadMetrics])

  // Calculate progress percentage
  const tokens = metrics?.totalTokens ?? 0
  const percentage = Math.min((tokens / TOKEN_LIMIT) * 100, 100)
  const isWarning = tokens > TOKEN_WARNING_THRESHOLD
  const isCritical = percentage >= 90

  // Format token count (e.g., 12345 -> "12.3k")
  const formatTokens = (count: number): string => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`
    }
    return count.toString()
  }

  if (!sessionId) {
    return <div className="token-progress token-progress--hidden" />
  }

  return (
    <div className={`token-progress ${isCompacting ? 'token-progress--compacting' : ''}`}>
      <div className="token-progress__bar-container">
        <div
          className={`token-progress__bar ${isWarning ? 'token-progress__bar--warning' : ''} ${isCritical ? 'token-progress__bar--critical' : ''}`}
          style={{ width: `${percentage}%` }}
        >
          <div className="token-progress__glow" />
        </div>
        {/* Scanlines overlay for retro effect */}
        <div className="token-progress__scanlines" />
      </div>
      <div className="token-progress__label">
        <span className={`token-progress__count ${isWarning ? 'token-progress__count--warning' : ''}`}>
          {formatTokens(tokens)}
        </span>
        <span className="token-progress__separator">/</span>
        <span className="token-progress__limit">100k</span>
        {isCompacting && (
          <span className="token-progress__compacting-indicator">
            <svg className="token-progress__spinner" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1v3M8 12v3M3.5 3.5l2.1 2.1M10.4 10.4l2.1 2.1M1 8h3M12 8h3M3.5 12.5l2.1-2.1M10.4 5.6l2.1-2.1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
        )}
      </div>
    </div>
  )
}
