import { memo, useState, type JSX } from 'react'
import type { ChatMessage as ChatMessageType } from '@shared/types/session'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './ChatMessage.css'

interface ChatMessageProps {
  message: ChatMessageType
}

// Memoize to prevent re-renders when parent updates but message hasn't changed
export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps): JSX.Element {
  const isUser = message.role === 'user'
  const [showToolList, setShowToolList] = useState(false)

  // Preserve newlines by converting to Markdown line breaks (two trailing spaces)
  const content = message.content.replace(/\n/g, '  \n')

  const toolUses = message.metadata?.toolUses || []
  const hasToolUses = toolUses.length > 0

  return (
    <div className={`chat-message ${isUser ? 'chat-message--user' : 'chat-message--assistant'}`}>
      <div className="chat-message__role">{isUser ? 'You' : 'AI'}</div>
      <div className="chat-message__content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Style code blocks
            code: ({ node, className, children, ...props }) => {
              const isInline = !className?.includes('language-')
              return isInline ? (
                <code className="chat-message__inline-code" {...props}>
                  {children}
                </code>
              ) : (
                <pre className="chat-message__code-block">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              )
            },
            // Style links
            a: ({ node, children, ...props }) => (
              <a className="chat-message__link" target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            ),
            // Style lists
            ul: ({ node, children, ...props }) => (
              <ul className="chat-message__list" {...props}>
                {children}
              </ul>
            ),
            ol: ({ node, children, ...props }) => (
              <ol className="chat-message__list chat-message__list--ordered" {...props}>
                {children}
              </ol>
            ),
            // Style blockquotes
            blockquote: ({ node, children, ...props }) => (
              <blockquote className="chat-message__blockquote" {...props}>
                {children}
              </blockquote>
            )
          }}
        >
          {content}
        </ReactMarkdown>
        {hasToolUses && (
          <div
            className="chat-message__tools"
            onMouseEnter={() => setShowToolList(true)}
            onMouseLeave={() => setShowToolList(false)}
          >
            <span className="chat-message__tools-count">
              🔧 {toolUses.length} tool{toolUses.length > 1 ? 's' : ''} used
            </span>
            {showToolList && (
              <div className="chat-message__tools-list">
                {toolUses.map((tool, index) => (
                  <div key={index} className="chat-message__tool-item">
                    <span className="chat-message__tool-name">{tool.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
