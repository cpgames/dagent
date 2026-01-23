import { EventEmitter } from 'events'
import type { Feature, FeatureStatus } from '@shared/types/feature'
import type { FeatureStore } from '../storage/feature-store'

/**
 * GlobalManager - Abstract base class for managers that handle simple feature lists.
 *
 * Used for managers that don't require worktree binding or queuing:
 * - BacklogManager (not_started)
 * - ArchiveManager (archived)
 *
 * Features are stored in a simple array and processed without worktree isolation.
 */
export abstract class GlobalManager {
  /** Feature store for persistence */
  protected featureStore: FeatureStore

  /** Event emitter for status changes */
  protected eventEmitter: EventEmitter

  /** Unique identifier for this manager */
  abstract readonly managerId: string

  /** States handled by this manager */
  abstract readonly states: FeatureStatus[]

  /** In-memory feature list */
  protected features: Feature[] = []

  constructor(featureStore: FeatureStore, eventEmitter: EventEmitter) {
    this.featureStore = featureStore
    this.eventEmitter = eventEmitter
  }

  /**
   * Check if this manager handles the given status.
   */
  handlesStatus(status: FeatureStatus): boolean {
    return this.states.includes(status)
  }

  /**
   * Add a feature to this manager.
   * Called by FeatureRouter when a feature transitions to a state this manager handles.
   */
  addFeature(feature: Feature): void {
    // Avoid duplicates
    if (this.features.some((f) => f.id === feature.id)) {
      console.warn(`[${this.managerId}] Feature ${feature.id} already exists in manager`)
      return
    }

    this.features.push(feature)
    console.log(`[${this.managerId}] Added feature: ${feature.id} (total: ${this.features.length})`)
  }

  /**
   * Remove a feature from this manager.
   * Called by FeatureRouter when a feature transitions away from states this manager handles.
   *
   * @returns The removed feature, or null if not found
   */
  removeFeature(featureId: string): Feature | null {
    const index = this.features.findIndex((f) => f.id === featureId)
    if (index === -1) {
      console.warn(`[${this.managerId}] Feature ${featureId} not found in manager`)
      return null
    }

    const [feature] = this.features.splice(index, 1)
    console.log(`[${this.managerId}] Removed feature: ${featureId} (total: ${this.features.length})`)
    return feature
  }

  /**
   * Get a feature by ID.
   */
  getFeature(featureId: string): Feature | null {
    return this.features.find((f) => f.id === featureId) ?? null
  }

  /**
   * Get all features in this manager.
   */
  getFeatures(): Feature[] {
    return [...this.features]
  }

  /**
   * Get the number of features in this manager.
   */
  getFeatureCount(): number {
    return this.features.length
  }

  /**
   * Transition a feature to a new status.
   * Updates the feature in storage and emits a transition event for the router.
   *
   * @param featureId - Feature to transition
   * @param nextStatus - Target status
   */
  protected async transitionTo(featureId: string, nextStatus: FeatureStatus): Promise<void> {
    const feature = this.getFeature(featureId)
    if (!feature) {
      throw new Error(`[${this.managerId}] Cannot transition - feature ${featureId} not found`)
    }

    const previousStatus = feature.status

    // Update feature status
    feature.status = nextStatus
    feature.updatedAt = new Date().toISOString()

    // Persist to storage
    await this.featureStore.saveFeature(feature)

    console.log(`[${this.managerId}] Transitioning feature ${featureId}: ${previousStatus} → ${nextStatus}`)

    // Emit transition event for FeatureRouter to handle
    this.eventEmitter.emit('feature-transition', {
      featureId,
      fromStatus: previousStatus,
      toStatus: nextStatus,
      feature
    })
  }

  /**
   * Load features from storage that match this manager's states.
   * Called during initialization to restore state.
   */
  async loadFeatures(): Promise<void> {
    const featureIds = await this.featureStore.listFeatures()

    for (const featureId of featureIds) {
      const feature = await this.featureStore.loadFeature(featureId)
      if (feature && this.handlesStatus(feature.status)) {
        this.addFeature(feature)
      }
    }

    console.log(`[${this.managerId}] Loaded ${this.features.length} features from storage`)
  }

  /**
   * Get manager status for debugging/monitoring.
   */
  getStatus(): { managerId: string; states: FeatureStatus[]; featureCount: number; features: string[] } {
    return {
      managerId: this.managerId,
      states: this.states,
      featureCount: this.features.length,
      features: this.features.map((f) => f.id)
    }
  }
}
