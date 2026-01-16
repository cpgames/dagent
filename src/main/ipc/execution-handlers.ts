import { ipcMain, BrowserWindow } from 'electron'
import type { DAGGraph } from '@shared/types'
import type { FeatureStatus } from '@shared/types/feature'
import type { ExecutionConfig, TaskLoopStatus } from '../dag-engine/orchestrator-types'
import { getOrchestrator, resetOrchestrator } from '../dag-engine/orchestrator'

/**
 * Send feature status change event to all renderer windows.
 */
function broadcastFeatureStatusChange(featureId: string, status: FeatureStatus): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('feature:status-changed', { featureId, status })
    }
  }
}

/**
 * Send DAG graph update event to all renderer windows.
 */
function broadcastGraphUpdate(featureId: string, graph: DAGGraph): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('dag:updated', { featureId, graph })
    }
  }
}

/**
 * Send loop status update event to all renderer windows.
 */
function broadcastLoopStatusUpdate(status: TaskLoopStatus): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('task:loop-status-updated', status)
    }
  }
}

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
  // Subscribe to orchestrator events
  const orchestrator = getOrchestrator()

  orchestrator.on('feature_status_changed', (event: { featureId: string; status: FeatureStatus }) => {
    broadcastFeatureStatusChange(event.featureId, event.status)
  })

  orchestrator.on('graph_updated', (event: { featureId: string; graph: DAGGraph }) => {
    console.log(`[ExecutionHandlers] Broadcasting graph update for feature ${event.featureId}`)
    broadcastGraphUpdate(event.featureId, event.graph)
  })

  orchestrator.on('task_loop_update', (status: TaskLoopStatus) => {
    console.log(`[ExecutionHandlers] Broadcasting loop status update for task ${status.taskId}`)
    broadcastLoopStatusUpdate(status)
  })

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

  // Loop status handlers for Ralph Loop UI
  ipcMain.handle('execution:get-loop-status', async (_event, taskId: string) => {
    const orchestrator = getOrchestrator()
    return orchestrator.getLoopStatus(taskId)
  })

  ipcMain.handle('execution:get-all-loop-statuses', async () => {
    const orchestrator = getOrchestrator()
    return orchestrator.getAllLoopStatuses()
  })

  ipcMain.handle('execution:abort-loop', async (_event, taskId: string) => {
    const orchestrator = getOrchestrator()
    return orchestrator.abortLoop(taskId)
  })
}
