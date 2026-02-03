import { memo, useState, useCallback, type JSX, type KeyboardEvent } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { Button } from '../UI'

/**
 * Isolated chat input component that only subscribes to the minimal store state.
 * This prevents re-renders when messages or streaming content changes.
 */
function ChatInputComponent(): JSX.Element {
  const [inputValue, setInputValue] = useState('')

  // Only subscribe to the specific values we need - NOT messages, streamingContent, etc.
  const isResponding = useChatStore((state) => state.isResponding)
  const addMessage = useChatStore((state) => state.addMessage)
  const sendToAgent = useChatStore((state) => state.sendToAgent)

  const handleSend = useCallback(async () => {
    const trimmedValue = inputValue.trim()
    if (!trimmedValue || isResponding) return

    // Add user message to store
    addMessage({
      role: 'user',
      content: trimmedValue
    })

    setInputValue('')

    // Send to agent (reads messages from store)
    await sendToAgent()
  }, [inputValue, addMessage, sendToAgent, isResponding])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
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
  )
}

export const ChatInput = memo(ChatInputComponent)
