import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { useProjectStore } from '../../stores/project-store'
import { ChatMessage } from './ChatMessage'
import { ToolUsageDisplay } from './ToolUsageDisplay'
import { TokenProgress } from './TokenProgress'
import { Button } from '../UI'
import './ChatPanel.css'

interface ChatPanelProps {
  agentName: string
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
    addMessage,
    sendToAgent,
    abortAgent,
    clearMessages,
    isLoading,
    isResponding,
    streamingContent,
    activeToolUse,
    sessionId
  } = useChatStore()
  const projectPath = useProjectStore((state) => state.projectPath)
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load chat when contextId or contextType changes
  useEffect(() => {
    loadChat(contextId, contextType)
  }, [contextId, contextType, loadChat])

  // Auto-scroll to bottom when messages change, streaming content updates, or tool usage
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, activeToolUse])

  const handleSend = useCallback(async () => {
    const trimmedValue = inputValue.trim()
    if (!trimmedValue || isResponding) return

    addMessage({
      role: 'user',
      content: trimmedValue
    })
    setInputValue('')

    // Trigger streaming AI response via Agent SDK
    await sendToAgent()
  }, [inputValue, addMessage, sendToAgent, isResponding])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends, Shift+Enter for newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

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
        <h3 className="chat-panel__header-title">{agentName}</h3>
        <div className="chat-panel__header-actions">
          {/* Token progress bar */}
          {contextType === 'feature' && projectPath && (
            <TokenProgress
              sessionId={sessionId}
              featureId={contextId}
              projectRoot={projectPath}
            />
          )}
          {onShowLogs && (
            <button
              onClick={onShowLogs}
              className="chat-panel__icon-btn"
              title="View PM agent communication logs"
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

      {/* Messages area */}
      <div className="chat-panel__messages">
        {isLoading ? (
          <div className="chat-panel__loading">Loading chat...</div>
        ) : messages.length === 0 && !streamingContent ? (
          <div className="chat-panel__empty">
            No messages yet. Start a conversation.
          </div>
        ) : (
          <div className="chat-panel__messages-list">
            {messages.map((m) => (
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
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-panel__input-area">
        <div className="chat-panel__input-row">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isResponding}
            className="chat-panel__textarea"
            rows={2}
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isResponding}
            size="md"
          >
            {isResponding ? 'Thinking...' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}
