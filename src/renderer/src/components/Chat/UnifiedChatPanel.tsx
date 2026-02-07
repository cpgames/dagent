/**
 * UnifiedChatPanel - Generic chat panel component for all agent types.
 *
 * A reusable chat component that works with the unified chat store.
 * Can be used for setup, PM, investigation, and other chat types.
 */

import { useCallback, useEffect, useRef, useState, useMemo, type JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useUnifiedChatStore, type ChatType, type Memory } from '../../stores'
import type { ChatMessage } from '@shared/types/session'
import './UnifiedChatPanel.css'

// Token estimation constants
const TOKEN_LIMIT = 100000
const TOKEN_WARNING_THRESHOLD = 80000
const CHARS_PER_TOKEN = 4 // Rough approximation

// Map agent types to display names
const AGENT_DISPLAY_NAMES: Record<string, string> = {
  feature: 'Feature Agent',
  project: 'Project Agent',
  dev: 'Developer Agent',
  qa: 'QA Agent',
  merge: 'Merge Agent',
  harness: 'Orchestrator',
  task: 'Developer Agent'
}

/**
 * Estimate token count from messages (rough approximation).
 */
function estimateTokens(messages: ChatMessage[]): number {
  const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0)
  return Math.round(totalChars / CHARS_PER_TOKEN)
}

/**
 * Format token count for display (e.g., 12345 -> "12.3k").
 */
