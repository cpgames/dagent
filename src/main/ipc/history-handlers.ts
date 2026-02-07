import { ipcMain } from 'electron'
import { getHistoryManagerForDir } from '../storage/history-manager'
import { writeJson } from '../storage/json-store'
import {
  getDagPathInWorktree,
  getBacklogFeatureDir,
  getArchivedFeatureDir,
  getFeatureDirInWorktree
} from '../storage/paths'
import { getFeatureStore } from './storage-handlers'
import type { DAGGraph, HistoryState } from '@shared/types'

let projectRoot: string | null = null

export function setHistoryProjectRoot(root: string): void {
  projectRoot = root
}

/**
 * Get the correct feature directory based on feature status.
 */
async function getFeatureDir(featureId: string): Promise<string | null> {
  if (!projectRoot) return null

  const featureStore = getFeatureStore()
  if (!featureStore) return null

  const feature = await featureStore.loadFeature(featureId)
  if (!feature) return null

  // Determine the correct path based on feature status
  if (feature.status === 'archived') {
    return getArchivedFeatureDir(projectRoot, featureId)
  } else if (feature.worktreePath) {
    // Active feature in a manager worktree
    return getFeatureDirInWorktree(feature.worktreePath, featureId)
  } else {
    // Backlog feature
    return getBacklogFeatureDir(projectRoot, featureId)
  }
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

      const featureDir = await getFeatureDir(featureId)
      if (!featureDir) return { success: false, error: 'Feature not found' }

      const manager = getHistoryManagerForDir(featureDir)
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

      const featureDir = await getFeatureDir(featureId)
      if (!featureDir) return { success: false, error: 'Feature not found' }

      const manager = getHistoryManagerForDir(featureDir)
      const graph = manager.undo()

      if (graph) {
        // Get feature to find worktree path for saving
        const featureStore = getFeatureStore()
        const feature = await featureStore?.loadFeature(featureId)
        if (feature?.worktreePath) {
          const dagPath = getDagPathInWorktree(feature.worktreePath, featureId)
          await writeJson(dagPath, graph)
        }
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

      const featureDir = await getFeatureDir(featureId)
      if (!featureDir) return { success: false, error: 'Feature not found' }

      const manager = getHistoryManagerForDir(featureDir)
      const graph = manager.redo()

      if (graph) {
        // Get feature to find worktree path for saving
        const featureStore = getFeatureStore()
        const feature = await featureStore?.loadFeature(featureId)
        if (feature?.worktreePath) {
          const dagPath = getDagPathInWorktree(feature.worktreePath, featureId)
          await writeJson(dagPath, graph)
        }
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

      const featureDir = await getFeatureDir(featureId)
      if (!featureDir)
        return { canUndo: false, canRedo: false, currentVersion: 0, totalVersions: 0 }

      const manager = getHistoryManagerForDir(featureDir)
      return manager.getState()
    }
  )
}
