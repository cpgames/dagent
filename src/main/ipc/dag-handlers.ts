import { ipcMain } from 'electron'
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
}
