/**
 * IPC handlers for task agent operations.
 * Exposes task agent lifecycle to renderer process.
 */

import { ipcMain } from 'electron'
import {
  createTaskAgent,
  registerTaskAgent,
  getTaskAgent,
  removeTaskAgent,
  getAllTaskAgents,
  clearTaskAgents
} from '../agents'
import type { Task, DAGGraph } from '@shared/types'
import type { TaskAgentConfig } from '../agents/task-types'
import type { IntentionDecision } from '../agents/harness-types'

export function registerTaskAgentHandlers(): void {
  ipcMain.handle(
    'task-agent:create',
    async (
      _event,
      featureId: string,
      taskId: string,
      task: Task,
      graph: DAGGraph,
      claudeMd?: string,
      featureGoal?: string,
      config?: Partial<TaskAgentConfig>
    ) => {
      const agent = createTaskAgent(featureId, taskId, config)
      const initialized = await agent.initialize(task, graph, claudeMd, featureGoal)

      if (initialized) {
        registerTaskAgent(agent)
      }

      return {
        success: initialized,
        state: agent.getState()
      }
    }
  )

  ipcMain.handle('task-agent:get-state', async (_event, taskId: string) => {
    const agent = getTaskAgent(taskId)
    return agent?.getState() || null
  })

  ipcMain.handle('task-agent:get-status', async (_event, taskId: string) => {
    const agent = getTaskAgent(taskId)
    return agent?.getStatus() || null
  })

  ipcMain.handle('task-agent:get-all', async () => {
    return getAllTaskAgents().map((a) => a.getState())
  })

  ipcMain.handle(
    'task-agent:propose-intention',
    async (_event, taskId: string, intention?: string) => {
      const agent = getTaskAgent(taskId)
      if (!agent) return false
      return agent.proposeIntention(intention)
    }
  )

  ipcMain.handle(
    'task-agent:receive-approval',
    async (_event, taskId: string, decision: IntentionDecision) => {
      const agent = getTaskAgent(taskId)
      if (!agent) return false
      agent.receiveApproval(decision)
      return true
    }
  )

  ipcMain.handle('task-agent:execute', async (_event, taskId: string) => {
    const agent = getTaskAgent(taskId)
    if (!agent) return { success: false, taskId, error: 'Agent not found' }
    return agent.execute()
  })

  ipcMain.handle(
    'task-agent:cleanup',
    async (_event, taskId: string, removeWorktree: boolean = false) => {
      const agent = getTaskAgent(taskId)
      if (!agent) return false
      await agent.cleanup(removeWorktree)
      removeTaskAgent(taskId)
      return true
    }
  )

  ipcMain.handle('task-agent:clear-all', async () => {
    clearTaskAgents()
    return true
  })
}
