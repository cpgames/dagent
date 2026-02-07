/**
 * Project Agent MCP Server for WriteClaudeMd, GetFeatures, AddFeature tools.
 * Uses createSdkMcpServer to register tools with the Claude Agent SDK.
 */

import { z } from 'zod'
import * as fs from 'fs/promises'
import * as path from 'path'
import { BrowserWindow } from 'electron'
import { getFeatureStore, createFeature } from '../ipc/storage-handlers'

// Dynamic SDK imports for ES module compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdkModule: any = null

async function getSDK(): Promise<{
  createSdkMcpServer: (config: unknown) => unknown
  tool: (name: string, description: string, schema: unknown, handler: unknown) => unknown
} | null> {
  if (!sdkModule) {
    try {
      sdkModule = await import('@anthropic-ai/claude-agent-sdk')
    } catch (error) {
      console.error('[DAGent] Failed to load Claude Agent SDK for Setup MCP server:', error)
      return null
    }
  }
  return sdkModule
}

// Project root context for the Setup Agent
let setupProjectRoot: string | null = null

/**
 * Set the project root for Setup Agent operations.
 */
export function setSetupContext(projectRoot: string): void {
  setupProjectRoot = projectRoot
}

/**
 * Get the current setup project root.
 */
export function getSetupContext(): string | null {
  return setupProjectRoot
}

/**
 * Get MCP-prefixed tool names for Project Agent.
 * These are the actual tool names exposed by the MCP server.
 */
export function getSetupToolNamesForAllowedTools(): string[] {
  return ['mcp__setup-tools__WriteClaudeMd', 'mcp__setup-tools__GetFeatures', 'mcp__setup-tools__AddFeature']
}

/**
 * Write CLAUDE.md to the project root (without committing).
 * User must manually commit via "Commit & Sync" button in ContextView.
 */
async function writeClaudeMdHandler(args: { content: string }): Promise<{
  success: boolean
  error?: string
  path?: string
}> {
  if (!setupProjectRoot) {
    return { success: false, error: 'Project root not set. Initialize the Setup Agent first.' }
  }

  if (!args.content || args.content.trim().length === 0) {
    return { success: false, error: 'Content cannot be empty.' }
  }

  try {
    // Write to project root
    const claudeMdPath = path.join(setupProjectRoot, 'CLAUDE.md')
    await fs.writeFile(claudeMdPath, args.content, 'utf-8')

    // Notify renderer that CLAUDE.md has been updated
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('context:claude-md-updated', { path: claudeMdPath })
      }
    }

    return { success: true, path: claudeMdPath }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Get list of features with name, description, and status.
 * Uses the shared feature store from storage-handlers.
 */
async function getFeaturesHandler(): Promise<{
  success: boolean
  features?: Array<{ name: string; description: string; status: string }>
  error?: string
}> {
  const store = getFeatureStore()
  if (!store) {
    return { success: false, error: 'No project loaded.' }
  }

  try {
    const featureIds = await store.listFeatures()
    const features: Array<{ name: string; description: string; status: string }> = []

    for (const featureId of featureIds) {
      const feature = await store.loadFeature(featureId)
      if (feature) {
        features.push({
          name: feature.name,
          description: feature.description || '',
          status: feature.status
        })
      }
    }

    return { success: true, features }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Add a new feature to the backlog.
 * Uses the shared createFeature function - same path as UI creation.
 */
async function addFeatureHandler(args: { title: string; description: string }): Promise<{
  success: boolean
  featureId?: string
  error?: string
}> {
  if (!args.title || args.title.trim().length === 0) {
    return { success: false, error: 'Feature title cannot be empty.' }
  }

  try {
    // Use shared createFeature (handles store access + event notification)
    // Default worktreeId to 'neon' for all features created via Setup Agent
    const feature = await createFeature(args.title.trim(), {
      description: args.description?.trim() || '',
      worktreeId: 'neon'
    })

    return { success: true, featureId: feature.id }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Create the Setup MCP server with WriteClaudeMd tool.
 */
export async function createSetupMcpServer(): Promise<unknown | null> {
  const sdk = await getSDK()
  if (!sdk) {
    console.error('[DAGent] Cannot create Setup MCP server: SDK not available')
    return null
  }

  const { createSdkMcpServer, tool } = sdk

  return createSdkMcpServer({
    name: 'setup-tools',
    version: '1.0.0',
    tools: [
      tool(
        'WriteClaudeMd',
        `Write content to the CLAUDE.md file in the project root. Use this tool when you have gathered enough information about the project to create comprehensive documentation for AI assistants.

The CLAUDE.md file should include:
- Project overview and purpose
- Tech stack and dependencies
- Build and development commands
- Architecture overview
- Code conventions and patterns
- Important files and directories

Call this tool with the full markdown content for the file.`,
        {
          content: z.string().describe('The full markdown content to write to CLAUDE.md. Should be well-formatted markdown with appropriate sections.')
        },
        async (args: { content: string }) => {
          const result = await writeClaudeMdHandler(args)
          return {
            content: [
              {
                type: 'text',
                text: result.success
                  ? `CLAUDE.md has been written successfully to: ${result.path}\n\nThe file is now available in the project root and will be used by AI assistants working with this codebase.`
                  : `Failed to write CLAUDE.md: ${result.error}`
              }
            ]
          }
        }
      ),
      tool(
        'GetFeatures',
        `Get the list of all features in this project. Returns each feature's name, description, and status.
Use this BEFORE suggesting new features to see what already exists.`,
        {},
        async () => {
          const result = await getFeaturesHandler()
          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Failed to get features: ${result.error}` }]
            }
          }
          if (!result.features || result.features.length === 0) {
            return {
              content: [{ type: 'text', text: 'No features exist yet.' }]
            }
          }
          const featureList = result.features.map(f =>
            `- **${f.name}** (${f.status})${f.description ? `: ${f.description}` : ''}`
          ).join('\n')
          return {
            content: [{ type: 'text', text: `Current features:\n${featureList}` }]
          }
        }
      ),
      tool(
        'AddFeature',
        `Create a new feature and add it to the backlog. Only use this when the user has explicitly asked to create features.`,
        {
          title: z.string().describe('Short feature title (e.g., "User Authentication", "Dashboard UI")'),
          description: z.string().describe('Brief description of what this feature accomplishes')
        },
        async (args: { title: string; description: string }) => {
          const result = await addFeatureHandler(args)
          return {
            content: [
              {
                type: 'text',
                text: result.success
                  ? `Feature "${args.title}" created and added to backlog.`
                  : `Failed to create feature: ${result.error}`
              }
            ]
          }
        }
      )
    ]
  })
}