function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(0)}k`
  }
  return count.toString()
}

/**
 * Get display name for agent type from a message.
 */
function getAgentDisplayName(message: ChatMessage): string {
  if (message.role === 'user') return 'You'
  const agentType = message.metadata?.agentType
  if (agentType && AGENT_DISPLAY_NAMES[agentType]) {
    return AGENT_DISPLAY_NAMES[agentType]
  }
  return 'Assistant'
}

/**
 * Get display name for chat type (used during streaming when no message metadata available).
 */
function getAgentNameForChatType(chatType: ChatType): string {
  return AGENT_DISPLAY_NAMES[chatType] || 'Assistant'
}

/**
 * Chat message component.
 */
function ChatMessageItem({ message }: { message: ChatMessage }): JSX.Element {
  const isUser = message.role === 'user'
  const content = message.content.replace(/\n/g, '  \n')
  const displayName = getAgentDisplayName(message)
  const [showToolList, setShowToolList] = useState(false)

  const toolUses = message.metadata?.toolUses || []
  const hasToolUses = toolUses.length > 0

  return (
    <div className={`unified-chat-message ${isUser ? 'unified-chat-message--user' : 'unified-chat-message--assistant'}`}>
      <div className="unified-chat-message__role">{displayName}</div>
      <div className="unified-chat-message__content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code: ({ className, children, ...props }) => {
              const isInline = !className?.includes('language-')
              return isInline ? (
                <code className="unified-chat-message__inline-code" {...props}>
                  {children}
                </code>
              ) : (
                <pre className="unified-chat-message__code-block">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              )
            },
            a: ({ children, ...props }) => (
              <a className="unified-chat-message__link" target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            ),
            ul: ({ children, ...props }) => (
              <ul className="unified-chat-message__list" {...props}>
                {children}
              </ul>
            ),
            ol: ({ children, ...props }) => (
              <ol className="unified-chat-message__list unified-chat-message__list--ordered" {...props}>
                {children}
              </ol>
            )
          }}
        >
          {content}
        </ReactMarkdown>
        {hasToolUses && (
          <div
            className="unified-chat-message__tools"
            onMouseEnter={() => setShowToolList(true)}
            onMouseLeave={() => setShowToolList(false)}
          >
            <span className="unified-chat-message__tools-count">
              🔧 {toolUses.length} tool{toolUses.length > 1 ? 's' : ''} used
            </span>
            {showToolList && (
              <div className="unified-chat-message__tools-list">
                {toolUses.map((tool, index) => (
                  <div key={index} className="unified-chat-message__tool-item">
                    <span className="unified-chat-message__tool-name">{tool.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Props for UnifiedChatPanel.
 */
interface UnifiedChatPanelProps {
  sessionId: string
  chatType: ChatType
  projectRoot: string
  featureId?: string
  placeholder?: string
  className?: string
  onClose?: () => void
}

/**
 * UnifiedChatPanel component.
 */
export function UnifiedChatPanel({
  sessionId,
  chatType,
  projectRoot,
  featureId,
  placeholder = 'Type a message...',
  className = '',
  onClose
}: UnifiedChatPanelProps): JSX.Element {
  const {
    sessions,
    initializeSession,
    sendMessage,
    abort,
    reset,
    compact,
    getMemory
  } = useUnifiedChatStore()

  const session = sessions.get(sessionId)
  const [inputValue, setInputValue] = useState('')
  const [showMemory, setShowMemory] = useState(false)
  const [memoryData, setMemoryData] = useState<Memory | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize session on mount
  useEffect(() => {
    initializeSession(sessionId, chatType, projectRoot, featureId)
  }, [sessionId, chatType, projectRoot, featureId, initializeSession])

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [session?.messages, session?.streamingContent, session?.textSegments, session?.activeToolUse, scrollToBottom])

  // Handle send
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || session?.isResponding) return
    const message = inputValue
    setInputValue('')
    await sendMessage(sessionId, message)
  }, [inputValue, session?.isResponding, sendMessage, sessionId])

  // Handle key press
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  // Handle reset - show confirmation first
  const handleResetClick = useCallback(() => {
    setShowClearConfirm(true)
  }, [])

  // Confirm reset - actually clear messages and memory
  const handleResetConfirm = useCallback(async () => {
    setShowClearConfirm(false)
    await reset(sessionId)
    // Re-initialize after reset
    await initializeSession(sessionId, chatType, projectRoot, featureId)
  }, [reset, sessionId, initializeSession, chatType, projectRoot, featureId])

  // Handle compact
  const handleCompact = useCallback(async () => {
    await compact(sessionId)
  }, [compact, sessionId])

  // Handle view memory
  const handleViewMemory = useCallback(async () => {
    const data = await getMemory(sessionId)
    setMemoryData(data)
    setShowMemory(true)
  }, [getMemory, sessionId])

  const isLoading = session?.isLoading ?? true
  const isResponding = session?.isResponding ?? false
  const isCompacting = session?.isCompacting ?? false
  const messages = session?.messages ?? []
  const streamingContent = session?.streamingContent ?? ''
  const textSegments = session?.textSegments ?? []
  const pendingToolUses = session?.pendingToolUses ?? []
  const activeToolUse = session?.activeToolUse ?? null
  const error = session?.error ?? null

  // Combine text segments with current streaming content for display
  const displayContent = useMemo(() => {
    const segments = [...textSegments, streamingContent].filter(Boolean)
    return segments.join('\n\n')
  }, [textSegments, streamingContent])

  // Token estimation
  const tokenEstimate = useMemo(() => estimateTokens(messages), [messages])
  const tokenPercentage = Math.min((tokenEstimate / TOKEN_LIMIT) * 100, 100)
  const isTokenWarning = tokenEstimate > TOKEN_WARNING_THRESHOLD

  // Input resize state
  const [inputHeight, setInputHeight] = useState(80)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)

  // Handle resize drag
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartY.current = e.clientY
    resizeStartHeight.current = inputHeight
  }, [inputHeight])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = resizeStartY.current - e.clientY
      const newHeight = Math.min(Math.max(resizeStartHeight.current + delta, 40), 300)
      setInputHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  return (
    <div className={`unified-chat-panel ${className}`}>
      {/* Header */}
      <div className="unified-chat-panel__header">
        <div className="unified-chat-panel__header-top">
          <div className="unified-chat-panel__header-actions">
            <button
              onClick={handleResetClick}
              className="unified-chat-panel__clear-btn"
              title="Clear chat messages"
              disabled={isResponding || isCompacting}
            >
              Clear
            </button>
            <button
              onClick={handleCompact}
              className="unified-chat-panel__clear-btn"
              title="Compact messages into checkpoint"
              disabled={isResponding || isCompacting || messages.length === 0}
            >
              {isCompacting ? 'Compacting...' : 'Compact'}
            </button>
            <button
              onClick={handleViewMemory}
              className="unified-chat-panel__clear-btn"
              title="View memory summary"
              disabled={isCompacting}
            >
              Memory
            </button>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="unified-chat-panel__header-btn"
              title="Close panel"
            >
              <svg className="unified-chat-panel__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {/* Token Progress Bar */}
        <div className="unified-chat-panel__token-progress">
          <div className="unified-chat-panel__token-bar-container">
            <div
              className={`unified-chat-panel__token-bar ${isTokenWarning ? 'unified-chat-panel__token-bar--warning' : ''}`}
              style={{ width: `${tokenPercentage}%` }}
            />
          </div>
          <span className="unified-chat-panel__token-label">
            {formatTokens(tokenEstimate)} / 100k
          </span>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="unified-chat-panel__error">
          <span>{error}</span>
        </div>
      )}

      {/* Messages area */}
      <div className="unified-chat-panel__messages">
        {isLoading ? (
          <div className="unified-chat-panel__loading">
            <div className="unified-chat-panel__spinner" />
            <p>Starting...</p>
          </div>
        ) : messages.length === 0 && !streamingContent ? (
          <div className="unified-chat-panel__empty">
            <p>Ask me anything about your project.</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessageItem key={msg.id} message={msg} />
            ))}
          </>
        )}

        {/* Streaming response */}
        {(displayContent || pendingToolUses.length > 0 || activeToolUse) && (
          <div className="unified-chat-message unified-chat-message--assistant unified-chat-message--streaming">
            <div className="unified-chat-message__role">{getAgentNameForChatType(chatType)}</div>
            <div className="unified-chat-message__content">
              {displayContent}
              {isResponding && <span className="unified-chat-message__cursor">|</span>}
              {(pendingToolUses.length > 0 || activeToolUse) && (
                <div className="unified-chat-message__tools unified-chat-message__tools--streaming">
                  <span className="unified-chat-message__tools-count">
                    🔧 {pendingToolUses.length + (activeToolUse ? 1 : 0)} tool{pendingToolUses.length + (activeToolUse ? 1 : 0) !== 1 ? 's' : ''}
                    {activeToolUse ? ` (${activeToolUse.name}...)` : ' used'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Thinking/Stop indicator */}
        {isResponding && (
          <div className="unified-chat-panel__thinking">
            {!displayContent && <span>Thinking...</span>}
            <button onClick={() => abort(sessionId)} className="unified-chat-panel__stop">
              Stop
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="unified-chat-panel__input-area">
        <div
          className={`unified-chat-panel__input-resize-handle ${isResizing ? 'unified-chat-panel__input-resize-handle--active' : ''}`}
          onMouseDown={handleResizeStart}
        />
        <div className="unified-chat-panel__input-content">
          <div className="unified-chat-panel__input-row">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="unified-chat-panel__input"
              disabled={isResponding || isLoading || isCompacting}
              style={{ height: `${inputHeight}px` }}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isResponding || isLoading || isCompacting}
              className="unified-chat-panel__send"
            >
              {isResponding ? 'Thinking...' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* Memory Dialog */}
      {showMemory && (
        <div className="unified-chat-panel__memory-overlay" onClick={() => setShowMemory(false)}>
          <div className="unified-chat-panel__memory-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="unified-chat-panel__memory-header">
              <h3>Memory</h3>
              <button
                onClick={() => setShowMemory(false)}
                className="unified-chat-panel__memory-close"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="unified-chat-panel__memory-content">
              {memoryData ? (
                <>
                  <div className="unified-chat-panel__memory-stats">
                    <span>v{memoryData.version}</span>
                    <span>•</span>
                    <span>{memoryData.stats.totalMessages} messages compacted</span>
                  </div>

                  {memoryData.summary.critical.length > 0 && (
                    <div className="unified-chat-panel__memory-section unified-chat-panel__memory-section--critical">
                      <h4>Critical</h4>
                      <ul>
                        {memoryData.summary.critical.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {memoryData.summary.important.length > 0 && (
                    <div className="unified-chat-panel__memory-section">
                      <h4>Important</h4>
                      <ul>
                        {memoryData.summary.important.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {memoryData.summary.minor.length > 0 && (
                    <div className="unified-chat-panel__memory-section unified-chat-panel__memory-section--minor">
                      <h4>Minor</h4>
                      <ul>
                        {memoryData.summary.minor.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="unified-chat-panel__memory-empty">
                  No memory yet. Compact messages to create memory.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirmation Dialog */}
      {showClearConfirm && (
        <div className="unified-chat-panel__memory-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="unified-chat-panel__confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="unified-chat-panel__confirm-content">
              <p>All messages and memory will be cleared.</p>
            </div>
            <div className="unified-chat-panel__confirm-actions">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="unified-chat-panel__confirm-btn unified-chat-panel__confirm-btn--cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleResetConfirm}
                className="unified-chat-panel__confirm-btn unified-chat-panel__confirm-btn--confirm"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
