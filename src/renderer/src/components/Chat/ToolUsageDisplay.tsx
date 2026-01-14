import type { JSX } from 'react'

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
    <div className="bg-gray-800/50 rounded-lg p-2 my-2 border border-gray-700">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-purple-400 font-mono">{toolName}</span>
        {isLoading && <span className="text-yellow-400 animate-pulse">Running...</span>}
        {result && <span className="text-green-400 text-xs">Done</span>}
      </div>

      {/* Tool input (for Grep/Glob show pattern) */}
      {inputDisplay && (
        <div className="text-xs text-gray-500 mt-1 font-mono truncate">{inputDisplay}</div>
      )}

      {/* Tool result (collapsible for large results) */}
      {result && (
        <details className="mt-2">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
            View result ({result.length} chars)
          </summary>
          <pre className="mt-1 text-xs text-gray-400 bg-gray-900 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
            {result.slice(0, 500)}
            {result.length > 500 && '...'}
          </pre>
        </details>
      )}
    </div>
  )
}
