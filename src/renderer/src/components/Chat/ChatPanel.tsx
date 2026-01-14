import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { ChatMessage } from './ChatMessage'
import { ToolUsageDisplay } from './ToolUsageDisplay'

interface ChatPanelProps {
  agentName: string
  contextId: string
  contextType: 'feature' | 'task' | 'agent'
  onClear?: () => void
  className?: string
}

export function ChatPanel({
  agentName,
  contextId,
  contextType,
  onClear,
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
    activeToolUse
  } = useChatStore()
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
    <div className={`flex flex-col border-l border-gray-700 bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="font-semibold text-white">{agentName}</h3>
        <button
          onClick={handleClear}
          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700"
          title="Clear chat messages"
        >
          Clear
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '16px' }}>
        {isLoading ? (
          <div className="text-gray-400 text-center">Loading chat...</div>
        ) : messages.length === 0 && !streamingContent ? (
          <div className="text-gray-400 text-center text-sm">
            No messages yet. Start a conversation.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
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
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-sm text-gray-400 mb-1">Assistant</div>
            <div className="text-gray-200 whitespace-pre-wrap">
              {streamingContent}
              <span className="animate-pulse text-blue-400">|</span>
            </div>
          </div>
        )}
        {/* Stop button during streaming */}
        {isResponding && (
          <div className="flex items-center gap-2">
            {!streamingContent && (
              <span className="text-gray-400 text-sm animate-pulse">AI is thinking...</span>
            )}
            <button
              onClick={abortAgent}
              className="text-red-400 text-sm hover:text-red-300 underline"
            >
              Stop generating
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-gray-700">
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isResponding}
            className="flex-1 bg-gray-800 text-white rounded px-3 py-2 resize-none border border-gray-600 focus:border-blue-500 focus:outline-none text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isResponding}
            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isResponding ? 'Thinking...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
