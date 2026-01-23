import { EventEmitter } from 'events'
import type { Feature, FeatureStatus } from '@shared/types/feature'
import type { GlobalManager } from './global-manager'
import type { WorktreeManager } from './worktree-manager'

/** Union type for all manager types */
type Manager = GlobalManager | WorktreeManager

/**
 * FeatureRouter - Central routing service for the state-based manager architecture.
 *
 * Responsibilities:
 * - Route features to appropriate manager based on status
 * - Handle state transitions (remove from old manager, add to new)
 * - Start/stop all managers
 * - Provide unified status for debugging
 *
 * The router listens for 'feature-transition' events emitted by managers
 * and automatically routes features to the correct manager.
 */
export class FeatureRouter {
  /** Event emitter shared with all managers */
  private eventEmitter: EventEmitter

  /** Managers indexed by the statuses they handle */
  private managersByStatus: Map<FeatureStatus, Manager> = new Map()

  /** All registered managers for lifecycle control */
  private managers: Manager[] = []

  /** Whether the router is running */
  private running: boolean = false

  constructor(eventEmitter: EventEmitter) {
    this.eventEmitter = eventEmitter

    // Listen for transition events from managers
    this.eventEmitter.on('feature-transition', this.handleTransition.bind(this))
  }

  /**
   * Register a manager with the router.
   * The manager's states determine which features it handles.
   */
  registerManager(manager: Manager): void {
    this.managers.push(manager)

    // Map each state to its manager
    for (const status of manager.states) {
      if (this.managersByStatus.has(status)) {
        console.warn(`[FeatureRouter] Status ${status} already handled by another manager`)
      }
      this.managersByStatus.set(status, manager)
    }

    console.log(`[FeatureRouter] Registered manager ${manager.managerId} for states: ${manager.states.join(', ')}`)
  }

  /**
   * Get the manager that handles a given status.
   */
  getManagerForStatus(status: FeatureStatus): Manager | null {
    return this.managersByStatus.get(status) ?? null
  }

  /**
   * Route a feature to the appropriate manager based on its status.
   * Used when a feature is first created or loaded from storage.
   */
  routeFeature(feature: Feature): void {
    const manager = this.getManagerForStatus(feature.status)
    if (!manager) {
      console.error(`[FeatureRouter] No manager found for status: ${feature.status}`)
      return
    }

    manager.addFeature(feature)
  }

  /**
   * Handle a feature state transition.
   * Removes the feature from its current manager and adds it to the new one.
   *
   * Called automatically when managers emit 'feature-transition' events.
   */
  private handleTransition(event: {
    featureId: string
    fromStatus: FeatureStatus
    toStatus: FeatureStatus
    feature: Feature
  }): void {
    const { featureId, fromStatus, toStatus, feature } = event

    console.log(`[FeatureRouter] Handling transition: ${featureId} from ${fromStatus} to ${toStatus}`)

    // Remove from old manager
    const oldManager = this.getManagerForStatus(fromStatus)
    if (oldManager) {
      oldManager.removeFeature(featureId)
    } else {
      console.warn(`[FeatureRouter] No manager found for old status: ${fromStatus}`)
    }

    // Add to new manager
    const newManager = this.getManagerForStatus(toStatus)
    if (newManager) {
      newManager.addFeature(feature)
    } else {
      console.warn(`[FeatureRouter] No manager found for new status: ${toStatus}`)
    }

    // Emit event for UI updates
    this.eventEmitter.emit('feature-routed', {
      featureId,
      fromStatus,
      toStatus,
      fromManager: oldManager?.managerId,
      toManager: newManager?.managerId
    })
  }

  /**
   * Start all WorktreeManagers.
   * GlobalManagers don't have processing loops.
   */
  start(): void {
    if (this.running) {
      console.warn('[FeatureRouter] Already running')
      return
    }

    this.running = true
    console.log('[FeatureRouter] Starting all managers')

    for (const manager of this.managers) {
      // Only WorktreeManagers have start/stop methods
      if ('start' in manager && typeof manager.start === 'function') {
        manager.start()
      }
    }
  }

  /**
   * Stop all WorktreeManagers.
   */
  stop(): void {
    if (!this.running) {
      console.warn('[FeatureRouter] Not running')
      return
    }

    this.running = false
    console.log('[FeatureRouter] Stopping all managers')

    for (const manager of this.managers) {
      // Only WorktreeManagers have start/stop methods
      if ('stop' in manager && typeof manager.stop === 'function') {
        manager.stop()
      }
    }
  }

  /**
   * Load features from storage and route to appropriate managers.
   * Called during application initialization.
   */
  async loadFeatures(): Promise<void> {
    console.log('[FeatureRouter] Loading features into managers')

    for (const manager of this.managers) {
      await manager.loadFeatures()
    }
  }

  /**
   * Get router status for debugging/monitoring.
   */
  getStatus(): {
    running: boolean
    managers: Array<ReturnType<Manager['getStatus']>>
    statusMapping: Record<string, string>
  } {
    const statusMapping: Record<string, string> = {}
    for (const [status, manager] of this.managersByStatus) {
      statusMapping[status] = manager.managerId
    }

    return {
      running: this.running,
      managers: this.managers.map((m) => m.getStatus()),
      statusMapping
    }
  }

  /**
   * Check if all required statuses have managers.
   */
  validateCoverage(requiredStatuses: FeatureStatus[]): { valid: boolean; missing: FeatureStatus[] } {
    const missing: FeatureStatus[] = []

    for (const status of requiredStatuses) {
      if (!this.managersByStatus.has(status)) {
        missing.push(status)
      }
    }

    return {
      valid: missing.length === 0,
      missing
    }
  }
}
