import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import type { FeatureStatus } from '@shared/types/feature'
import type { FeatureStore } from '../storage/feature-store'
import { getTaskAnalysisOrchestrator } from './task-analysis-orchestrator'

/**
 * Valid status transitions map.
 * Each status can only transition to specific next statuses.
 *
 * Archive transition rules:
 * - Only 'completed' features can transition to 'archived'
 * - 'archived' can transition back to 'completed' (for merge failure recovery)
 * - Archive happens after merge to main or PR creation (Phase 99)
 */
const VALID_TRANSITIONS: Record<FeatureStatus, FeatureStatus[]> = {
  planning: ['backlog', 'needs_attention'],  // needs_attention if planning fails
  backlog: ['in_progress', 'planning'],  // planning if replan requested
  in_progress: ['needs_attention', 'completed', 'backlog'],
  needs_attention: ['in_progress', 'planning'],  // planning if replan requested
  completed: ['archived'],  // Only from completed
  archived: ['completed']  // Can revert to completed if merge fails after archive
}

/**
 * FeatureStatusManager - Centralized feature status management service.
 *
 * Responsibilities:
 * - Validate status transitions against allowed workflow
 * - Update feature status in storage
 * - Emit events for UI reactivity
 * - Ensure all status changes are tracked and persisted
 *
 * Status workflow:
 * - planning → backlog | needs_attention (if planning fails)
 * - backlog → in_progress | planning (replan)
 * - in_progress → needs_attention | completed | backlog (stop)
 * - needs_attention → in_progress | planning (replan)
 * - completed → archived
 */
export class FeatureStatusManager {
  private featureStore: FeatureStore
  private eventEmitter: EventEmitter

  constructor(featureStore: FeatureStore, eventEmitter: EventEmitter) {
    this.featureStore = featureStore
    this.eventEmitter = eventEmitter
  }

  /**
   * Validate if a status transition is allowed.
   * @param from - Current feature status
   * @param to - Desired feature status
   * @returns true if transition is valid, false otherwise
   */
  validateTransition(from: FeatureStatus, to: FeatureStatus): boolean {
    const allowedTransitions = VALID_TRANSITIONS[from]
    return allowedTransitions.includes(to)
  }

