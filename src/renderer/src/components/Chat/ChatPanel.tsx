import { useCallback, useEffect, useRef, useState, useMemo, type JSX } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { useProjectStore } from '../../stores/project-store'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ToolUsageDisplay } from './ToolUsageDisplay'
import { TokenProgress } from './TokenProgress'
import './ChatPanel.css'

// Only render recent messages initially for performance
// Older messages can be loaded via "Show more" button
const INITIAL_MESSAGE_LIMIT = 50
const LOAD_MORE_INCREMENT = 50

interface ChatPanelProps {
  agentName?: string
  contextId: string
  contextType: 'feature' | 'task' | 'agent'
  onClear?: () => void
  onShowLogs?: () => void
  className?: string
}

export function ChatPanel({
  agentName,
  contextId,
  contextType,
  onClear,
  onShowLogs,
  className = ''
}: ChatPanelProps): JSX.Element {
  const {
    messages,
    loadChat,
    abortAgent,
    clearMessages,
    isLoading,
    isResponding,
    streamingContent,
    activeToolUse,
    sessionId
  } = useChatStore()
  const projectPath = useProjectStore((state) => state.projectPath)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Track how many messages to show (for performance with large chats)
  const [visibleMessageCount, setVisibleMessageCount] = useState(INITIAL_MESSAGE_LIMIT)

  // Load chat when contextId or contextType changes
  useEffect(() => {
    loadChat(contextId, contextType)
    // Reset visible count when switching contexts
    setVisibleMessageCount(INITIAL_MESSAGE_LIMIT)
  }, [contextId, contextType, loadChat])

  // Compute visible messages (show most recent, with option to load more)
  const { visibleMessages, hiddenCount } = useMemo(() => {
    const totalCount = messages.length
    const startIndex = Math.max(0, totalCount - visibleMessageCount)
    return {
      visibleMessages: messages.slice(startIndex),
      hiddenCount: startIndex
    }
  }, [messages, visibleMessageCount])

  // Load more older messages
  const handleLoadMore = useCallback(() => {
    setVisibleMessageCount(prev => prev + LOAD_MORE_INCREMENT)
  }, [])

  // Force scroll to bottom - called whenever content changes
  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current
    if (container) {
      // Use requestAnimationFrame for smoother scrolling after DOM updates
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      })
    }
  }, [])

  // Auto-scroll to bottom when messages change, streaming content updates, or tool usage
  useEffect(() => {
    // Immediate scroll
    scrollToBottom()

    // Fallback scroll after a short delay to handle async DOM updates
    const timeoutId = setTimeout(scrollToBottom, 100)

    return () => clearTimeout(timeoutId)
  }, [messages, messages.length, streamingContent, activeToolUse, scrollToBottom])

  const handleClear = useCallback(() => {
    if (onClear) {
      onClear()
    } else {
      clearMessages()
    }
  }, [onClear, clearMessages])

  return (
    <div className={`chat-panel ${className}`}>
      {/* Header */}
      <div className="chat-panel__header">
        <div className="chat-panel__header-top">
          {agentName && <h3 className="chat-panel__header-title">{agentName}</h3>}
          <div className="chat-panel__header-actions">
            {onShowLogs && (
              <button
                onClick={onShowLogs}
                className="chat-panel__icon-btn"
                title="View agent logs"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={handleClear}
              className="chat-panel__clear-btn"
              title="Clear chat messages"
            >
              Clear
            </button>
          </div>
        </div>
        {/* Token progress bar under title */}
        {contextType === 'feature' && projectPath && (
          <TokenProgress
            sessionId={sessionId}
            featureId={contextId}
            projectRoot={projectPath}
          />
        )}
      </div>

      {/* Messages area */}
      <div className="chat-panel__messages" ref={messagesContainerRef}>
        {isLoading ? (
          <div className="chat-panel__loading">Loading chat...</div>
        ) : messages.length === 0 && !streamingContent ? (
          <div className="chat-panel__empty">
            No messages yet. Start a conversation.
          </div>
        ) : (
          <div className="chat-panel__messages-list">
            {/* Load more button for older messages */}
            {hiddenCount > 0 && (
              <button
                onClick={handleLoadMore}
                className="chat-panel__load-more"
              >
                Show {Math.min(hiddenCount, LOAD_MORE_INCREMENT)} older messages
                ({hiddenCount} hidden)
              </button>
            )}
            {visibleMessages.map((m) => (
              <ChatMessage key={m.id} message={m} />
            ))}
          </div>
        )}
        {/* Tool usage display */}
        {activeToolUse && (
          <ToolUsageDisplay
            toolName={activeToolUse.name}
            input={activeToolUse.input}
            result={activeToolUse.result}
            isLoading={!activeToolUse.result}
          />
        )}
        {/* Streaming response */}
        {streamingContent && (
          <div className="chat-panel__streaming">
            <div className="chat-panel__streaming-role">Assistant</div>
            <div className="chat-panel__streaming-content">
              {streamingContent}
              <span className="chat-panel__streaming-cursor">|</span>
            </div>
          </div>
        )}
        {/* Stop button during streaming */}
        {isResponding && (
          <div className="chat-panel__thinking">
            {!streamingContent && (
              <span className="chat-panel__thinking-text">AI is thinking...</span>
            )}
            <button onClick={abortAgent} className="chat-panel__stop-btn">
              Stop generating
            </button>
          </div>
        )}
      </div>

      {/* Input area - isolated component to prevent re-renders */}
      <ChatInput />
    </div>
  )
}
