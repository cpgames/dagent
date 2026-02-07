/**
 * IPC handlers for GitHub PR operations.
 * Exposes PRService methods to the renderer process.
 */

import { ipcMain } from 'electron'
import { getPRService } from '../github'
import type { CreatePRRequest } from '../github'
import { getGitManager } from '../git'
import { getFeatureStore, getProjectRoot } from './storage-handlers'
import { getFeatureSpecStore } from '../agents/feature-spec-store'
import { getAgentService } from '../agent/agent-service'

/**
 * Register IPC handlers for PR operations.
 */
export function registerPRHandlers(): void {
  // Check gh CLI status (installation and authentication)
  ipcMain.handle('pr:check-gh-cli', async () => {
    return getPRService().checkGhCli()
  })

  // Create a pull request
  ipcMain.handle('pr:create', async (_event, request: CreatePRRequest) => {
    const gitManager = getGitManager()
    const projectRoot = gitManager?.getConfig()?.baseDir

    // Push branch to remote before creating PR
    if (gitManager && request.head) {
      console.log(`[PR] Pushing branch ${request.head} to origin`)
      const pushResult = await gitManager.pushBranch(request.head)
      if (!pushResult.success) {
        return {
          success: false,
          error: `Failed to push branch: ${pushResult.error}`
        }
      }
    }

    // Pass project root as cwd for gh command
    const result = await getPRService().createPullRequest({
      ...request,
      cwd: projectRoot
    })

    return result
  })

  // Generate PR summary from feature spec using AI
  ipcMain.handle(
    'pr:generate-summary',
    async (_event, featureId: string): Promise<{ success: boolean; title?: string; body?: string; error?: string }> => {
      try {
        const projectRoot = getProjectRoot()
        if (!projectRoot) {
          return { success: false, error: 'Project root not set' }
        }

        const featureStore = getFeatureStore()
        if (!featureStore) {
          return { success: false, error: 'Feature store not initialized' }
        }

        // Load feature
        const feature = await featureStore.loadFeature(featureId)
        if (!feature) {
          return { success: false, error: 'Feature not found' }
        }

        // Load feature spec
        const specStore = getFeatureSpecStore(projectRoot)
        const spec = await specStore.loadSpec(featureId)

        // Build context for the agent
        let specContext = ''
        if (spec) {
          specContext = `
## Goals
${spec.goals.length > 0 ? spec.goals.map(g => `- ${g}`).join('\n') : 'None specified'}

## Requirements
${spec.requirements.length > 0 ? spec.requirements.map(r => `- ${r.description}${r.completed ? ' ✓' : ''}`).join('\n') : 'None specified'}

## Constraints
${spec.constraints.length > 0 ? spec.constraints.map(c => `- ${c}`).join('\n') : 'None specified'}

## Acceptance Criteria
${spec.acceptanceCriteria.length > 0 ? spec.acceptanceCriteria.map(ac => `- ${ac.description}${ac.passed ? ' ✓' : ''}`).join('\n') : 'None specified'}
`
        }

        const prompt = `Generate a concise PR title and body for this feature.

Feature: ${feature.name}
${specContext}

Respond in this exact format:
TITLE: <short PR title, max 70 chars, start with feat:/fix:/refactor: etc>
BODY:
<PR body with:
- Summary (2-3 bullet points of what changed)
- Key changes section if relevant>

Keep it brief and focused on what was implemented. Do not include test plans or generic boilerplate.`

        // Use agent service to generate summary
        const agentService = getAgentService()
        let responseText = ''

        for await (const event of agentService.streamQuery({
          prompt,
          agentType: 'feature',
          featureId,
          cwd: feature.worktreePath || projectRoot,
          permissionMode: 'default',
          maxTurns: 1 // Single response, no tool use needed
        })) {
          if (event.type === 'message' && event.message?.content) {
            responseText = event.message.content
          }
        }

        // Parse the response
        const titleMatch = responseText.match(/TITLE:\s*(.+?)(?:\n|$)/)
        const bodyMatch = responseText.match(/BODY:\s*([\s\S]+)$/)

        const title = titleMatch ? titleMatch[1].trim() : `feat: ${feature.name}`
        const body = bodyMatch ? bodyMatch[1].trim() : responseText

        return { success: true, title, body }
      } catch (error) {
        console.error('[PR] Failed to generate summary:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )
}
