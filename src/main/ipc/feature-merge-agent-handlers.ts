import { ipcMain } from 'electron'
import {
  createFeatureMergeAgent,
  registerFeatureMergeAgent,
  getFeatureMergeAgent,
  removeFeatureMergeAgent
} from '../agents/feature-merge-agent'
import { getFeatureStore } from './storage-handlers'
import { getGitManager } from '../git'

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
  ipcMain.handle('feature-merge:execute', async (_event, featureId: string, deleteBranchOnSuccess: boolean = false) => {
    const agent = getFeatureMergeAgent(featureId)
    if (!agent) return { success: false, error: 'Agent not found' }

    // Auto-approve for AI merge
    agent.receiveApproval({ approved: true, type: 'approved' })

    // Execute the merge
    const result = await agent.executeMerge(deleteBranchOnSuccess)
    return result
  })

  // Cleanup agent
  ipcMain.handle('feature-merge:cleanup', async (_event, featureId: string) => {
    const agent = getFeatureMergeAgent(featureId)
    if (agent) {
      await agent.cleanup()
      removeFeatureMergeAgent(featureId)
    }
    return { success: true }
  })
}
