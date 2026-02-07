/**
 * Token Estimator Service
 *
 * Estimates token counts for text content to determine when compaction is needed.
 * Uses approximation: ~4 characters per token (conservative estimate).
 *
 * NOTE: For production, consider using tiktoken library for accurate counting.
 * Current implementation prioritizes simplicity and zero dependencies.
 */

import type { TokenEstimate, ChatMessage, Memory, SessionContext, AgentDescription } from '../../shared/types/session'

/**
 * Token limit threshold (100k tokens).
 * When total request exceeds this, compaction is triggered.
 */
export const TOKEN_LIMIT = 100_000

/**
 * Conservative approximation: 4 characters per token.
 * This slightly overestimates to ensure we stay under limits.
 */
const CHARS_PER_TOKEN = 4

/**
 * Token buffer to trigger compaction before hitting the limit.
 * Triggers at 90k tokens to give room for response.
 */
const COMPACTION_THRESHOLD = 90_000

/**
 * Estimate tokens for text content.
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Estimate tokens for an array of chat messages.
 *
 * @param messages - Messages to estimate
 * @returns Total estimated tokens
 */
export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0
  for (const message of messages) {
    // Count content tokens
    total += estimateTokens(message.content)

    // Add overhead for message structure (role, timestamps, etc.)
    total += 10  // ~10 tokens for JSON structure per message

    // Add recorded token counts if available
    if (message.metadata?.tokens) {
      // If we have actual token counts, use those instead of estimate
      total = total - estimateTokens(message.content) + message.metadata.tokens.input + message.metadata.tokens.output
    }
  }
  return total
}

/**
 * Estimate tokens for memory data.
 *
 * @param memory - Memory to estimate
 * @returns Estimated token count
 */
export function estimateMemoryTokens(memory: Memory): number {
  let total = 0

  // Summary sections (importance-based)
  total += estimateTokens(memory.summary.critical.join('\n'))
  total += estimateTokens(memory.summary.important.join('\n'))
  total += estimateTokens(memory.summary.minor.join('\n'))

  // Add overhead for structure
  total += 50  // ~50 tokens for JSON structure

  return total
}

/**
 * Estimate tokens for session context.
 *
 * @param context - Session context to estimate
 * @returns Estimated token count
 */
export function estimateContextTokens(context: SessionContext): number {
  let total = 0

  // Feature info
  total += estimateTokens(context.featureName || '')
  total += estimateTokens(context.featureGoal || '')

  // Task info
  total += estimateTokens(context.taskTitle || '')
  total += estimateTokens(context.dagSummary || '')

  // Dependencies
  if (context.dependencies) {
    total += estimateTokens(context.dependencies.join('\n'))
  }
  if (context.dependents) {
    total += estimateTokens(context.dependents.join('\n'))
  }

  // Project files
  total += estimateTokens(context.projectStructure || '')
  total += estimateTokens(context.claudeMd || '')
  total += estimateTokens(context.projectMd || '')

  // Git commits
  if (context.recentCommits) {
    total += estimateTokens(context.recentCommits.join('\n'))
  }

  // Attachments list
  if (context.attachments) {
    total += estimateTokens(context.attachments.join('\n'))
  }

  // Add overhead for structure
  total += 100  // ~100 tokens for JSON structure

  return total
}

/**
 * Estimate tokens for agent description.
 *
 * @param description - Agent description to estimate
 * @returns Estimated token count
 */
export function estimateAgentDescriptionTokens(description: AgentDescription): number {
  let total = 0

  total += estimateTokens(description.roleInstructions)
  total += estimateTokens(description.toolInstructions || '')

  // Add overhead for structure
  total += 20  // ~20 tokens for JSON structure

  return total
}

/**
 * Format context as system prompt section.
 *
 * @param context - Session context
 * @returns Formatted context string
 */
export function formatContextAsPrompt(context: SessionContext): string {
  const sections: string[] = []

  sections.push('## Project Context')
  sections.push(`**Feature:** ${context.featureName}`)
  if (context.featureGoal) {
    sections.push(`**Goal:** ${context.featureGoal}`)
  }

  if (context.taskId && context.taskTitle) {
    sections.push('')
    sections.push('## Current Task')
    sections.push(`**ID:** ${context.taskId}`)
    sections.push(`**Title:** ${context.taskTitle}`)
    sections.push(`**State:** ${context.taskState || 'unknown'}`)

    if (context.dependencies && context.dependencies.length > 0) {
      sections.push(`**Blocked By:** ${context.dependencies.join(', ')}`)
    }
    if (context.dependents && context.dependents.length > 0) {
      sections.push(`**Blocking:** ${context.dependents.join(', ')}`)
    }
  }

  if (context.dagSummary) {
    sections.push('')
    sections.push('## Task DAG')
    sections.push(context.dagSummary)
  }

  if (context.projectStructure) {
    sections.push('')
    sections.push('## Project Structure')
    sections.push(context.projectStructure)
  }

  if (context.claudeMd) {
    sections.push('')
    sections.push('## CLAUDE.md')
    sections.push(context.claudeMd)
  }

  if (context.projectMd) {
    sections.push('')
    sections.push('## PROJECT.md')
    sections.push(context.projectMd)
  }

  if (context.recentCommits && context.recentCommits.length > 0) {
    sections.push('')
    sections.push('## Recent Commits')
    sections.push(context.recentCommits.join('\n'))
  }

  if (context.attachments && context.attachments.length > 0) {
    sections.push('')
    sections.push('## Attachments')
    sections.push(context.attachments.join('\n'))
  }

  return sections.join('\n')
}

