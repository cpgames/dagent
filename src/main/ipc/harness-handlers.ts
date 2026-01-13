import { ipcMain } from 'electron'
import { getHarnessAgent, resetHarnessAgent } from '../agents'
import type { DAGGraph } from '@shared/types'

export function registerHarnessHandlers(): void {
  ipcMain.handle(
    'harness:initialize',
    async (
      _event,
      featureId: string,
      featureGoal: string,
      graph: DAGGraph,
      claudeMd?: string
    ) => {
      const harness = getHarnessAgent()
      return harness.initialize(featureId, featureGoal, graph, claudeMd)
    }
  )

  ipcMain.handle('harness:start', async () => {
    const harness = getHarnessAgent()
    return harness.start()
  })

  ipcMain.handle('harness:pause', async () => {
    const harness = getHarnessAgent()
    return harness.pause()
  })

  ipcMain.handle('harness:resume', async () => {
    const harness = getHarnessAgent()
    return harness.resume()
  })

  ipcMain.handle('harness:stop', async () => {
    const harness = getHarnessAgent()
    return harness.stop()
  })

  ipcMain.handle('harness:get-state', async () => {
    const harness = getHarnessAgent()
    return harness.getState()
  })

  ipcMain.handle('harness:get-status', async () => {
    const harness = getHarnessAgent()
    return harness.getStatus()
  })

  ipcMain.handle('harness:register-task-assignment', async (_event, taskId: string, agentId: string) => {
    const harness = getHarnessAgent()
    harness.registerTaskAssignment(taskId, agentId)
    return true
  })

  ipcMain.handle(
    'harness:receive-intention',
    async (_event, agentId: string, taskId: string, intention: string, files?: string[]) => {
      const harness = getHarnessAgent()
      harness.receiveIntention(agentId, taskId, intention, files)
      return true
    }
  )

  ipcMain.handle('harness:process-intention', async (_event, taskId: string) => {
    const harness = getHarnessAgent()
    return harness.processIntention(taskId)
  })

  ipcMain.handle('harness:mark-task-working', async (_event, taskId: string) => {
    const harness = getHarnessAgent()
    harness.markTaskWorking(taskId)
    return true
  })

  ipcMain.handle('harness:mark-task-merging', async (_event, taskId: string) => {
    const harness = getHarnessAgent()
    harness.markTaskMerging(taskId)
    return true
  })

  ipcMain.handle('harness:complete-task', async (_event, taskId: string) => {
    const harness = getHarnessAgent()
    harness.completeTask(taskId)
    return true
  })

  ipcMain.handle('harness:fail-task', async (_event, taskId: string, error: string) => {
    const harness = getHarnessAgent()
    harness.failTask(taskId, error)
    return true
  })

  ipcMain.handle('harness:get-message-history', async () => {
    const harness = getHarnessAgent()
    return harness.getMessageHistory()
  })

  ipcMain.handle('harness:reset', async () => {
    resetHarnessAgent()
    return true
  })
}
