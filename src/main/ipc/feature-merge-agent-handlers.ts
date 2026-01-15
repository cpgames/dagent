import { ipcMain } from 'electron'
import {
  createFeatureMergeAgent,
  registerFeatureMergeAgent,
  getFeatureMergeAgent,
  removeFeatureMergeAgent
} from '../agents/feature-merge-agent'
import type { FeatureMergeAgentState, FeatureMergeResult } from '../agents/feature-merge-types'

export function registerFeatureMergeAgentHandlers(): void {
  // Create and initialize merge agent
  ipcMain.handle('feature-merge:create', async (_event, featureId: string, targetBranch: string = 'main') => {
    const agent = createFeatureMergeAgent(featureId, targetBranch)
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
    return { success: result, state: agent.getState() }
  })

  // Auto-approve and execute merge (for AI Merge flow)
  ipcMain.handle('feature-merge:execute', async (_event, featureId: string, deleteBranchOnSuccess: boolean = false) => {
    const agent = getFeatureMergeAgent(featureId)
    if (!agent) return { success: false, error: 'Agent not found' }

    // Auto-approve for AI merge
    agent.receiveApproval({ approved: true })

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
