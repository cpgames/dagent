import { ipcMain } from 'electron'
import {
  getTaskAnalysisOrchestrator,
  type AnalysisEvent
} from '../services/task-analysis-orchestrator'
import { getFeatureStore, getProjectRoot } from './storage-handlers'
import { getDAGManager } from './dag-handlers'

// Track running analysis per feature
const runningAnalysis: Map<string, boolean> = new Map()

/**
 * Register IPC handlers for task analysis orchestrator.
 * Provides analysis:start, analysis:status, analysis:pending endpoints.
 */
export function registerAnalysisHandlers(): void {
  // Start analysis for a feature
  ipcMain.handle(
    'analysis:start',
    async (event, featureId: string): Promise<{ success: boolean; error?: string }> => {
      if (runningAnalysis.get(featureId)) {
        return { success: false, error: 'Analysis already running for this feature' }
      }

      const featureStore = getFeatureStore()
      if (!featureStore) {
        return { success: false, error: 'Feature store not initialized' }
      }

      const orchestrator = getTaskAnalysisOrchestrator(featureStore)
      runningAnalysis.set(featureId, true)

      // Start analysis in background, stream events to renderer
      startAnalysisStream(featureId, orchestrator, event.sender)

      return { success: true }
    }
  )

  // Check if analysis is running
  ipcMain.handle(
    'analysis:status',
    async (_event, featureId: string): Promise<{ running: boolean }> => {
      return { running: runningAnalysis.get(featureId) || false }
    }
  )

  // Get count of pending tasks
  ipcMain.handle(
    'analysis:pending',
    async (_event, featureId: string): Promise<{ count: number }> => {
      const featureStore = getFeatureStore()
      if (!featureStore) {
        return { count: 0 }
      }
      const orchestrator = getTaskAnalysisOrchestrator(featureStore)
      const pending = await orchestrator.getPendingTasks(featureId)
      return { count: pending.length }
    }
  )

  // Reanalyze a single task - sets it back to needs_analysis and triggers analysis
  ipcMain.handle(
    'analysis:reanalyzeTask',
    async (event, featureId: string, taskId: string): Promise<{ success: boolean; error?: string }> => {
      const featureStore = getFeatureStore()
      if (!featureStore) {
        return { success: false, error: 'Feature store not initialized' }
      }

      const projectRoot = getProjectRoot()
      if (!projectRoot) {
        return { success: false, error: 'Project root not initialized' }
      }

      try {
        // Get DAG manager and update task status to needs_analysis
        const manager = await getDAGManager(featureId, projectRoot)
        const dag = manager.getGraph()

        const taskIndex = dag.nodes.findIndex((t) => t.id === taskId)
        if (taskIndex < 0) {
          return { success: false, error: `Task ${taskId} not found` }
        }

        // Set task status to created (for re-analysis)
        dag.nodes[taskIndex].status = 'ready'
        await manager.resetGraph(dag)

        // Start analysis for this feature (will pick up the created task)
        if (!runningAnalysis.get(featureId)) {
          const orchestrator = getTaskAnalysisOrchestrator(featureStore)
          runningAnalysis.set(featureId, true)
          startAnalysisStream(featureId, orchestrator, event.sender)
        }

        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )
}

/**
 * Stream analysis events to the renderer process.
 * Runs analysis in background and sends events via IPC.
 */
async function startAnalysisStream(
  featureId: string,
  orchestrator: ReturnType<typeof getTaskAnalysisOrchestrator>,
  sender: Electron.WebContents
): Promise<void> {
  try {
    for await (const event of orchestrator.analyzeFeatureTasks(featureId)) {
      // Send event to renderer
      sender.send('analysis:event', { featureId, event })

      // Check for terminal events
      if (event.type === 'complete' || event.type === 'error') {
        break
      }
    }
  } catch (error) {
    // Send error event if analysis fails
    const errorEvent: AnalysisEvent = {
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    }
    sender.send('analysis:event', { featureId, event: errorEvent })
  } finally {
    runningAnalysis.delete(featureId)
  }
}
