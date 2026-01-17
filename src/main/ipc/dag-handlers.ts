import { ipcMain, BrowserWindow } from 'electron'
import type { DAGGraph, Task, TaskStatus } from '@shared/types'
import type { StateTransitionEvent } from '../dag-engine/state-machine'
import {
  topologicalSort,
  analyzeDAG,
  getReadyTasks,
  isTaskReady,
  updateTaskStatuses,
  isValidTransition,
  getNextStatus,
  getValidEvents,
  transitionTask,
  initializeTaskStatuses,
  cascadeTaskCompletion,
  resetTaskAndDependents,
  recalculateAllStatuses
} from '../dag-engine'
import { DAGManager } from '../dag-engine/dag-manager'
import type { DAGManagerConfig, DAGEvent } from '../dag-engine/dag-api-types'

// Store DAGManager instances per featureId
const dagManagers = new Map<string, DAGManager>()

/**
 * Get or create DAGManager for a feature.
 */
export async function getDAGManager(featureId: string, projectRoot: string): Promise<DAGManager> {
  const key = `${projectRoot}:${featureId}`

  if (!dagManagers.has(key)) {
    const config: DAGManagerConfig = {
      featureId,
      projectRoot,
      autoSave: true
    }
    const manager = await DAGManager.create(config)
    dagManagers.set(key, manager)
  }

  return dagManagers.get(key)!
}

/**
 * Forward DAGManager events to renderer process.
 */
function setupEventForwarding(manager: DAGManager, window: BrowserWindow, featureId: string): void {
  const events: Array<DAGEvent['type']> = [
    'node-added',
    'node-removed',
    'connection-added',
    'connection-removed',
    'node-moved',
    'graph-reset'
  ]

  events.forEach((eventType) => {
    manager.on(eventType, (event: DAGEvent) => {
      window.webContents.send('dag-manager:event', { featureId, event })
    })
  })
}

export function registerDagHandlers(): void {
  ipcMain.handle('dag:topological-sort', async (_event, graph: DAGGraph) => {
    return topologicalSort(graph)
  })

  ipcMain.handle('dag:analyze', async (_event, graph: DAGGraph) => {
    const analysis = analyzeDAG(graph)
    // Convert Map to object for IPC serialization
    return {
      ...analysis,
      taskDependencies: Object.fromEntries(analysis.taskDependencies)
    }
  })

  ipcMain.handle('dag:get-ready-tasks', async (_event, graph: DAGGraph) => {
    return getReadyTasks(graph)
  })

  ipcMain.handle('dag:is-task-ready', async (_event, taskId: string, graph: DAGGraph) => {
    return isTaskReady(taskId, graph)
  })

  ipcMain.handle('dag:update-statuses', async (_event, graph: DAGGraph) => {
    return updateTaskStatuses(graph)
  })

  // State machine handlers
  ipcMain.handle(
    'dag:is-valid-transition',
    async (_event, from: string, to: string, transitionEvent: string) => {
      return isValidTransition(
        from as TaskStatus,
        to as TaskStatus,
        transitionEvent as StateTransitionEvent
      )
    }
  )

  ipcMain.handle(
    'dag:get-next-status',
    async (_event, currentStatus: string, transitionEvent: string) => {
      return getNextStatus(currentStatus as TaskStatus, transitionEvent as StateTransitionEvent)
    }
  )

  ipcMain.handle('dag:get-valid-events', async (_event, currentStatus: string) => {
    return getValidEvents(currentStatus as TaskStatus)
  })

  ipcMain.handle(
    'dag:transition-task',
    async (_event, task: Task, transitionEvent: string, graph?: DAGGraph) => {
      return transitionTask(task, transitionEvent as StateTransitionEvent, graph)
    }
  )

  ipcMain.handle('dag:initialize-statuses', async (_event, graph: DAGGraph) => {
    initializeTaskStatuses(graph)
    return graph
  })

  ipcMain.handle(
    'dag:cascade-completion',
    async (_event, completedTaskId: string, graph: DAGGraph) => {
      return cascadeTaskCompletion(completedTaskId, graph)
    }
  )

  ipcMain.handle('dag:reset-task', async (_event, taskId: string, graph: DAGGraph) => {
    return resetTaskAndDependents(taskId, graph)
  })

  ipcMain.handle('dag:recalculate-statuses', async (_event, graph: DAGGraph) => {
    return recalculateAllStatuses(graph)
  })

  // DAGManager IPC handlers
  ipcMain.handle(
    'dag-manager:create',
    async (event, featureId: string, projectRoot: string) => {
      const manager = await getDAGManager(featureId, projectRoot)
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) {
        setupEventForwarding(manager, window, featureId)
      }
      return { success: true, graph: manager.getGraph() }
    }
  )

  ipcMain.handle('dag-manager:add-node', async (_event, featureId: string, projectRoot: string, task: Partial<Task>) => {
    const manager = await getDAGManager(featureId, projectRoot)
    const node = await manager.addNode(task)
    return node
  })

  ipcMain.handle('dag-manager:remove-node', async (_event, featureId: string, projectRoot: string, nodeId: string) => {
    const manager = await getDAGManager(featureId, projectRoot)
    await manager.removeNode(nodeId)
    return { success: true }
  })

  ipcMain.handle(
    'dag-manager:add-connection',
    async (_event, featureId: string, projectRoot: string, sourceId: string, targetId: string) => {
      const manager = await getDAGManager(featureId, projectRoot)
      const connection = await manager.addConnection(sourceId, targetId)
      return connection // null if validation failed
    }
  )

  ipcMain.handle(
    'dag-manager:remove-connection',
    async (_event, featureId: string, projectRoot: string, connectionId: string) => {
      const manager = await getDAGManager(featureId, projectRoot)
      await manager.removeConnection(connectionId)
      return { success: true }
    }
  )

  ipcMain.handle(
    'dag-manager:move-node',
    async (_event, featureId: string, projectRoot: string, nodeId: string, position: { x: number; y: number }) => {
      const manager = await getDAGManager(featureId, projectRoot)
      await manager.moveNode(nodeId, position)
      return { success: true }
    }
  )

  ipcMain.handle('dag-manager:get-graph', async (_event, featureId: string, projectRoot: string) => {
    const manager = await getDAGManager(featureId, projectRoot)
    return manager.getGraph()
  })

  ipcMain.handle('dag-manager:reset-graph', async (_event, featureId: string, projectRoot: string, graph: DAGGraph) => {
    const manager = await getDAGManager(featureId, projectRoot)
    await manager.resetGraph(graph)
    return { success: true }
  })
}
