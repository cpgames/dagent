import { EventEmitter } from 'events'
import type { FeatureStatus } from '@shared/types/feature'
import type { FeatureStore } from '../storage/feature-store'

/**
 * Valid status transitions map.
 * Each status can only transition to specific next statuses.
 */
const VALID_TRANSITIONS: Record<FeatureStatus, FeatureStatus[]> = {
  planning: ['backlog'],
  backlog: ['in_progress'],
  in_progress: ['needs_attention', 'completed', 'backlog'],
  needs_attention: ['in_progress'],
  completed: ['archived'],
  archived: []
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
 * - planning → backlog
 * - backlog → in_progress
 * - in_progress → needs_attention | completed | backlog (stop)
 * - needs_attention → in_progress
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

    // Emit event for UI reactivity
    this.eventEmitter.emit('feature-status-changed', {
      featureId,
      status: newStatus,
      previousStatus: feature.status,
      timestamp: feature.updatedAt
    })
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
}
