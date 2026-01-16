import type { JSX } from 'react'
import type { ChatMessage as ChatMessageType } from '../../stores/chat-store'
import './ChatMessage.css'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps): JSX.Element {
  const isUser = message.role === 'user'

  return (
    <div className={`chat-message ${isUser ? 'chat-message--user' : 'chat-message--assistant'}`}>
      <div className="chat-message__role">{isUser ? 'You' : 'AI'}</div>
      <div className="chat-message__content">{message.content}</div>
    </div>
  )
}