  /**
   * Update feature status with validation and persistence.
   * @param featureId - Feature ID
   * @param newStatus - New status to transition to
   * @throws Error if feature not found or transition is invalid
   */
  async updateFeatureStatus(featureId: string, newStatus: FeatureStatus): Promise<void> {
    // Load current feature from storage
    const feature = await this.featureStore.loadFeature(featureId)
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`)
    }

    // Validate transition
    if (!this.validateTransition(feature.status, newStatus)) {
      throw new Error(
        `Invalid status transition for feature ${featureId}: ${feature.status} → ${newStatus}`
      )
    }

    // Update feature status and timestamp
    feature.status = newStatus
    feature.updatedAt = new Date().toISOString()

    // Persist to storage
    await this.featureStore.saveFeature(feature)

    // Emit event for internal listeners
    this.eventEmitter.emit('feature-status-changed', {
      featureId,
      status: newStatus,
      previousStatus: feature.status,
      timestamp: feature.updatedAt
    })

    // Broadcast to all renderer windows for UI reactivity
    const windows = BrowserWindow.getAllWindows()
    console.log(`[FeatureStatusManager] Broadcasting status change to ${windows.length} windows: ${featureId} -> ${newStatus}`)
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('feature:status-changed', { featureId, status: newStatus })
      }
    }
  }

  /**
   * Migrate existing features from 'not_started' to 'planning'.
   * This is a one-time migration for the status type update.
   * Safe to run multiple times (idempotent).
   * @returns Number of features migrated
   */
  async migrateExistingFeatures(): Promise<number> {
    let migratedCount = 0

    try {
      // Get all feature IDs
      const featureIds = await this.featureStore.listFeatures()

      for (const featureId of featureIds) {
        const feature = await this.featureStore.loadFeature(featureId)
        if (!feature) continue

        // Check if feature has old 'not_started' status
        // TypeScript won't allow this directly, so we check via type assertion
        if ((feature.status as string) === 'not_started') {
          // Update to 'planning'
          feature.status = 'planning'
          feature.updatedAt = new Date().toISOString()
          await this.featureStore.saveFeature(feature)
          migratedCount++

          console.log(`[FeatureStatusManager] Migrated feature ${featureId}: not_started → planning`)
        }
      }

      if (migratedCount > 0) {
        console.log(`[FeatureStatusManager] Migration complete: ${migratedCount} feature(s) updated`)
      }
    } catch (error) {
      console.error('[FeatureStatusManager] Migration error:', error)
      throw error
    }

    return migratedCount
  }

  /**
   * Get allowed next statuses for a given status.
   * @param currentStatus - Current feature status
   * @returns Array of allowed next statuses
   */
  getAllowedTransitions(currentStatus: FeatureStatus): FeatureStatus[] {
    return VALID_TRANSITIONS[currentStatus] || []
  }

  /**
   * Recover features stuck in 'planning' status.
   * This happens when the app is closed during planning - the async process
   * is interrupted and never completes, leaving the feature stuck.
   *
   * Recovery strategy:
   * - If feature has a spec file, move to 'backlog' and resume analysis if needed
   * - If no spec file, move to 'needs_attention' (planning needs to restart)
   *
   * @returns Number of features recovered
   */
  async recoverStuckPlanningFeatures(): Promise<number> {
    console.log(`[FeatureStatusManager] recoverStuckPlanningFeatures called`)
    let recoveredCount = 0
    const featuresToAnalyze: string[] = []

    try {
      const featureIds = await this.featureStore.listFeatures()
      console.log(`[FeatureStatusManager] Found ${featureIds.length} features to check`)

      for (const featureId of featureIds) {
        const feature = await this.featureStore.loadFeature(featureId)
        if (!feature) continue

        console.log(`[FeatureStatusManager] Feature ${featureId} has status: ${feature.status}`)

        // Check for features in backlog that might have pending analysis tasks
        // (from previous incomplete recovery)
        if (feature.status === 'backlog') {
          const orchestrator = getTaskAnalysisOrchestrator(this.featureStore)
          const pendingTasks = await orchestrator.getPendingTasks(featureId)
          if (pendingTasks.length > 0) {
            console.log(`[FeatureStatusManager] Feature ${featureId} is in backlog but has ${pendingTasks.length} pending analysis tasks - resuming analysis`)
            featuresToAnalyze.push(featureId)
          }
          continue
        }

        // Only process features stuck in 'planning'
        if (feature.status !== 'planning') continue

        // Check if spec file exists (indicates planning was mostly complete)
        const hasSpec = await this.featureStore.hasFeatureSpec(featureId)

        if (hasSpec) {
          // Spec exists - planning was mostly done, move to backlog
          feature.status = 'backlog'
          console.log(`[FeatureStatusManager] Recovered stuck feature ${featureId}: planning → backlog (spec exists)`)
          // Track for analysis resumption
          featuresToAnalyze.push(featureId)
        } else {
          // No spec - planning never completed, needs attention
          feature.status = 'needs_attention'
          console.log(`[FeatureStatusManager] Recovered stuck feature ${featureId}: planning → needs_attention (no spec)`)
        }

        feature.updatedAt = new Date().toISOString()
        await this.featureStore.saveFeature(feature)
        recoveredCount++

        // Broadcast status change to UI
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('feature:status-changed', { featureId, status: feature.status })
          }
        }
      }

      if (recoveredCount > 0) {
        console.log(`[FeatureStatusManager] Recovery complete: ${recoveredCount} stuck feature(s) recovered`)
      }

      // Resume analysis for features that were moved to backlog
      // This handles tasks that were left in needs_analysis status
      for (const featureId of featuresToAnalyze) {
        this.resumeAnalysisInBackground(featureId)
      }
    } catch (error) {
      console.error('[FeatureStatusManager] Recovery error:', error)
      // Don't throw - recovery failure shouldn't block app startup
    }

    return recoveredCount
  }

  /**
   * Resume analysis for a feature in the background.
   * Checks if there are pending needs_analysis tasks and processes them.
   */
  private async resumeAnalysisInBackground(featureId: string): Promise<void> {
    console.log(`[FeatureStatusManager] resumeAnalysisInBackground called for ${featureId}`)
    try {
      const orchestrator = getTaskAnalysisOrchestrator(this.featureStore)
      console.log(`[FeatureStatusManager] Got orchestrator, checking pending tasks...`)
      const pendingTasks = await orchestrator.getPendingTasks(featureId)
      console.log(`[FeatureStatusManager] getPendingTasks returned ${pendingTasks.length} tasks`)

      if (pendingTasks.length === 0) {
        console.log(`[FeatureStatusManager] No pending analysis for ${featureId}`)
        return
      }

      console.log(`[FeatureStatusManager] Resuming analysis for ${featureId} (${pendingTasks.length} pending tasks)`)

      // Run analysis with timeout
      const ANALYSIS_TIMEOUT_MS = 600000 // 10 minutes

      const analysisPromise = (async () => {
        for await (const event of orchestrator.analyzeFeatureTasks(featureId)) {
          console.log(`[FeatureStatusManager] Analysis event for ${featureId}: ${event.type}`)

          // Broadcast to UI
          const windows = BrowserWindow.getAllWindows()
          for (const win of windows) {
            if (!win.isDestroyed()) {
              win.webContents.send('analysis:event', { featureId, event })
            }
          }

          if (event.type === 'complete') {
            console.log(`[FeatureStatusManager] Analysis complete for ${featureId}`)
            break
          }
        }
      })()

      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          console.warn(`[FeatureStatusManager] Analysis timeout for ${featureId}`)
          resolve()
        }, ANALYSIS_TIMEOUT_MS)
      })

      await Promise.race([analysisPromise, timeoutPromise])
    } catch (error) {
      console.error(`[FeatureStatusManager] Analysis resumption error for ${featureId}:`, error)
      // Don't throw - analysis failure shouldn't affect other features
    }
  }
}