/**
 * Format memory as system prompt section.
 * Uses importance-based prioritization.
 *
 * @param memory - Memory data
 * @returns Formatted memory string
 */
export function formatMemoryAsPrompt(memory: Memory): string {
  const sections: string[] = []

  sections.push('## Context Summary')
  sections.push('')

  if (memory.summary.critical.length > 0) {
    sections.push('**Critical:**')
    memory.summary.critical.forEach(item => sections.push(`- ${item}`))
    sections.push('')
  }

  if (memory.summary.important.length > 0) {
    sections.push('**Important:**')
    memory.summary.important.forEach(item => sections.push(`- ${item}`))
    sections.push('')
  }

  if (memory.summary.minor.length > 0) {
    sections.push('**Minor:**')
    memory.summary.minor.forEach(item => sections.push(`- ${item}`))
    sections.push('')
  }

  return sections.join('\n')
}

/**
 * Format messages as system prompt section.
 *
 * @param messages - Recent chat messages
 * @returns Formatted messages string
 */
export function formatMessagesAsPrompt(messages: ChatMessage[]): string {
  if (messages.length === 0) return ''

  const sections: string[] = []
  sections.push('## Recent Conversation')
  sections.push('')

  for (const message of messages) {
    const role = message.role === 'user' ? 'User' : 'Assistant'
    sections.push(`**${role}** (${new Date(message.timestamp).toLocaleString()}):`)
    sections.push(message.content)
    sections.push('')
  }

  return sections.join('\n')
}

/**
 * Estimate total tokens for a complete agent request.
 *
 * @param options - Request components
 * @returns Token estimate with breakdown
 */
export function estimateRequest(options: {
  agentDescription: AgentDescription
  context: SessionContext
  memory?: Memory
  messages: ChatMessage[]
  userPrompt: string
}): TokenEstimate {
  const agentDescriptionTokens = estimateAgentDescriptionTokens(options.agentDescription)
  const contextTokens = estimateContextTokens(options.context)
  const memoryTokens = options.memory ? estimateMemoryTokens(options.memory) : 0
  const messagesTokens = estimateMessagesTokens(options.messages)
  const userPromptTokens = estimateTokens(options.userPrompt)

  // System prompt = Agent Description + Context + Memory + Messages
  const systemPromptTokens = agentDescriptionTokens + contextTokens + memoryTokens + messagesTokens

  const total = systemPromptTokens + userPromptTokens

  return {
    systemPrompt: systemPromptTokens,
    messages: messagesTokens,
    userPrompt: userPromptTokens,
    total,
    limit: TOKEN_LIMIT,
    needsCompaction: total > COMPACTION_THRESHOLD
  }
}

/**
 * Calculate how many tokens would be reclaimed by compacting messages.
 * This helps decide if compaction is worth doing.
 *
 * @param messages - Messages that would be compacted
 * @param currentMemory - Current memory (if any)
 * @returns Estimated tokens reclaimed
 */
export function estimateTokensReclaimed(
  messages: ChatMessage[],
  currentMemory?: Memory
): number {
  const currentMessagesTokens = estimateMessagesTokens(messages)
  const currentMemoryTokens = currentMemory ? estimateMemoryTokens(currentMemory) : 0

  // Assume new memory will be ~30% of original size (conservative estimate)
  // This is based on Claude's ability to compress conversation into summary
  const estimatedNewMemoryTokens = (currentMessagesTokens + currentMemoryTokens) * 0.3

  // Tokens reclaimed = (current messages + current memory) - new memory
  const reclaimed = (currentMessagesTokens + currentMemoryTokens) - estimatedNewMemoryTokens

  return Math.max(0, reclaimed)
}

/**
 * Determine optimal number of messages to keep after compaction.
 * Keeps most recent N messages that fit within safe limit.
 *
 * @param allMessages - All messages in session
 * @param maxTokens - Maximum tokens to allocate for messages (default: 10k)
 * @returns Number of recent messages to keep
 */
export function determineMessagesToKeep(
  allMessages: ChatMessage[],
  maxTokens: number = 10_000
): number {
  let tokens = 0
  let count = 0

  // Count from most recent backwards
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const messageTokens = estimateTokens(allMessages[i].content) + 10
    if (tokens + messageTokens > maxTokens) {
      break
    }
    tokens += messageTokens
    count++
  }

  // Always keep at least 1 message if available
  return Math.max(1, count)
}
