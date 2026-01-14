// src/main/agent/agent-service.ts
// SDK types - defined locally to avoid static import issues with ES modules
type SDKQuery = AsyncIterable<SDKMessage> & { interrupt: () => Promise<void> }
type SDKMessage = {
  type: string
  subtype?: string
  message?: {
    content: Array<{ type: string; text?: string; name?: string; input?: unknown }>
  }
  result?: string
  errors?: string[]
}

import type { AgentQueryOptions, AgentStreamEvent } from './types'
import { getToolsForPreset } from './tool-config'

// Dynamic import cache for ES module - use 'any' to avoid type conflicts with SDK
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdkModule: any = null

async function getSDK(): Promise<{ query: (opts: unknown) => SDKQuery } | null> {
  if (!sdkModule) {
    try {
      // Dynamic import for ES module compatibility
      sdkModule = await import('@anthropic-ai/claude-agent-sdk')
    } catch (error) {
      console.error('Failed to load Claude Agent SDK:', error)
      return null
    }
  }
  return sdkModule
}

export class AgentService {
  private activeQuery: SDKQuery | null = null
  private lastToolUse: { name: string; input: unknown } | null = null

  async *streamQuery(options: AgentQueryOptions): AsyncGenerator<AgentStreamEvent> {
    try {
      // Dynamically import the SDK (ES module)
      const sdk = await getSDK()
      if (!sdk) {
        yield { type: 'error', error: 'Claude Agent SDK not available' }
        return
      }

      // Resolve tools from preset or explicit list
      const tools =
        options.allowedTools || (options.toolPreset ? getToolsForPreset(options.toolPreset) : [])

      const queryOptions: Record<string, unknown> = {
        cwd: options.cwd,
        allowedTools: tools,
        permissionMode: options.permissionMode || 'default'
      }

      // Add system prompt if provided
      if (options.systemPrompt) {
        queryOptions.systemPrompt = options.systemPrompt
      }

      this.activeQuery = sdk.query({
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
    if (sdkMessage.type === 'assistant' && sdkMessage.message) {
      // Extract text content from the message
      const textParts: string[] = []
      let toolUseBlock: { name: string; input: unknown } | null = null

      for (const block of sdkMessage.message.content) {
        if (block.type === 'text' && block.text) {
          textParts.push(block.text)
        } else if (block.type === 'tool_use' && block.name) {
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
        // Track last tool use to correlate with results
        this.lastToolUse = toolUseBlock
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

    // Handle user messages (which include tool results)
    if (sdkMessage.type === 'user' && sdkMessage.message) {
      // Check if this is a tool result (user messages with tool_result content blocks)
      for (const block of sdkMessage.message.content) {
        // Block can be string or object - only check objects with type property
        if (typeof block === 'object' && block !== null && 'type' in block && block.type === 'tool_result') {
          const toolBlock = block as { type: 'tool_result'; content?: unknown }
          const resultContent =
            typeof toolBlock.content === 'string'
              ? toolBlock.content
              : Array.isArray(toolBlock.content)
                ? (toolBlock.content as Array<{ type: string; text?: string }>)
                    .filter((c) => c.type === 'text' && c.text)
                    .map((c) => c.text!)
                    .join('')
                : ''

          return {
            type: 'tool_result',
            message: {
              type: 'result',
              content: resultContent.slice(0, 500), // Truncate for display
              timestamp: new Date().toISOString(),
              toolName: this.lastToolUse?.name,
              toolInput: this.lastToolUse?.input,
              toolResult: resultContent
            }
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
            content: sdkMessage.result || '',
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
