import { ipcMain, BrowserWindow } from 'electron'
import {
  createFeatureMergeAgent,
  registerFeatureMergeAgent,
  getFeatureMergeAgent,
  removeFeatureMergeAgent
} from '../agents/feature-merge-agent'
import type { FeatureMergeAgent } from '../agents/feature-merge-agent'
import type { AgentStreamEvent } from '../agent/types'
import { getFeatureStore } from './storage-handlers'
import { getGitManager } from '../git'

// Track stream listeners for cleanup
const streamListeners = new Map<string, () => void>()

/**
 * Setup streaming event relay for a merge agent.
 */
function setupStreamRelay(agent: FeatureMergeAgent, featureId: string): void {
  // Clean up any existing listener
  const existingCleanup = streamListeners.get(featureId)
  if (existingCleanup) {
    existingCleanup()
  }

  // Create stream event handler
  const streamHandler = (event: AgentStreamEvent): void => {
    // Send to all windows
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('feature-merge:stream', { featureId, event })
      }
    }
  }

  // Listen for stream events
  agent.on('feature-merge-agent:stream', streamHandler)

  // Store cleanup function
  streamListeners.set(featureId, () => {
    agent.removeListener('feature-merge-agent:stream', streamHandler)
  })
}

/**
 * Cleanup stream relay for a feature.
 */
function cleanupStreamRelay(featureId: string): void {
  const cleanup = streamListeners.get(featureId)
  if (cleanup) {
    cleanup()
    streamListeners.delete(featureId)
  }
}

export function registerFeatureMergeAgentHandlers(): void {
  // Create and initialize merge agent
  ipcMain.handle('feature-merge:create', async (_event, featureId: string, targetBranch?: string) => {
    console.log(`[FeatureMergeHandler] Creating agent for feature: ${featureId}`)

    // Load feature to get the actual branch name
    const store = getFeatureStore()
    const feature = store ? await store.loadFeature(featureId) : null
    const featureBranch = feature?.branch // Use stored branch name

    // Auto-detect default branch if not specified (handles main vs master)
    const gitManager = getGitManager()
    const resolvedTargetBranch = targetBranch || await gitManager.getDefaultBranch()

    console.log(`[FeatureMergeHandler] Feature loaded:`, feature ? { id: feature.id, branch: feature.branch } : 'null')
    console.log(`[FeatureMergeHandler] Using feature branch: ${featureBranch}`)
    console.log(`[FeatureMergeHandler] Target branch: ${resolvedTargetBranch}`)

    const agent = createFeatureMergeAgent(featureId, resolvedTargetBranch, featureBranch)
    const initialized = await agent.initialize()
    if (initialized) {
      registerFeatureMergeAgent(agent)
      // Setup streaming relay for log display
      setupStreamRelay(agent, featureId)
    }
    return { success: initialized, state: agent.getState() }
  })

  // Get current agent state
  ipcMain.handle('feature-merge:get-state', async (_event, featureId: string) => {
    const agent = getFeatureMergeAgent(featureId)
    return agent?.getState() ?? null
  })

  // Check branches exist
  ipcMain.handle('feature-merge:check-branches', async (_event, featureId: string) => {
    const agent = getFeatureMergeAgent(featureId)
    if (!agent) return { success: false, error: 'Agent not found' }
    const result = await agent.checkBranches()
    const state = agent.getState()
    // Return the error from state if check failed
    return { success: result, error: result ? undefined : state.error, state }
  })

  // Auto-approve and execute merge (for AI Merge flow)
  ipcMain.handle('feature-merge:execute', async (_event, featureId: string) => {
    const agent = getFeatureMergeAgent(featureId)
    if (!agent) return { success: false, error: 'Agent not found' }

    // Auto-approve for AI merge
    agent.receiveApproval({ approved: true, type: 'approved' })

    // Execute the merge (never deletes branch - archiving handles cleanup)
    const result = await agent.executeMerge()
    return result
  })

  // Cleanup agent
  ipcMain.handle('feature-merge:cleanup', async (_event, featureId: string) => {
    const agent = getFeatureMergeAgent(featureId)
    if (agent) {
      await agent.cleanup()
      removeFeatureMergeAgent(featureId)
    }
    // Clean up stream relay
    cleanupStreamRelay(featureId)
    return { success: true }
  })
}
