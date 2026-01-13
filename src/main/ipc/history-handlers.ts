import { ipcMain } from 'electron'
import { getHistoryManager } from '../storage/history-manager'
import { writeJson } from '../storage/json-store'
import { getDagPath } from '../storage/paths'
import type { DAGGraph, HistoryState } from '@shared/types'

let projectRoot: string | null = null

export function setHistoryProjectRoot(root: string): void {
  projectRoot = root
}

export function registerHistoryHandlers(): void {
  // Push a new version after DAG modification
  ipcMain.handle(
    'history:pushVersion',
    async (
      _event,
      featureId: string,
      graph: DAGGraph,
      description?: string
    ): Promise<{ success: boolean; state?: HistoryState; error?: string }> => {
      if (!projectRoot) return { success: false, error: 'Project not initialized' }

      const manager = getHistoryManager(projectRoot, featureId)
      manager.pushVersion(graph, description)
      return { success: true, state: manager.getState() }
    }
  )

  // Undo
  ipcMain.handle(
    'history:undo',
    async (
      _event,
      featureId: string
    ): Promise<{ success: boolean; graph?: DAGGraph; state?: HistoryState; error?: string }> => {
      if (!projectRoot) return { success: false, error: 'Project not initialized' }

      const manager = getHistoryManager(projectRoot, featureId)
      const graph = manager.undo()

      if (graph) {
        // Save the restored graph as current
        const dagPath = getDagPath(projectRoot, featureId)
        await writeJson(dagPath, graph)
        return { success: true, graph, state: manager.getState() }
      }

      return { success: false, error: 'Nothing to undo' }
    }
  )

  // Redo
  ipcMain.handle(
    'history:redo',
    async (
      _event,
      featureId: string
    ): Promise<{ success: boolean; graph?: DAGGraph; state?: HistoryState; error?: string }> => {
      if (!projectRoot) return { success: false, error: 'Project not initialized' }

      const manager = getHistoryManager(projectRoot, featureId)
      const graph = manager.redo()

      if (graph) {
        // Save the restored graph as current
        const dagPath = getDagPath(projectRoot, featureId)
        await writeJson(dagPath, graph)
        return { success: true, graph, state: manager.getState() }
      }

      return { success: false, error: 'Nothing to redo' }
    }
  )

  // Get current history state
  ipcMain.handle(
    'history:getState',
    async (_event, featureId: string): Promise<HistoryState> => {
      if (!projectRoot)
        return { canUndo: false, canRedo: false, currentVersion: 0, totalVersions: 0 }

      const manager = getHistoryManager(projectRoot, featureId)
      return manager.getState()
    }
  )
}
