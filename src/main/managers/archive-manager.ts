import { EventEmitter } from 'events'
import type { Feature, FeatureStatus } from '@shared/types/feature'
import type { FeatureStore } from '../storage/feature-store'
import { GlobalManager } from './global-manager'

/**
 * ArchiveManager - Manages features in the 'archived' state.
 *
 * Features arrive here after successful merge. This manager:
 * - Stores completed features for reference
 * - Clears featureManagerId to free the worktree slot
 * - Allows un-archiving to restart a feature
 *
 * No automatic processing - features stay here until manually removed
 * or un-archived.
 */
export class ArchiveManager extends GlobalManager {
  readonly managerId = 'ArchiveManager'
  readonly states: FeatureStatus[] = ['archived']

  constructor(featureStore: FeatureStore, eventEmitter: EventEmitter) {
    super(featureStore, eventEmitter)
  }

  /**
   * Override addFeature to clear featureManagerId when archiving.
   * This frees the worktree slot for new features.
   */
  addFeature(feature: Feature): void {
    // Clear worktree assignment
    if (feature.featureManagerId !== undefined) {
      console.log(`[${this.managerId}] Clearing featureManagerId ${feature.featureManagerId} for archived feature ${feature.id}`)
      feature.featureManagerId = undefined
      feature.queuePosition = undefined

      // Persist the change
      this.featureStore.saveFeature(feature).catch((error) => {
        console.error(`[${this.managerId}] Failed to save feature ${feature.id}:`, error)
      })
    }

    super.addFeature(feature)
  }

  /**
   * Un-archive a feature - transitions from archived to not_started.
   * Allows the user to restart a completed feature.
   *
   * @param featureId - Feature to un-archive
   */
  async unarchiveFeature(featureId: string): Promise<void> {
    const feature = this.getFeature(featureId)
    if (!feature) {
      throw new Error(`[${this.managerId}] Feature ${featureId} not found`)
    }

    if (feature.status !== 'archived') {
      throw new Error(`[${this.managerId}] Feature ${featureId} is not archived (status: ${feature.status})`)
    }

    console.log(`[${this.managerId}] Un-archiving feature ${featureId}`)

    // Transition back to not_started
    await this.transitionTo(featureId, 'not_started')
  }

  /**
   * Get archived features sorted by archive date (most recent first).
   */
  getArchivedFeaturesSorted(): Feature[] {
    return [...this.features].sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }
}
