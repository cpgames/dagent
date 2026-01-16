import type { JSX } from 'react'
import './ToolUsageDisplay.css'

interface ToolUsageDisplayProps {
  toolName: string
  input?: unknown
  result?: string
  isLoading: boolean
}

export function ToolUsageDisplay({
  toolName,
  input,
  result,
  isLoading
}: ToolUsageDisplayProps): JSX.Element {
  // Format tool input for display
  const formatInput = (inp: unknown): string => {
    if (!inp) return ''
    if (typeof inp === 'object' && inp !== null) {
      const obj = inp as Record<string, unknown>
      if ('pattern' in obj) {
        return `Pattern: ${obj.pattern}`
      }
      if ('file_path' in obj) {
        return `File: ${obj.file_path}`
      }
      if ('path' in obj) {
        return `Path: ${obj.path}`
      }
      return JSON.stringify(obj, null, 2)
    }
    return String(inp)
  }

  const inputDisplay = formatInput(input)

  return (
    <div className="tool-usage">
      <div className="tool-usage__header">
        <span className="tool-usage__name">{toolName}</span>
        {isLoading && <span className="tool-usage__status tool-usage__status--running">Running...</span>}
        {result && <span className="tool-usage__status tool-usage__status--done">Done</span>}
      </div>

      {/* Tool input (for Grep/Glob show pattern) */}
      {inputDisplay && (
        <div className="tool-usage__input">{inputDisplay}</div>
      )}

      {/* Tool result (collapsible for large results) */}
      {result && (
        <details className="tool-usage__result">
          <summary className="tool-usage__summary">
            View result ({result.length} chars)
          </summary>
          <pre className="tool-usage__result-content">
            {result.slice(0, 500)}
            {result.length > 500 && '...'}
          </pre>
        </details>
      )}
    </div>
  )
}
