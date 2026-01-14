// src/main/agent/agent-service.ts
import { query, type Query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentQueryOptions, AgentStreamEvent } from './types'

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
      const textParts: string[] = []
      let toolUseBlock: { name: string; input: unknown } | null = null

      for (const block of sdkMessage.message.content) {
        if (block.type === 'text') {
          textParts.push(block.text)
        } else if (block.type === 'tool_use') {
          toolUseBlock = { name: block.name, input: block.input }
        }
      }

      const content = textParts.join('')

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

      // Return tool use event if found
      if (toolUseBlock) {
        return {
          type: 'tool_use',
          message: {
            type: 'assistant',
            content: `Using tool: ${toolUseBlock.name}`,
            timestamp: new Date().toISOString(),
            toolName: toolUseBlock.name,
            toolInput: toolUseBlock.input
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
