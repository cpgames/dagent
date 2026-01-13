import { ipcMain } from 'electron'
import type { DAGGraph } from '@shared/types'
import {
  topologicalSort,
  analyzeDAG,
  getReadyTasks,
  isTaskReady,
  updateTaskStatuses
} from '../dag-engine'

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
}
