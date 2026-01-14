// src/main/agent/agent-service.ts
import { query, type Query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentQueryOptions, AgentStreamEvent, AgentMessage } from './types'

export class AgentService {
  private activeQuery: Query | null = null

  async *streamQuery(options: AgentQueryOptions): AsyncGenerator<AgentStreamEvent> {
    try {
      const queryOptions: Options = {
        cwd: options.cwd,
        allowedTools: options.allowedTools || [],
        permissionMode: options.permissionMode || 'default'
      }

      // Add system prompt if provided
      if (options.systemPrompt) {
        queryOptions.systemPrompt = options.systemPrompt
      }

      this.activeQuery = query({
        prompt: options.prompt,
        options: queryOptions
      })

      for await (const message of this.activeQuery) {
        const event = this.convertMessage(message)
        if (event) {
          yield event
        }
      }

      yield { type: 'done' }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Agent query failed'
      }
    } finally {
      this.activeQuery = null
    }
  }

  private convertMessage(sdkMessage: SDKMessage): AgentStreamEvent | null {
    // Handle assistant messages
    if (sdkMessage.type === 'assistant') {
      // Extract text content from the message
      const content = sdkMessage.message.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join('')

      if (content) {
        return {
          type: 'message',
          message: {
            type: 'assistant',
            content,
            timestamp: new Date().toISOString()
          }
        }
      }

      // Check for tool use blocks
      const toolUseBlocks = sdkMessage.message.content.filter(
        (block): block is { type: 'tool_use'; id: string; name: string; input: unknown } =>
          block.type === 'tool_use'
      )

      if (toolUseBlocks.length > 0) {
        const toolBlock = toolUseBlocks[0]
        return {
          type: 'tool_use',
          message: {
            type: 'assistant',
            content: `Using tool: ${toolBlock.name}`,
            timestamp: new Date().toISOString(),
            toolName: toolBlock.name,
            toolInput: toolBlock.input
          }
        }
      }
    }

    // Handle result messages
    if (sdkMessage.type === 'result') {
      if (sdkMessage.subtype === 'success') {
        return {
          type: 'message',
          message: {
            type: 'result',
            content: sdkMessage.result,
            timestamp: new Date().toISOString()
          }
        }
      } else {
        return {
          type: 'error',
          error: sdkMessage.errors?.join(', ') || 'Query failed'
        }
      }
    }

    // Handle system messages
    if (sdkMessage.type === 'system') {
      return {
        type: 'message',
        message: {
          type: 'system',
          content: `System: ${sdkMessage.subtype}`,
          timestamp: new Date().toISOString()
        }
      }
    }

    return null
  }

  abort(): void {
    if (this.activeQuery) {
      // Query interface doesn't have abort, use interrupt instead
      this.activeQuery.interrupt().catch(() => {
        // Ignore interrupt errors
      })
      this.activeQuery = null
    }
  }
}

let agentService: AgentService | null = null

export function getAgentService(): AgentService {
  if (!agentService) {
    agentService = new AgentService()
  }
  return agentService
}
