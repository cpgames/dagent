import type { Task } from '@shared/types'
import type { FeatureStore } from '../storage/feature-store'

/**
 * Event types emitted during task analysis.
 * Used by subscribers to track analysis progress.
 */
export type AnalysisEvent =
  | { type: 'analyzing'; taskId: string; taskTitle: string }
  | { type: 'kept'; taskId: string; reason: string }
  | { type: 'split'; taskId: string; newTasks: Task[] }
  | { type: 'complete'; featureId: string; analyzedCount: number; splitCount: number }
  | { type: 'error'; taskId?: string; error: string }

/**
 * Result of analyzing a single task.
 * - keep: Task is appropriately scoped, no changes needed
 * - split: Task is too complex, should be split into multiple tasks
 */
export interface AnalysisResult {
  decision: 'keep' | 'split'
  reason: string
  /** New tasks to create when decision is 'split' */
  newTasks?: Omit<Task, 'id' | 'position'>[]
}

/**
 * TaskAnalysisOrchestrator - Manages the analysis loop for needs_analysis tasks.
 *
 * Responsibilities:
 * - Find all tasks with 'needs_analysis' status
 * - Coordinate PM agent analysis of each task
 * - Track analysis progress via streaming events
 * - Update task graph based on analysis decisions
 *
 * Usage:
 * ```typescript
 * const orchestrator = getTaskAnalysisOrchestrator(featureStore)
 * for await (const event of orchestrator.analyzeFeatureTasks(featureId)) {
 *   console.log(event)
 * }
 * ```
 */
export class TaskAnalysisOrchestrator {
  private featureStore: FeatureStore

  constructor(featureStore: FeatureStore) {
    this.featureStore = featureStore
  }

  /**
   * Get all tasks with 'needs_analysis' status for a feature.
   * @param featureId - Feature ID to scan
   * @returns Array of tasks needing analysis
   */
  async getPendingTasks(featureId: string): Promise<Task[]> {
    const dag = await this.featureStore.loadDag(featureId)
    if (!dag) {
      return []
    }

    return dag.nodes.filter((task) => task.status === 'needs_analysis')
  }

  /**
   * Check if a feature has any tasks needing analysis.
   * @param featureId - Feature ID to check
   * @returns true if any needs_analysis tasks exist
   */
  async hasPendingAnalysis(featureId: string): Promise<boolean> {
    const pendingTasks = await this.getPendingTasks(featureId)
    return pendingTasks.length > 0
  }

  /**
   * Analyze all needs_analysis tasks for a feature.
   * Streams events as analysis progresses.
   *
   * @param featureId - Feature ID to analyze
   * @yields AnalysisEvent for each stage of analysis
   */
  async *analyzeFeatureTasks(featureId: string): AsyncGenerator<AnalysisEvent> {
    // Placeholder implementation - will be filled in by Plan 02-03
    const pendingTasks = await this.getPendingTasks(featureId)
    let analyzedCount = 0
    let splitCount = 0

    for (const task of pendingTasks) {
      yield { type: 'analyzing', taskId: task.id, taskTitle: task.title }

      try {
        const result = await this.analyzeTask(featureId, task.id)

        if (result.decision === 'keep') {
          yield { type: 'kept', taskId: task.id, reason: result.reason }
        } else {
          // Convert newTasks to full Task objects (placeholder positions)
          const newTasks: Task[] = (result.newTasks || []).map((t, i) => ({
            ...t,
            id: `${task.id}-${i + 1}`,
            position: { x: task.position.x, y: task.position.y + (i + 1) * 100 }
          }))
          yield { type: 'split', taskId: task.id, newTasks }
          splitCount++
        }
        analyzedCount++
      } catch (error) {
        yield {
          type: 'error',
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }

    yield { type: 'complete', featureId, analyzedCount, splitCount }
  }

  /**
   * Analyze a single task to determine if it should be kept or split.
   *
   * @param featureId - Feature ID
   * @param taskId - Task ID to analyze
   * @returns Analysis result with decision and optional new tasks
   */
  async analyzeTask(_featureId: string, _taskId: string): Promise<AnalysisResult> {
    // Placeholder implementation - will be filled in by Plan 02-03
    // For now, just keep all tasks
    return {
      decision: 'keep',
      reason: 'Placeholder: Analysis not yet implemented'
    }
  }
}

// Singleton instance for global access
let orchestratorInstance: TaskAnalysisOrchestrator | null = null

/**
 * Get the singleton TaskAnalysisOrchestrator instance.
 * Creates a new instance if one doesn't exist.
 *
 * @param featureStore - FeatureStore for loading DAGs
 * @returns TaskAnalysisOrchestrator instance
 */
export function getTaskAnalysisOrchestrator(featureStore: FeatureStore): TaskAnalysisOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new TaskAnalysisOrchestrator(featureStore)
  }
  return orchestratorInstance
}

/**
 * Reset the singleton instance.
 * Used for testing or when switching projects.
 */
export function resetTaskAnalysisOrchestrator(): void {
  orchestratorInstance = null
}
