import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { ChatMessage } from './ChatMessage'
import { ToolUsageDisplay } from './ToolUsageDisplay'

interface FeatureChatProps {
  featureId: string
}

export function FeatureChat({ featureId }: FeatureChatProps): JSX.Element {
  const {
    messages,
    loadChat,
    addMessage,
    sendToAgent,
    abortAgent,
    refreshContext,
    isLoading,
    isResponding,
    streamingContent,
    activeToolUse,
    contextLoaded
  } = useChatStore()
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load chat when featureId changes
  useEffect(() => {
    loadChat(featureId)
  }, [featureId, loadChat])

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

  return (
    <div className="w-80 flex flex-col border-l border-gray-700 bg-gray-900">
      {/* Header */}
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="font-semibold text-white">Feature Chat</h3>
        <div className="flex items-center gap-2">
          {contextLoaded ? (
            <span className="text-xs text-green-400" title="AI has feature context">
              Context loaded
            </span>
          ) : (
            <span className="text-xs text-yellow-400">No context</span>
          )}
          <button
            onClick={refreshContext}
            className="text-xs text-gray-400 hover:text-white"
            title="Refresh feature context"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <div className="text-gray-400 text-center">Loading chat...</div>
        ) : messages.length === 0 && !streamingContent ? (
          <div className="text-gray-400 text-center text-sm">
            No messages yet. Start a conversation about this feature.
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
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
        <button
          disabled
          className="px-2 py-1 text-xs rounded bg-neutral-700 text-neutral-400 cursor-not-allowed opacity-60 mb-2"
          title="Coming soon: AI will analyze your graph and suggest dependency changes"
        >
          <span className="flex items-center gap-1">
            Re-evaluate deps
            <span className="text-[10px]">(Soon)</span>
          </span>
        </button>
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
