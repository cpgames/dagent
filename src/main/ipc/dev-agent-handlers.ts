/**
 * IPC handlers for dev agent operations.
 * Exposes dev agent lifecycle to renderer process.
 */

import { ipcMain } from 'electron'
import {
  createDevAgent,
  registerDevAgent,
  getDevAgent,
  removeDevAgent,
  getAllDevAgents,
  clearDevAgents
} from '../agents'
import type { Task, DAGGraph } from '@shared/types'
import type { DevAgentConfig, IntentionDecision } from '../agents/dev-types'

export function registerDevAgentHandlers(): void {
  ipcMain.handle(
    'dev-agent:create',
    async (
      _event,
      featureId: string,
      taskId: string,
      task: Task,
      graph: DAGGraph,
      claudeMd?: string,
      featureGoal?: string,
      config?: Partial<DevAgentConfig>
    ) => {
      const agent = createDevAgent(featureId, taskId, config)
      const initialized = await agent.initialize(task, graph, claudeMd, featureGoal)

      if (initialized) {
        registerDevAgent(agent)
      }

      return {
        success: initialized,
        state: agent.getState()
      }
    }
  )

  ipcMain.handle('dev-agent:get-state', async (_event, taskId: string) => {
    const agent = getDevAgent(taskId)
    return agent?.getState() || null
  })

  ipcMain.handle('dev-agent:get-status', async (_event, taskId: string) => {
    const agent = getDevAgent(taskId)
    return agent?.getStatus() || null
  })

  ipcMain.handle('dev-agent:get-all', async () => {
    return getAllDevAgents().map((a) => a.getState())
  })

  ipcMain.handle(
    'dev-agent:propose-intention',
    async (_event, taskId: string, intention?: string) => {
      const agent = getDevAgent(taskId)
      if (!agent) return false
      return agent.proposeIntention(intention)
    }
  )

  ipcMain.handle(
    'dev-agent:receive-approval',
    async (_event, taskId: string, decision: IntentionDecision) => {
      const agent = getDevAgent(taskId)
      if (!agent) return false
      agent.receiveApproval(decision)
      return true
    }
  )

  ipcMain.handle('dev-agent:execute', async (_event, taskId: string) => {
    const agent = getDevAgent(taskId)
    if (!agent) return { success: false, taskId, error: 'Agent not found' }
    return agent.execute()
  })

  ipcMain.handle(
    'dev-agent:cleanup',
    async (_event, taskId: string, removeWorktree: boolean = false) => {
      const agent = getDevAgent(taskId)
      if (!agent) return false
      await agent.cleanup(removeWorktree)
      removeDevAgent(taskId)
      return true
    }
  )

  ipcMain.handle('dev-agent:clear-all', async () => {
    clearDevAgents()
    return true
  })
}
