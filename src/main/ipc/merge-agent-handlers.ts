import { ipcMain } from 'electron'
import {
  createMergeAgent,
  registerMergeAgent,
  getMergeAgent,
  removeMergeAgent,
  getAllMergeAgents,
  clearMergeAgents
} from '../agents'
import type { IntentionDecision } from '../agents/harness-types'

export function registerMergeAgentHandlers(): void {
  ipcMain.handle(
    'merge-agent:create',
    async (_event, featureId: string, taskId: string, taskTitle: string) => {
      const agent = createMergeAgent(featureId, taskId)
      const initialized = await agent.initialize(taskTitle)

      if (initialized) {
        registerMergeAgent(agent)
        await agent.checkBranches()
      }

      return {
        success: initialized,
        state: agent.getState()
      }
    }
  )

  ipcMain.handle('merge-agent:get-state', async (_event, taskId: string) => {
    const agent = getMergeAgent(taskId)
    return agent?.getState() || null
  })

  ipcMain.handle('merge-agent:get-status', async (_event, taskId: string) => {
    const agent = getMergeAgent(taskId)
    return agent?.getStatus() || null
  })

  ipcMain.handle('merge-agent:get-all', async () => {
    return getAllMergeAgents().map((a) => a.getState())
  })

  ipcMain.handle('merge-agent:propose-intention', async (_event, taskId: string) => {
    const agent = getMergeAgent(taskId)
    if (!agent) return false
    return agent.proposeIntention()
  })

  ipcMain.handle(
    'merge-agent:receive-approval',
    async (_event, taskId: string, decision: IntentionDecision) => {
      const agent = getMergeAgent(taskId)
      if (!agent) return false
      agent.receiveApproval(decision)
      return true
    }
  )

  ipcMain.handle('merge-agent:execute', async (_event, taskId: string) => {
    const agent = getMergeAgent(taskId)
    if (!agent) {
      return {
        success: false,
        merged: false,
        worktreeRemoved: false,
        branchDeleted: false,
        error: 'Merge agent not found'
      }
    }
    return agent.executeMerge()
  })

  ipcMain.handle('merge-agent:abort', async (_event, taskId: string) => {
    const agent = getMergeAgent(taskId)
    if (!agent) return false
    return agent.abortMerge()
  })

  ipcMain.handle('merge-agent:cleanup', async (_event, taskId: string) => {
    const agent = getMergeAgent(taskId)
    if (!agent) return false
    await agent.cleanup()
    removeMergeAgent(taskId)
    return true
  })

  ipcMain.handle('merge-agent:clear-all', async () => {
    clearMergeAgents()
    return true
  })
}
