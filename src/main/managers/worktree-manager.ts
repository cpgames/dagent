import { EventEmitter } from 'events'
import type { Feature, FeatureStatus } from '@shared/types/feature'
import type { FeatureStore } from '../storage/feature-store'
import { WorktreeTokenService } from './worktree-token-service'

/**
 * WorktreeManager - Abstract base class for managers that require worktree binding.
 *
 * Used for managers that:
 * - Process features in worktree isolation
 * - Need sequential execution per worktree (via tokens)
 * - Maintain queues per worktree pool (keyed by featureManagerId)
 *
 * Managers:
 * - SetupManager (creating_worktree)
 * - InvestigationManager (investigating)
 * - ReadyForPlanningManager (ready_for_planning)
 * - PlanningManager (planning)
 * - ReadyForDevelopmentManager (ready)
 * - DevelopmentManager (developing)
 * - VerificationManager (verifying)
 * - MergeManager (needs_merging, merging)
 */
export abstract class WorktreeManager {
  /** Feature store for persistence */
  protected featureStore: FeatureStore

  /** Event emitter for status changes */
  protected eventEmitter: EventEmitter

  /** Token service for sequential worktree execution */
  protected tokenService: WorktreeTokenService

  /** Unique identifier for this manager */
  abstract readonly managerId: string

  /** States handled by this manager */
  abstract readonly states: FeatureStatus[]

  /** Feature queues per worktree (keyed by featureManagerId 1-3) */
  protected featureQueues: Map<number, Feature[]> = new Map()

  /** Whether this manager is currently running */
  protected running: boolean = false

  /** Tick interval in milliseconds */
  protected tickInterval: number = 1000

  /** Tick timer reference */
  private tickTimer: NodeJS.Timeout | null = null

  constructor(featureStore: FeatureStore, eventEmitter: EventEmitter, poolSize: number = 3) {
    this.featureStore = featureStore
    this.eventEmitter = eventEmitter
    this.tokenService = WorktreeTokenService.getInstance(poolSize)

    // Initialize queues for each worktree
    for (let i = 1; i <= poolSize; i++) {
      this.featureQueues.set(i, [])
    }
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
   *
   * Features are queued by their featureManagerId.
   * Queue position is updated based on insertion order.
   */
  addFeature(feature: Feature): void {
    const managerId = feature.featureManagerId
    if (managerId === undefined) {
      console.error(`[${this.managerId}] Cannot add feature ${feature.id} - no featureManagerId assigned`)
      return
    }

    const queue = this.featureQueues.get(managerId)
    if (!queue) {
      console.error(`[${this.managerId}] Invalid featureManagerId: ${managerId}`)
      return
    }

    // Avoid duplicates
    if (queue.some((f) => f.id === feature.id)) {
      console.warn(`[${this.managerId}] Feature ${feature.id} already exists in queue ${managerId}`)
      return
    }

    // Add to queue and update position
    feature.queuePosition = queue.length
    queue.push(feature)

    console.log(`[${this.managerId}] Added feature ${feature.id} to queue ${managerId} at position ${feature.queuePosition}`)
  }

  /**
   * Remove a feature from this manager.
   * Called by FeatureRouter when a feature transitions away from states this manager handles.
   *
   * @returns The removed feature, or null if not found
   */
  removeFeature(featureId: string): Feature | null {
    for (const [managerId, queue] of this.featureQueues) {
      const index = queue.findIndex((f) => f.id === featureId)
      if (index !== -1) {
        const [feature] = queue.splice(index, 1)

        // Update queue positions for remaining features
        for (let i = index; i < queue.length; i++) {
          queue[i].queuePosition = i
        }

        console.log(`[${this.managerId}] Removed feature ${featureId} from queue ${managerId}`)
        return feature
      }
    }

    console.warn(`[${this.managerId}] Feature ${featureId} not found in any queue`)
    return null
  }

  /**
   * Get a feature by ID from any queue.
   */
  getFeature(featureId: string): Feature | null {
    for (const queue of this.featureQueues.values()) {
      const feature = queue.find((f) => f.id === featureId)
      if (feature) return feature
    }
    return null
  }

  /**
   * Get all features across all queues.
   */
  getFeatures(): Feature[] {
    const features: Feature[] = []
    for (const queue of this.featureQueues.values()) {
      features.push(...queue)
    }
    return features
  }

  /**
   * Get the total number of features across all queues.
   */
  getFeatureCount(): number {
    let count = 0
    for (const queue of this.featureQueues.values()) {
      count += queue.length
    }
    return count
  }

  /**
   * Get features in a specific worktree queue.
   */
  getQueueFeatures(worktreeId: number): Feature[] {
    return [...(this.featureQueues.get(worktreeId) ?? [])]
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
   * Process a single feature. Implemented by derived managers.
   * Called by tick() when a token is acquired.
   *
   * @param feature - Feature to process
   */
  protected abstract processFeature(feature: Feature): Promise<void>

  /**
   * Run a single tick - process the first feature in each queue that has an available token.
   * This is the main processing loop called periodically.
   */
  async tick(): Promise<void> {
    const promises: Promise<void>[] = []

    for (const [worktreeId, queue] of this.featureQueues) {
      if (queue.length === 0) continue

      // Process first feature in queue
      const feature = queue[0]

      // Create a promise that requests token, processes, and releases
      const processPromise = (async () => {
        try {
          // Request token and wait for grant
          await this.tokenService.requestToken(worktreeId, this.managerId)

          try {
            // Process the feature
            await this.processFeature(feature)
          } finally {
            // Always release token
            this.tokenService.releaseToken(worktreeId, this.managerId)
          }
        } catch (error) {
          console.error(`[${this.managerId}] Error processing feature ${feature.id}:`, error)
        }
      })()

      promises.push(processPromise)
    }

    // Wait for all worktrees to complete their tick
    await Promise.all(promises)
  }

  /**
   * Start the processing loop.
   */
  start(): void {
    if (this.running) {
      console.warn(`[${this.managerId}] Already running`)
      return
    }

    this.running = true
    console.log(`[${this.managerId}] Starting processing loop (interval: ${this.tickInterval}ms)`)

    // Run tick periodically
    this.tickTimer = setInterval(async () => {
      if (this.running) {
        await this.tick()
      }
    }, this.tickInterval)
  }

  /**
   * Stop the processing loop.
   */
  stop(): void {
    if (!this.running) {
      console.warn(`[${this.managerId}] Not running`)
      return
    }

    this.running = false
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }

    console.log(`[${this.managerId}] Stopped processing loop`)
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

    const totalCount = this.getFeatureCount()
    console.log(`[${this.managerId}] Loaded ${totalCount} features from storage`)
  }

  /**
   * Get manager status for debugging/monitoring.
   */
  getStatus(): {
    managerId: string
    states: FeatureStatus[]
    running: boolean
    queues: Array<{ worktreeId: number; featureCount: number; features: string[] }>
  } {
    const queues: Array<{ worktreeId: number; featureCount: number; features: string[] }> = []

    for (const [worktreeId, queue] of this.featureQueues) {
      queues.push({
        worktreeId,
        featureCount: queue.length,
        features: queue.map((f) => f.id)
      })
    }

    return {
      managerId: this.managerId,
      states: this.states,
      running: this.running,
      queues
    }
  }
}
