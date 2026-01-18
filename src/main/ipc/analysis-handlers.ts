import { ipcMain } from 'electron'
import {
  getTaskAnalysisOrchestrator,
  type AnalysisEvent
} from '../services/task-analysis-orchestrator'
import { getFeatureStore } from './storage-handlers'

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
