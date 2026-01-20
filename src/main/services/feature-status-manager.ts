import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import type { FeatureStatus } from '@shared/types/feature'
import type { FeatureStore } from '../storage/feature-store'
import { getTaskAnalysisOrchestrator } from './task-analysis-orchestrator'

/**
 * Valid status transitions map for the 9-state feature lifecycle.
 * Each status can only transition to specific next statuses.
 *
 * State machine flow:
 * 1. not_started: Feature exists but no worktree yet (initial state)
 * 2. creating_worktree: Worktree creation in progress
 * 3. investigating: PM agent exploring codebase
 * 4. questioning: PM agent asking user questions
 * 5. planning: PM agent creating tasks
 * 6. ready: Tasks ready for execution (replaces old 'backlog')
 * 7. in_progress: Execution running
 * 8. completed: All tasks done
 * 9. archived: Feature merged/closed
 *
 * Archive transition rules:
 * - Only 'completed' features can transition to 'archived'
 * - 'archived' can transition back to 'completed' (for merge failure recovery)
 * - Archive happens after merge to main or PR creation
 */
const VALID_TRANSITIONS: Record<FeatureStatus, FeatureStatus[]> = {
  not_started: ['creating_worktree'],  // Start triggers worktree creation
  creating_worktree: ['investigating'],  // Worktree ready -> PM investigates
  investigating: ['questioning'],  // Investigation done -> ask questions
  questioning: ['planning'],  // Questions answered -> create tasks
  planning: ['ready'],  // Tasks created -> ready for execution
  ready: ['in_progress', 'planning'],  // Start execution or re-plan
  in_progress: ['completed', 'ready'],  // Finish or pause back to ready
  completed: ['archived'],  // Archive after merge
  archived: ['completed']  // Can un-archive if needed
}

/**
 * FeatureStatusManager - Centralized feature status management service.
 *
 * Responsibilities:
 * - Validate status transitions against allowed workflow
 * - Update feature status in storage
 * - Emit events for UI reactivity
 * - Ensure all status changes are tracked and persisted
 * - Migrate existing features from old statuses to new 9-state model
 *
 * 9-State Lifecycle Workflow:
 * - not_started → creating_worktree (start triggers worktree creation)
 * - creating_worktree → investigating (worktree ready)
 * - investigating → questioning (investigation done)
 * - questioning → planning (questions answered)
 * - planning → ready (tasks created)
 * - ready → in_progress | planning (start execution or re-plan)
 * - in_progress → completed | ready (finish or pause)
 * - completed → archived (after merge)
 * - archived → completed (un-archive if needed)
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
   * Migrate existing features from old statuses to the new 9-state model.
   * This is a one-time migration for the status type update.
   * Safe to run multiple times (idempotent).
   *
   * Migration mapping:
   * - 'backlog' -> 'ready' (direct replacement)
   * - 'needs_attention' -> 'ready' (best effort recovery)
   * - Old 'not_started' now stays as 'not_started' (valid in new model)
   *
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

        // Check for old statuses that need migration
        const statusStr = feature.status as string
        let newStatus: FeatureStatus | null = null

        if (statusStr === 'backlog') {
          // 'backlog' is replaced by 'ready' in the new model
          newStatus = 'ready'
          console.log(`[FeatureStatusManager] Migrated feature ${featureId}: backlog → ready`)
        } else if (statusStr === 'needs_attention') {
          // 'needs_attention' is removed - best effort recovery to 'ready'
          newStatus = 'ready'
          console.log(`[FeatureStatusManager] Migrated feature ${featureId}: needs_attention → ready`)
        }

        if (newStatus) {
          feature.status = newStatus
          feature.updatedAt = new Date().toISOString()
          await this.featureStore.saveFeature(feature)
          migratedCount++
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
   * - If feature has a spec file, move to 'ready' and resume analysis if needed
   * - If no spec file, keep in 'planning' (user can re-trigger planning)
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

        // Check for features in ready state that might have pending analysis tasks
        // (from previous incomplete recovery)
        if (feature.status === 'ready') {
          const orchestrator = getTaskAnalysisOrchestrator(this.featureStore)
          const pendingTasks = await orchestrator.getPendingTasks(featureId)
          if (pendingTasks.length > 0) {
            console.log(`[FeatureStatusManager] Feature ${featureId} is in ready but has ${pendingTasks.length} pending analysis tasks - resuming analysis`)
            featuresToAnalyze.push(featureId)
          }
          continue
        }

        // Only process features stuck in 'planning'
        if (feature.status !== 'planning') continue

        // Check if spec file exists (indicates planning was mostly complete)
        const hasSpec = await this.featureStore.hasFeatureSpec(featureId)

        if (hasSpec) {
          // Spec exists - planning was mostly done, move to ready
          feature.status = 'ready'
          console.log(`[FeatureStatusManager] Recovered stuck feature ${featureId}: planning → ready (spec exists)`)
          // Track for analysis resumption
          featuresToAnalyze.push(featureId)
        } else {
          // No spec - planning never completed, keep in planning for user to re-trigger
          console.log(`[FeatureStatusManager] Feature ${featureId} has no spec, keeping in planning status`)
          continue  // Don't count as recovered, just skip
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

      // Resume analysis for features that were moved to ready
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
