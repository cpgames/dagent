/**
 * Compaction Prompt Builder
 *
 * Generates prompts for Claude to compact conversation history into importance-based summaries.
 * Creates concise, spec-like checkpoints prioritized by importance level.
 */

import type { ChatMessage, Memory } from '../../shared/types/session'

// Token limit for compacted content (~1000 tokens ≈ 4000 chars)
const COMPACTION_TOKEN_LIMIT = 1000
const CHARS_PER_TOKEN = 4
const MAX_CHARS = COMPACTION_TOKEN_LIMIT * CHARS_PER_TOKEN

/**
 * Build a compaction prompt for importance-based summarization.
 *
 * @param memory - Current memory (or null for first compaction)
 * @param messages - Messages to incorporate into memory
 * @param context - Optional context hint (e.g., 'feature', 'project')
 * @returns Compaction prompt string
 */
export function buildCompactionPrompt(
  memory: Memory | null,
  messages: ChatMessage[]
): string {
  if (messages.length === 0) {
    throw new Error('Cannot build compaction prompt with empty messages array')
  }

  const sections: string[] = []

  sections.push('Compact this conversation into an importance-prioritized summary.')
  sections.push('')
  sections.push('Extract key information and categorize by importance:')
  sections.push('- **critical**: Core purpose, essential requirements, fundamental constraints')
  sections.push('- **important**: Key requirements, significant decisions, notable specifications')
  sections.push('- **minor**: Nice-to-haves, preferences, minor details')
  sections.push('')
  sections.push('Rules:')
  sections.push('- Be concise - write spec-like statements, not narratives')
  sections.push('- No "user said/asked" or "assistant suggested" - just state facts')
  sections.push('- Merge duplicate/related items')
  sections.push('- LIMIT: Keep total output under ~1000 tokens')
  sections.push('- When over limit: drop minor items first, then important items')
  sections.push('- Critical items are NEVER dropped - consolidate if needed')
  sections.push('- New info can REPLACE old items of same/lower priority')
  sections.push('')

  // Include existing memory if available
  if (memory) {
    sections.push('## Existing Summary')
    sections.push('')

    if (memory.summary.critical.length > 0) {
      sections.push('Critical:')
      memory.summary.critical.forEach((item) => sections.push(`- ${item}`))
    }

    if (memory.summary.important.length > 0) {
      sections.push('Important:')
      memory.summary.important.forEach((item) => sections.push(`- ${item}`))
    }

    if (memory.summary.minor.length > 0) {
      sections.push('Minor:')
      memory.summary.minor.forEach((item) => sections.push(`- ${item}`))
    }

    sections.push('')
  }

  // Include messages to process
  sections.push('## New Conversation')
  sections.push('')

  messages.forEach((message) => {
    const role = message.role === 'user' ? 'U' : 'A'
    sections.push(`[${role}] ${message.content}`)
    sections.push('')
  })

  // Output format
  sections.push('## Output')
  sections.push('')
  sections.push('Output ONLY valid JSON:')
  sections.push('')
  sections.push('{')
  sections.push('  "critical": ["statement 1", "statement 2"],')
  sections.push('  "important": ["statement 1", "statement 2"],')
  sections.push('  "minor": ["statement 1", "statement 2"]')
  sections.push('}')

  return sections.join('\n')
}

/**
 * Parse compaction result from Claude's response.
 *
 * @param response - Claude's response text
 * @returns Validated memory summary
 */
export function parseCompactionResult(response: string): Memory['summary'] {
  if (!response || response.trim().length === 0) {
    throw new Error('Compaction response is empty')
  }

  // Extract JSON from response (handle markdown code blocks)
  let jsonText = response.trim()

  if (jsonText.startsWith('```')) {
    const lines = jsonText.split('\n')
    lines.shift() // Remove opening ```
    if (lines[lines.length - 1].trim() === '```') {
      lines.pop() // Remove closing ```
    }
    jsonText = lines.join('\n').trim()
  }

  // Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (error) {
    throw new Error(
      `Failed to parse compaction response as JSON: ${error instanceof Error ? error.message : 'Unknown error'}\n\nResponse:\n${response.substring(0, 500)}`
    )
  }

  // Validate structure
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Compaction response is not a valid object')
  }

  const result = parsed as Record<string, unknown>

  // Validate required fields
  const requiredFields = ['critical', 'important', 'minor']
  const missingFields = requiredFields.filter((field) => !(field in result))

  if (missingFields.length > 0) {
    throw new Error(`Compaction response missing required fields: ${missingFields.join(', ')}`)
  }

  // Validate field types
  for (const field of requiredFields) {
    if (!Array.isArray(result[field])) {
      throw new Error(`Compaction response field '${field}' must be an array`)
    }

    const arr = result[field] as unknown[]
    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== 'string') {
        throw new Error(`Compaction response field '${field}[${i}]' must be a string`)
      }
    }
  }

  // Enforce token limit by trimming minor items first, then important
  const summary = {
    critical: result.critical as string[],
    important: result.important as string[],
    minor: result.minor as string[]
  }

  return enforceTokenLimit(summary, MAX_CHARS)
}

/**
 * Enforce token limit on summary, dropping items from lowest priority first.
 */
function enforceTokenLimit(
  summary: Memory['summary'],
  maxChars: number
): Memory['summary'] {
  const estimateChars = (items: string[]): number => {
    return items.reduce((sum, item) => sum + item.length + 10, 0) // +10 for formatting
  }

  const totalChars = (): number => {
    return (
      estimateChars(summary.critical) +
      estimateChars(summary.important) +
      estimateChars(summary.minor)
    )
  }

  // Drop minor items first
  while (totalChars() > maxChars && summary.minor.length > 0) {
    summary.minor.pop()
  }

  // Drop important items if still over limit
  while (totalChars() > maxChars && summary.important.length > 0) {
    summary.important.pop()
  }

  // Critical items are never dropped (design decision)

  return summary
}
