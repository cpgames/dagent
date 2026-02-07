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
  /** Token usage data from SDK (available on some message types) */
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

import type { AgentQueryOptions, AgentStreamEvent } from './types'
import { getToolsForPreset } from './tool-config'
import { buildAgentPrompt } from './prompt-builders'
import { createPMMcpServer, getPMToolNamesForAllowedTools } from './pm-mcp-server'
import { createSetupMcpServer, getSetupToolNamesForAllowedTools } from './setup-mcp-server'
import { getRequestManager, RequestPriority } from './request-manager'

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
  // Cache the Setup MCP server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private setupMcpServer: any = null
  // Cumulative token tracking for current query
  private cumulativeInputTokens: number = 0
  private cumulativeOutputTokens: number = 0

  async *streamQuery(options: AgentQueryOptions): AsyncGenerator<AgentStreamEvent> {
    // Determine priority from options or infer from agentType
    let priority: RequestPriority
    if (options.priority !== undefined) {
      priority = options.priority
    } else if (options.agentType === 'feature') {
      priority = RequestPriority.PM
    } else if (options.agentType === 'project') {
      priority = RequestPriority.PM // Project is Feature-like activity
    } else if (options.agentType === 'merge') {
      priority = RequestPriority.MERGE
    } else if (options.agentType === 'qa') {
      priority = RequestPriority.QA
    } else {
      priority = RequestPriority.DEV // Default for task agents
    }

    // Determine agentId from options or construct from context
    let agentId: string
    if (options.agentId) {
      agentId = options.agentId
    } else if (options.taskId) {
      agentId = `${options.agentType || 'task'}-${options.taskId}`
    } else {
      agentId = options.agentType || 'unknown'
    }

    try {
      // Use RequestManager to control concurrency
      const requestManager = getRequestManager()
      const stream = await requestManager.enqueue(
        priority,
        agentId,
        () => this.executeSDKQuery(options),
        options.taskId
      )

      // Yield events from the stream
      for await (const event of stream) {
        yield event
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Agent query failed'
      }
    }
  }

  /**
   * Execute the actual SDK query. Called by RequestManager when a slot is available.
   */
  private async *executeSDKQuery(options: AgentQueryOptions): AsyncGenerator<AgentStreamEvent> {
    // Reset token counters for new query
    this.cumulativeInputTokens = 0
    this.cumulativeOutputTokens = 0

    // Clear ELECTRON_RUN_AS_NODE which breaks Claude Code subprocess spawning
    // This env var is set by VS Code and some Electron tools
    const savedElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE
    delete process.env.ELECTRON_RUN_AS_NODE

    // Ensure Claude CLI path is in PATH for packaged app
    // Claude CLI typically installs to ~/.local/bin on Windows
    const savedPath = process.env.PATH
    const home = process.env.USERPROFILE || process.env.HOME || ''
    const claudeCliDir = `${home}\\.local\\bin`
    if (!process.env.PATH?.includes(claudeCliDir)) {
      process.env.PATH = `${claudeCliDir};${process.env.PATH || ''}`
    }

    try {
      // Dynamically import the SDK (ES module)
      const sdk = await getSDK()
      if (!sdk) {
        yield { type: 'error', error: 'Claude Agent SDK not available' }
        return
      }

      // Check if task management tools are needed (Feature and Project agents use PM MCP tools)
      const needsTaskManagementTools =
        options.toolPreset === 'featureAgent' ||
        options.toolPreset === 'projectAgent' ||
        options.agentType === 'feature' ||
        options.agentType === 'project'

      // Check if WriteClaudeMd tool is needed (Project agent uses WriteClaudeMd)
      const needsWriteClaudeMdTools =
        options.toolPreset === 'projectAgent' ||
        options.agentType === 'project'

      // Resolve tools from preset or explicit list
      let tools =
        options.allowedTools || (options.toolPreset ? getToolsForPreset(options.toolPreset) : [])

      // For Feature/Project agents, replace task tool names with MCP-prefixed names
      if (needsTaskManagementTools) {
        // Filter out the direct tool names (they won't work without MCP)
        const pmToolNames = ['CreateTask', 'ListTasks', 'AddDependency', 'RemoveDependency', 'GetTask', 'UpdateTask', 'DeleteTask']
        tools = tools.filter(t => !pmToolNames.includes(t))
        // Add the MCP-prefixed tool names
        tools = [...tools, ...getPMToolNamesForAllowedTools()]
      }

      // For Investigation Agent, replace WriteClaudeMd with MCP-prefixed name
      if (needsWriteClaudeMdTools) {
        // Filter out the direct tool name (it won't work without MCP)
        tools = tools.filter(t => t !== 'WriteClaudeMd')
        // Add the MCP-prefixed tool names
        tools = [...tools, ...getSetupToolNamesForAllowedTools()]
      }

      // Remove AskUserQuestion - agents should write questions directly in chat
      tools = tools.filter(t => t !== 'AskUserQuestion')

      // Find the native Claude CLI executable (required for packaged app)
      // The SDK's bundled cli.js doesn't work from inside ASAR archive
      const claudeCliPath = this.findClaudeExecutable()

      const queryOptions: Record<string, unknown> = {
        cwd: options.cwd,
        allowedTools: tools,
        // Explicitly disallow AskUserQuestion - agents should write questions directly in chat
        disallowedTools: ['AskUserQuestion'],
        permissionMode: options.permissionMode || 'default',
        // Use native CLI instead of bundled cli.js (which fails inside ASAR)
        pathToClaudeCodeExecutable: claudeCliPath || undefined
      }

      // Add hooks if provided (for path restrictions, etc.)
      if (options.hooks) {
        queryOptions.hooks = options.hooks
      }

      // Add maxTurns if provided (limits agentic turns to prevent runaway execution)
      if (options.maxTurns) {
        queryOptions.maxTurns = options.maxTurns
      }

      // Add model override if provided
      if (options.model) {
        queryOptions.model = options.model
      }

      // Add task management MCP server if needed
      if (needsTaskManagementTools) {
        if (!this.pmMcpServer) {
          this.pmMcpServer = await createPMMcpServer()
        }
        if (this.pmMcpServer) {
          queryOptions.mcpServers = {
            ...(queryOptions.mcpServers as object || {}),
            'pm-tools': this.pmMcpServer
          }
        }
      }

      // Add MCP server for WriteClaudeMd tool
      if (needsWriteClaudeMdTools) {
        if (!this.setupMcpServer) {
          this.setupMcpServer = await createSetupMcpServer()
        }
        if (this.setupMcpServer) {
          queryOptions.mcpServers = {
            ...(queryOptions.mcpServers as object || {}),
            'setup-tools': this.setupMcpServer
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
      const hasMcpServer = (needsTaskManagementTools && this.pmMcpServer) || (needsWriteClaudeMdTools && this.setupMcpServer)
      const promptGenerator = hasMcpServer
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

      try {
        for await (const message of this.activeQuery) {
          // Track token usage from SDK messages
          if (message.usage) {
            this.cumulativeInputTokens += message.usage.input_tokens
            this.cumulativeOutputTokens += message.usage.output_tokens
          }

          const event = this.convertMessage(message)
          if (event) {
            // Add per-message usage if available
            if (message.usage) {
              event.usage = {
                inputTokens: message.usage.input_tokens,
                outputTokens: message.usage.output_tokens,
                totalTokens: message.usage.input_tokens + message.usage.output_tokens
              }
            }
            yield event
          }
        }
      } catch (error) {
        throw error
      }

      // Include cumulative token usage in done event
      yield {
        type: 'done',
        usage: {
          inputTokens: this.cumulativeInputTokens,
          outputTokens: this.cumulativeOutputTokens,
          totalTokens: this.cumulativeInputTokens + this.cumulativeOutputTokens
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      yield {
        type: 'error',
        error: errorMessage
      }
    } finally {
      this.activeQuery = null
      // Restore ELECTRON_RUN_AS_NODE if it was set
      if (savedElectronRunAsNode !== undefined) {
        process.env.ELECTRON_RUN_AS_NODE = savedElectronRunAsNode
      }
      // Restore PATH
      if (savedPath !== undefined) {
        process.env.PATH = savedPath
      }
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

  /**
   * Find the native Claude CLI executable.
   * The SDK's bundled cli.js doesn't work from inside Electron's ASAR archive,
   * so we need to use the globally installed native binary.
   */
  private findClaudeExecutable(): string | null {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    const fs = require('fs')
    const path = require('path')

    // Check common locations for Claude CLI on Windows
    const possiblePaths = [
      path.join(home, '.local', 'bin', 'claude.exe'),
      path.join(home, '.local', 'bin', 'claude'),
      path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
      path.join(home, 'AppData', 'Roaming', 'npm', 'claude'),
    ]

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p
      }
    }

    // Try to find it via 'where' command
    try {
      const { execSync } = require('child_process')
      const result = execSync('where claude', { encoding: 'utf-8', timeout: 5000 }).trim()
      if (result) {
        return result.split('\n')[0]
      }
    } catch {
      // Command failed - claude not in PATH
    }

    return null
  }
}

let agentService: AgentService | null = null

export function getAgentService(): AgentService {
  if (!agentService) {
    agentService = new AgentService()
  }
  return agentService
}
