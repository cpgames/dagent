import type { JSX } from 'react'
import type { ChatMessage as ChatMessageType } from '../../stores/chat-store'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps): JSX.Element {
  const isUser = message.role === 'user'

  return (
    <div
      className={`rounded-lg p-3 max-w-[80%] ${
        isUser ? 'bg-blue-900/50 ml-auto' : 'bg-gray-700 mr-auto'
      }`}
    >
      <div className="text-sm text-gray-400 mb-1">{isUser ? 'You' : 'AI'}</div>
      <div className="whitespace-pre-wrap text-white">{message.content}</div>
    </div>
  )
}
