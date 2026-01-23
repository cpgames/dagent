import { EventEmitter } from 'events'
import type { FeatureStatus } from '@shared/types/feature'
import type { FeatureStore } from '../storage/feature-store'
import { GlobalManager } from './global-manager'

/**
 * BacklogManager - Manages features in the 'not_started' state.
 *
 * This is a simple holding area for features that have been created
 * but not yet started by the user. Features remain here until the user
 * manually starts them, at which point they transition to 'creating_worktree'.
 *
 * No automatic processing - purely user-driven transitions.
 */
export class BacklogManager extends GlobalManager {
  readonly managerId = 'BacklogManager'
  readonly states: FeatureStatus[] = ['not_started']

  constructor(featureStore: FeatureStore, eventEmitter: EventEmitter) {
    super(featureStore, eventEmitter)
  }

  /**
   * Start a feature - transitions from not_started to creating_worktree.
   * Called when user clicks "Start" on a backlog feature.
   *
   * @param featureId - Feature to start
   * @param featureManagerId - The worktree pool ID to assign (1-3)
   */
  async startFeature(featureId: string, featureManagerId: number): Promise<void> {
    const feature = this.getFeature(featureId)
    if (!feature) {
      throw new Error(`[${this.managerId}] Feature ${featureId} not found`)
    }

    if (feature.status !== 'not_started') {
      throw new Error(`[${this.managerId}] Feature ${featureId} is not in backlog (status: ${feature.status})`)
    }

    // Assign the worktree pool
    feature.featureManagerId = featureManagerId

    // Capture the current branch as target (for later merge)
    // This will be set by the caller before starting

    console.log(`[${this.managerId}] Starting feature ${featureId} with manager ID ${featureManagerId}`)

    // Transition to worktree creation
    await this.transitionTo(featureId, 'creating_worktree')
  }
}
