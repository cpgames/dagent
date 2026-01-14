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
import { buildAgentPrompt } from './prompt-builders'
import { createPMMcpServer, getPMToolNamesForAllowedTools } from './pm-mcp-server'

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
  // Cache the PM MCP server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pmMcpServer: any = null

  async *streamQuery(options: AgentQueryOptions): AsyncGenerator<AgentStreamEvent> {
    try {
      // Dynamically import the SDK (ES module)
      const sdk = await getSDK()
      if (!sdk) {
        yield { type: 'error', error: 'Claude Agent SDK not available' }
        return
      }

      // Check if PM tools are needed
      const isPMAgent = options.toolPreset === 'pmAgent' || options.agentType === 'pm'

      // Resolve tools from preset or explicit list
      let tools =
        options.allowedTools || (options.toolPreset ? getToolsForPreset(options.toolPreset) : [])

      // For PM Agent, replace PM tool names with MCP-prefixed names
      if (isPMAgent) {
        // Filter out the old PM tool names (they won't work without MCP)
        const pmToolNames = ['CreateTask', 'ListTasks', 'AddDependency', 'RemoveDependency', 'GetTask', 'UpdateTask', 'DeleteTask']
        tools = tools.filter(t => !pmToolNames.includes(t))
        // Add the MCP-prefixed tool names
        tools = [...tools, ...getPMToolNamesForAllowedTools()]
      }

      const queryOptions: Record<string, unknown> = {
        cwd: options.cwd,
        allowedTools: tools,
        permissionMode: options.permissionMode || 'default'
      }

      // Add PM MCP server if PM tools are needed
      if (isPMAgent) {
        if (!this.pmMcpServer) {
          this.pmMcpServer = await createPMMcpServer()
        }
        if (this.pmMcpServer) {
          queryOptions.mcpServers = {
            'pm-tools': this.pmMcpServer
          }
        }
      }

      // Build system prompt: autoContext takes priority over explicit systemPrompt
      let systemPrompt = options.systemPrompt
      if (options.autoContext && options.agentType) {
        try {
          systemPrompt = await buildAgentPrompt({
            featureId: options.featureId,
            taskId: options.taskId,
            agentType: options.agentType
          })
        } catch (error) {
          console.error('[AgentService] Failed to build auto context prompt:', error)
          // Fall back to provided systemPrompt or undefined
        }
      }

      // Add system prompt if we have one
      if (systemPrompt) {
        queryOptions.systemPrompt = systemPrompt
      }

      // MCP servers require streaming input (async generator for prompt)
      // Create an async generator that yields the user message
      const promptGenerator = isPMAgent && this.pmMcpServer
        ? (async function* () {
            yield {
              type: 'user' as const,
              message: {
                role: 'user' as const,
                content: options.prompt
              }
            }
          })()
        : options.prompt

      this.activeQuery = sdk.query({
        prompt: promptGenerator,
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
