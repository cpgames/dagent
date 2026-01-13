import { ipcMain } from 'electron'
import type { DAGGraph } from '@shared/types'
import type { ExecutionConfig } from '../dag-engine/orchestrator-types'
import { getOrchestrator, resetOrchestrator } from '../dag-engine/orchestrator'

/**
 * Execution IPC Handlers
 *
 * Flow for feature-based execution:
 * 1. Renderer calls execution:initialize(featureId, graph) to set up orchestrator
 * 2. Renderer calls execution:start() to begin execution
 * 3. Renderer calls execution:get-state to poll current state
 * 4. Use execution:pause/resume/stop to control execution
 *
 * The orchestrator manages task assignments and state transitions.
 */
export function registerExecutionHandlers(): void {
  ipcMain.handle(
    'execution:initialize',
    async (_event, featureId: string, graph: DAGGraph) => {
      const orchestrator = getOrchestrator()
      orchestrator.initialize(featureId, graph)
      return orchestrator.getSnapshot()
    }
  )

  ipcMain.handle('execution:start', async () => {
    const orchestrator = getOrchestrator()
    return orchestrator.start()
  })

  ipcMain.handle('execution:pause', async () => {
    const orchestrator = getOrchestrator()
    return orchestrator.pause()
  })

  ipcMain.handle('execution:resume', async () => {
    const orchestrator = getOrchestrator()
    return orchestrator.resume()
  })

  ipcMain.handle('execution:stop', async () => {
    const orchestrator = getOrchestrator()
    return orchestrator.stop()
  })

  ipcMain.handle('execution:get-state', async () => {
    const orchestrator = getOrchestrator()
    return orchestrator.getState()
  })

  ipcMain.handle('execution:get-next-tasks', async () => {
    const orchestrator = getOrchestrator()
    return orchestrator.getNextTasks()
  })

  ipcMain.handle('execution:assign-task', async (_event, taskId: string, agentId?: string) => {
    const orchestrator = getOrchestrator()
    return orchestrator.assignTask(taskId, agentId)
  })

  ipcMain.handle('execution:complete-task-code', async (_event, taskId: string) => {
    const orchestrator = getOrchestrator()
    return orchestrator.completeTaskCode(taskId)
  })

  ipcMain.handle('execution:complete-merge', async (_event, taskId: string) => {
    const orchestrator = getOrchestrator()
    return orchestrator.completeMerge(taskId)
  })

  ipcMain.handle('execution:fail-task', async (_event, taskId: string, error?: string) => {
    const orchestrator = getOrchestrator()
    return orchestrator.failTask(taskId, error)
  })

  ipcMain.handle('execution:get-snapshot', async () => {
    const orchestrator = getOrchestrator()
    return orchestrator.getSnapshot()
  })

  ipcMain.handle('execution:update-config', async (_event, config: Partial<ExecutionConfig>) => {
    const orchestrator = getOrchestrator()
    orchestrator.updateConfig(config)
    return orchestrator.getConfig()
  })

  ipcMain.handle('execution:reset', async () => {
    resetOrchestrator()
    return { success: true }
  })
}
