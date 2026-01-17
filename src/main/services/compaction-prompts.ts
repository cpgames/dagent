/**
 * Compaction Prompt Builder
 *
 * Generates prompts for Claude to compact conversation history into checkpoint summaries.
 * Handles both initial compactions (no checkpoint) and incremental updates (existing checkpoint).
 */

import type { ChatMessage, Checkpoint } from '../../shared/types/session'

/**
 * Build a compaction prompt for Claude to merge messages into checkpoint.
 *
 * Takes an existing checkpoint (or null for first compaction) and an array of messages,
 * and generates a structured prompt for Claude to create an updated checkpoint summary.
 *
 * @param checkpoint - Current checkpoint (or null for first compaction)
 * @param messages - Messages to incorporate into checkpoint
 * @returns Compaction prompt string
 */
export function buildCompactionPrompt(
  checkpoint: Checkpoint | null,
  messages: ChatMessage[]
): string {
  if (messages.length === 0) {
    throw new Error('Cannot build compaction prompt with empty messages array')
  }

  const sections: string[] = []

  sections.push('You are compacting a conversation history into a checkpoint summary.')
  sections.push('')
  sections.push(
    'Your task is to analyze the conversation and create a structured summary that captures:'
  )
  sections.push('- What has been completed')
  sections.push('- What is currently in progress')
  sections.push('- What is still pending')
  sections.push('- Any blockers encountered')
  sections.push('- Key decisions made')
  sections.push('')

  // Include existing checkpoint if available
  if (checkpoint) {
    sections.push('## Current Checkpoint')
    sections.push('')
    sections.push('The existing checkpoint contains:')
    sections.push('')

    if (checkpoint.summary.completed.length > 0) {
      sections.push('**Completed:**')
      checkpoint.summary.completed.forEach((item) => sections.push(`- ${item}`))
      sections.push('')
    } else {
      sections.push('**Completed:** (none)')
      sections.push('')
    }

    if (checkpoint.summary.inProgress.length > 0) {
      sections.push('**In Progress:**')
      checkpoint.summary.inProgress.forEach((item) => sections.push(`- ${item}`))
      sections.push('')
    } else {
      sections.push('**In Progress:** (none)')
      sections.push('')
    }

    if (checkpoint.summary.pending.length > 0) {
      sections.push('**Pending:**')
      checkpoint.summary.pending.forEach((item) => sections.push(`- ${item}`))
      sections.push('')
    } else {
      sections.push('**Pending:** (none)')
      sections.push('')
    }

    if (checkpoint.summary.blockers.length > 0) {
      sections.push('**Blockers:**')
      checkpoint.summary.blockers.forEach((item) => sections.push(`- ${item}`))
      sections.push('')
    } else {
      sections.push('**Blockers:** (none)')
      sections.push('')
    }

    if (checkpoint.summary.decisions.length > 0) {
      sections.push('**Key Decisions:**')
      checkpoint.summary.decisions.forEach((item) => sections.push(`- ${item}`))
      sections.push('')
    } else {
      sections.push('**Key Decisions:** (none)')
      sections.push('')
    }
  } else {
    sections.push('## Current Checkpoint')
    sections.push('')
    sections.push('This is the first compaction. No existing checkpoint.')
    sections.push('')
  }

  // Include messages to process
  sections.push('## New Messages to Incorporate')
  sections.push('')
  sections.push(`You need to incorporate ${messages.length} new messages:`)
  sections.push('')

  messages.forEach((message, idx) => {
    const role = message.role === 'user' ? 'User' : 'Assistant'
    sections.push(`### Message ${idx + 1} (${role})`)
    sections.push(message.content)
    sections.push('')
  })

  // Instructions for output
  sections.push('## Task')
  sections.push('')
  sections.push('Create an updated checkpoint summary that:')
  sections.push('1. Merges information from the new messages into the existing checkpoint')
  sections.push(
    '2. Moves items between categories as appropriate (e.g., in_progress → completed)'
  )
  sections.push('3. Adds new items discovered in the messages')
  sections.push('4. Removes obsolete or resolved items')
  sections.push('5. Maintains chronological order within each category')
  sections.push('6. Captures the current state of the work accurately')
  sections.push('')
  sections.push('**IMPORTANT:** Output ONLY valid JSON matching this structure:')
  sections.push('')
  sections.push('{')
  sections.push('  "completed": ["item 1", "item 2", ...],')
  sections.push('  "inProgress": ["item 1", "item 2", ...],')
  sections.push('  "pending": ["item 1", "item 2", ...],')
  sections.push('  "blockers": ["item 1", "item 2", ...],')
  sections.push('  "decisions": ["decision 1", "decision 2", ...]')
  sections.push('}')
  sections.push('')
  sections.push(
    'Do NOT include any explanation, commentary, or markdown formatting. Only output the JSON object.'
  )

  return sections.join('\n')
}

/**
 * Parse compaction result from Claude's response.
 *
 * Validates that the response is valid JSON matching the Checkpoint.summary structure.
 * Throws detailed errors if parsing fails.
 *
 * @param response - Claude's response text
 * @returns Validated checkpoint summary
 */
export function parseCompactionResult(response: string): Checkpoint['summary'] {
  if (!response || response.trim().length === 0) {
    throw new Error('Compaction response is empty')
  }

  // Try to extract JSON from response (in case Claude wrapped it in markdown)
  let jsonText = response.trim()

  // Remove markdown code blocks if present
  if (jsonText.startsWith('```')) {
    const lines = jsonText.split('\n')
    // Remove first line (```json or ```)
    lines.shift()
    // Remove last line (```)
    if (lines[lines.length - 1].trim() === '```') {
      lines.pop()
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
  const requiredFields = ['completed', 'inProgress', 'pending', 'blockers', 'decisions']
  const missingFields = requiredFields.filter((field) => !(field in result))

  if (missingFields.length > 0) {
    throw new Error(`Compaction response missing required fields: ${missingFields.join(', ')}`)
  }

  // Validate field types
  for (const field of requiredFields) {
    if (!Array.isArray(result[field])) {
      throw new Error(`Compaction response field '${field}' must be an array`)
    }

    // Validate all array elements are strings
    const arr = result[field] as unknown[]
    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== 'string') {
        throw new Error(`Compaction response field '${field}[${i}]' must be a string`)
      }
    }
  }

  // Return validated summary
  return {
    completed: result.completed as string[],
    inProgress: result.inProgress as string[],
    pending: result.pending as string[],
    blockers: result.blockers as string[],
    decisions: result.decisions as string[]
  }
}
