/**
 * FeatureManagerPool
 *
 * Singleton that manages feature managers for feature execution.
 * Each manager can have a worktree (created lazily on demand).
 *
 * Key responsibilities:
 * - Create feature managers on startup (worktrees created lazily)
 * - Assign features to managers based on availability
 * - Manage global merge queue for completed features
 * - Coordinate with FeatureManagers for queue state
 */

import { EventEmitter } from 'events'
import { FeatureManager } from './feature-manager'
import { getGitManager } from './git-manager'
import { getMergeManager } from '../services/merge-manager'
import type {
  FeatureManagerInfo,
  FeatureManagerConfig,
  FeatureAssignmentResult,
  FeatureManagerPoolEvents,
  FeatureManagerPoolStatus
} from '../../shared/types/pool'
import { getManagerBranchName, getManagerWorktreePath, getFeatureManagerName, DEFAULT_MANAGER_CONFIG } from '../../shared/types/pool'

/**
 * Internal manager entry with class reference
 */
interface InternalManagerEntry {
  info: FeatureManagerInfo
  manager: FeatureManager
}

/**
 * FeatureManagerPool - Singleton for managing feature managers
 */
export class FeatureManagerPool extends EventEmitter {
  private static instance: FeatureManagerPool | null = null

  private projectRoot: string | null = null
  private initialized: boolean = false
  private config: FeatureManagerConfig = DEFAULT_MANAGER_CONFIG

  /** Map of featureManagerId -> manager entry */
  private managers: Map<number, InternalManagerEntry> = new Map()

  private constructor() {
    super()
  }

  // ===========================================================================
  // Singleton
  // ===========================================================================

  /**
   * Get the singleton instance
   */
  static getInstance(): FeatureManagerPool {
    if (!FeatureManagerPool.instance) {
      FeatureManagerPool.instance = new FeatureManagerPool()
    }
    return FeatureManagerPool.instance
  }

  /**
   * Reset the singleton (for testing)
   */
  static reset(): void {
    if (FeatureManagerPool.instance) {
      FeatureManagerPool.instance.removeAllListeners()
      FeatureManagerPool.instance.managers.clear()
      FeatureManagerPool.instance.initialized = false
      FeatureManagerPool.instance.projectRoot = null
    }
    FeatureManagerPool.instance = null
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the manager pool for a project.
   * Creates all 3 feature managers (but NOT worktrees - they are created lazily).
   */
  async initialize(projectRoot: string): Promise<boolean> {
    if (this.initialized && this.projectRoot === projectRoot) {
      console.log('[FeatureManagerPool] Already initialized for this project')
      return true
    }

    this.projectRoot = projectRoot
    this.managers.clear()

    // Initialize MergeManager with project root
    const mergeManager = getMergeManager()
    if (!mergeManager.isInitialized()) {
      mergeManager.initialize(projectRoot)
    }

    // Create all feature managers upfront (without worktrees)
    for (let id = 1; id <= this.config.maxManagers; id++) {
      await this.createManager(id)
    }

    // Check for any existing worktrees from previous session
    await this.discoverExistingWorktrees()

    this.initialized = true
    console.log(`[FeatureManagerPool] Initialized for ${projectRoot} with ${this.managers.size} managers`)

    return true
  }

  /**
   * Discover any existing worktrees from a previous session
   */
  private async discoverExistingWorktrees(): Promise<void> {
    const gitManager = getGitManager()
    if (!gitManager) return

    try {
      const worktrees = await gitManager.listWorktrees()
      console.log(`[FeatureManagerPool] Discovered ${worktrees.length} worktrees:`, worktrees.map(w => w.path))

      for (const wt of worktrees) {
        // Check if this is a manager worktree (e.g., "neon", "cyber", "pulse")
        for (const [managerId, entry] of this.managers) {
          const expectedPath = getManagerWorktreePath(this.projectRoot!, managerId)
          // Normalize paths for comparison (handle Windows vs Unix path separators)
          const normalizedWtPath = wt.path.replace(/\\/g, '/').toLowerCase()
          const normalizedExpectedPath = expectedPath.replace(/\\/g, '/').toLowerCase()
          const managerName = getFeatureManagerName(managerId).toLowerCase()

          if (normalizedWtPath === normalizedExpectedPath || normalizedWtPath.endsWith(`/.dagent-worktrees/${managerName}`)) {
            entry.info.worktreePath = wt.path
            entry.manager.setWorktreePath(wt.path)
            console.log(`[FeatureManagerPool] Found existing worktree for manager ${managerId} at ${wt.path}`)
          }
        }
      }
    } catch (error) {
      console.error('[FeatureManagerPool] Failed to discover existing worktrees:', error)
    }
  }

  /**
   * Create a feature manager (without worktree)
   */
  private async createManager(featureManagerId: number): Promise<void> {
    const branchName = getManagerBranchName(featureManagerId)

    console.log(`[FeatureManagerPool] Creating manager ${featureManagerId}: branch=${branchName}`)

    // Create manager without worktree path (will be set when worktree is created)
    const manager = new FeatureManager(
      featureManagerId,
      branchName,
      null, // No worktree path yet
      this.projectRoot!
    )
    this.setupManagerListeners(manager)

    const info: FeatureManagerInfo = {
      featureManagerId,
      branchName,
      worktreePath: null, // Worktree created lazily
      status: 'idle',
      currentFeatureId: null,
      queueLength: 0
    }

    this.managers.set(featureManagerId, { info, manager })

    this.emit('manager:created', { featureManagerId, branchName })
  }

  /**
   * Create worktree for a manager (lazy creation)
   */
  private async createWorktreeForManager(featureManagerId: number): Promise<string> {
    const entry = this.managers.get(featureManagerId)
    if (!entry) {
      throw new Error(`Manager ${featureManagerId} not found`)
    }

    // Already has worktree
    if (entry.info.worktreePath) {
      return entry.info.worktreePath
    }

    const branchName = entry.info.branchName
    const worktreePath = getManagerWorktreePath(this.projectRoot!, featureManagerId)

    console.log(`[FeatureManagerPool] Creating worktree for manager ${featureManagerId}: path=${worktreePath}`)

    const gitManager = getGitManager()
    if (!gitManager) {
      throw new Error('GitManager not available')
    }
    if (!gitManager.isInitialized()) {
      throw new Error('GitManager not initialized')
    }

    // Create the worktree
    console.log(`[FeatureManagerPool] Calling gitManager.createManagerWorktree(${featureManagerId}, ${branchName}, ${worktreePath})`)
    const result = await gitManager.createManagerWorktree(featureManagerId, branchName, worktreePath)
    console.log(`[FeatureManagerPool] createManagerWorktree result:`, result)
    if (!result.success) {
      throw new Error(`Failed to create manager worktree: ${result.error}`)
    }

    // Update manager and info
    entry.info.worktreePath = worktreePath
    entry.manager.setWorktreePath(worktreePath)

    this.emit('manager:initialized', { featureManagerId })

    return worktreePath
  }

  /**
   * Set up event listeners for a FeatureManager
   */
  private setupManagerListeners(manager: FeatureManager): void {
    const featureManagerId = manager.getFeatureManagerId()

    manager.on('feature:started', (data) => {
      this.updateManagerInfo(featureManagerId)
      this.emit('feature:started', { featureId: data.featureId, featureManagerId })
    })

    manager.on('feature:completed', (data) => {
      this.updateManagerInfo(featureManagerId)
      this.emit('feature:completed', { featureId: data.featureId, featureManagerId })
    })

    // Forward merge request to MergeManager (FeatureManager now submits directly)
    manager.on('merge:requested', (data) => {
      // Log for debugging - actual merge is handled by MergeManager
      console.log(`[FeatureManagerPool] Merge requested for ${data.featureId}`)
      this.emit('merge:enqueued', { featureId: data.featureId, featureManagerId })
    })

    // Handle merge completion from FeatureManager
    manager.on('feature:merged', (data) => {
      this.updateManagerInfo(featureManagerId)
      this.emit('merge:completed', { featureId: data.featureId, featureManagerId, success: true })
    })

    manager.on('feature:merge_failed', (data) => {
      this.updateManagerInfo(featureManagerId)
      this.emit('merge:failed', { featureId: data.featureId, featureManagerId, error: data.error })
    })

    manager.on('queue:updated', () => {
      this.updateManagerInfo(featureManagerId)
    })
  }

  /**
   * Update manager info from manager state
   */
  private updateManagerInfo(featureManagerId: number): void {
    const entry = this.managers.get(featureManagerId)
    if (!entry) return

    const state = entry.manager.getState()
    entry.info.currentFeatureId = state.currentFeature?.featureId ?? null
    entry.info.queueLength = state.queue.length
    entry.info.status = this.mapManagerStatus(state.status)
  }

  /**
   * Map FeatureManager status to FeatureManagerWorktreeStatus
   */
  private mapManagerStatus(status: string): 'idle' | 'busy' | 'merging' | 'initializing' {
    switch (status) {
      case 'idle': return 'idle'
      case 'preparing':
      case 'waiting_for_prep_merge':
      case 'executing': return 'busy'
      case 'waiting_for_completion_merge':
      case 'merging': return 'merging'
      default: return 'idle'
    }
  }

  // ===========================================================================
  // Feature Assignment
  // ===========================================================================

  /**
   * Assign a feature to a feature manager.
   *
   * Algorithm:
   * 1. Check if feature is already assigned to a manager -> return existing assignment
   * 2. Find a manager with empty queue -> assign (position 0)
   * 3. Otherwise assign to manager with smallest queue
   *
   * Worktree is created as part of assignment if it doesn't exist.
   */
  async assignFeature(featureId: string, targetBranch: string): Promise<FeatureAssignmentResult> {
    if (!this.initialized || !this.projectRoot) {
      throw new Error('FeatureManagerPool not initialized')
    }

    console.log(`[FeatureManagerPool] Assigning feature ${featureId} (target: ${targetBranch})`)

    // Step 0: Check if feature is already assigned to a manager
    for (const [featureManagerId, entry] of this.managers) {
      if (entry.manager.hasFeature(featureId)) {
        const position = entry.manager.getQueuePosition(featureId)
        console.log(`[FeatureManagerPool] Feature ${featureId} already assigned to manager ${featureManagerId} at position ${position}`)

        // Ensure worktree exists for this manager
        const worktreePath = await this.ensureWorktree(featureManagerId)

        return {
          featureManagerId,
          queuePosition: position ?? 0,
          isQueued: (position ?? 0) > 0,
          worktreePath
        }
      }
    }

    // Step 1: Find manager with empty queue
    for (const [featureManagerId, entry] of this.managers) {
      if (entry.manager.isIdle()) {
        // Ensure worktree exists before assigning
        const worktreePath = await this.ensureWorktree(featureManagerId)

        const position = entry.manager.enqueue(featureId)
        this.updateManagerInfo(featureManagerId)

        this.emit('feature:assigned', { featureId, featureManagerId, queuePosition: position })

        console.log(`[FeatureManagerPool] Assigned ${featureId} to idle manager ${featureManagerId}`)
        return {
          featureManagerId,
          queuePosition: position,
          isQueued: position > 0,
          worktreePath
        }
      }
    }

    // Step 2: Assign to manager with smallest queue
    let smallestManager: InternalManagerEntry | null = null
    let smallestSize = Infinity

    for (const entry of this.managers.values()) {
      const size = entry.manager.getTotalFeatures()
      if (size < smallestSize) {
        smallestSize = size
        smallestManager = entry
      }
    }

    if (!smallestManager) {
      throw new Error('No managers available')
    }

    // Ensure worktree exists before assigning
    const worktreePath = await this.ensureWorktree(smallestManager.info.featureManagerId)

    const position = smallestManager.manager.enqueue(featureId)
    this.updateManagerInfo(smallestManager.info.featureManagerId)

    this.emit('feature:assigned', {
      featureId,
      featureManagerId: smallestManager.info.featureManagerId,
      queuePosition: position
    })

    console.log(`[FeatureManagerPool] Queued ${featureId} in manager ${smallestManager.info.featureManagerId} at position ${position}`)
    return {
      featureManagerId: smallestManager.info.featureManagerId,
      queuePosition: position,
      isQueued: position > 0,
      worktreePath
    }
  }

  /**
   * Reserve a manager slot for a feature without creating the worktree.
   * This is used to:
   * 1. Assign feature to a manager (determines which one)
   * 2. Return immediately so UI can update to "creating_worktree"
   * 3. Worktree creation happens separately via ensureWorktree()
   */
  reserveManager(featureId: string): { featureManagerId: number; queuePosition: number; isQueued: boolean } {
    if (!this.initialized || !this.projectRoot) {
      throw new Error('FeatureManagerPool not initialized')
    }

    console.log(`[FeatureManagerPool] Reserving manager for feature ${featureId}`)

    // Step 0: Check if feature is already assigned to a manager
    for (const [featureManagerId, entry] of this.managers) {
      if (entry.manager.hasFeature(featureId)) {
        const position = entry.manager.getQueuePosition(featureId)
        console.log(`[FeatureManagerPool] Feature ${featureId} already assigned to manager ${featureManagerId} at position ${position}`)
        return {
          featureManagerId,
          queuePosition: position ?? 0,
          isQueued: (position ?? 0) > 0
        }
      }
    }

    // Step 1: Find manager with empty queue
    for (const [featureManagerId, entry] of this.managers) {
      if (entry.manager.isIdle()) {
        const position = entry.manager.enqueue(featureId)
        this.updateManagerInfo(featureManagerId)
        this.emit('feature:assigned', { featureId, featureManagerId, queuePosition: position })
        console.log(`[FeatureManagerPool] Reserved idle manager ${featureManagerId} for ${featureId}`)
        return {
          featureManagerId,
          queuePosition: position,
          isQueued: position > 0
        }
      }
    }

    // Step 2: Assign to manager with smallest queue
    let smallestManager: InternalManagerEntry | null = null
    let smallestSize = Infinity

    for (const entry of this.managers.values()) {
      const size = entry.manager.getTotalFeatures()
      if (size < smallestSize) {
        smallestSize = size
        smallestManager = entry
      }
    }

    if (!smallestManager) {
      throw new Error('No managers available')
    }

    const position = smallestManager.manager.enqueue(featureId)
    this.updateManagerInfo(smallestManager.info.featureManagerId)
    this.emit('feature:assigned', {
      featureId,
      featureManagerId: smallestManager.info.featureManagerId,
      queuePosition: position
    })
    console.log(`[FeatureManagerPool] Reserved manager ${smallestManager.info.featureManagerId} for ${featureId} at position ${position}`)
    return {
      featureManagerId: smallestManager.info.featureManagerId,
      queuePosition: position,
      isQueued: position > 0
    }
  }

  /**
   * Ensure worktree exists for a manager (create if needed)
   */
  async ensureWorktree(featureManagerId: number): Promise<string> {
    const entry = this.managers.get(featureManagerId)
    if (!entry) {
      throw new Error(`Manager ${featureManagerId} not found`)
    }

    if (entry.info.worktreePath) {
      return entry.info.worktreePath
    }

    return await this.createWorktreeForManager(featureManagerId)
  }

  // ===========================================================================
  // Queue Management
  // ===========================================================================

  /**
   * Get queue position for a feature across all managers
   */
  getFeatureQueuePosition(featureId: string): { featureManagerId: number; position: number } | null {
    for (const [featureManagerId, entry] of this.managers) {
      const position = entry.manager.getQueuePosition(featureId)
      if (position !== null) {
        return { featureManagerId, position }
      }
    }
    return null
  }

  /**
   * Remove a feature from queue (for deletion)
   */
  removeFeatureFromQueue(featureId: string): boolean {
    for (const [featureManagerId, entry] of this.managers) {
      if (entry.manager.dequeue(featureId)) {
        this.updateManagerInfo(featureManagerId)
        this.emit('feature:removed', { featureId, featureManagerId })
        return true
      }
    }

    // Also check if feature has pending merge requests in MergeManager
    const mergeManager = getMergeManager()
    const requests = mergeManager.getRequestsForFeature(featureId)
    for (const request of requests) {
      mergeManager.cancelRequest(request.id)
    }

    return requests.length > 0
  }

  /**
   * Get the FeatureManager by ID
   */
  getFeatureManager(featureManagerId: number): FeatureManager | null {
    return this.managers.get(featureManagerId)?.manager ?? null
  }

  /**
   * Get the FeatureManager for a specific feature
   */
  getFeatureManagerForFeature(featureId: string): FeatureManager | null {
    for (const entry of this.managers.values()) {
      if (entry.manager.hasFeature(featureId)) {
        return entry.manager
      }
    }
    return null
  }

  // ===========================================================================
  // Merge Queue (Delegated to MergeManager)
  // ===========================================================================

  /**
   * Get the current merge queue length from MergeManager
   * @deprecated Use MergeManager.getQueueLength() directly
   */
  getMergeQueueLength(): number {
    const mergeManager = getMergeManager()
    return mergeManager.getQueueLength()
  }

  /**
   * Check if a merge is in progress
   * @deprecated Use MergeManager.isBusy() directly
   */
  isMergeInProgress(): boolean {
    const mergeManager = getMergeManager()
    return mergeManager.isBusy()
  }

  // ===========================================================================
  // Status
  // ===========================================================================

  /**
   * Get status of all managers
   */
  getManagerStatus(): FeatureManagerInfo[] {
    return Array.from(this.managers.values()).map(entry => ({ ...entry.info }))
  }

  /**
   * Get total number of features across all managers
   */
  getTotalFeatures(): number {
    let total = 0
    for (const entry of this.managers.values()) {
      total += entry.manager.getTotalFeatures()
    }
    return total
  }

  /**
   * Get total queue length (features waiting, not active)
   */
  getTotalQueueLength(): number {
    let total = 0
    for (const entry of this.managers.values()) {
      total += entry.manager.getQueueLength()
    }
    return total
  }

  /**
   * Check if manager pool is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Get overall status of the feature manager pool
   */
  getStatus(): FeatureManagerPoolStatus {
    const mergeManager = getMergeManager()
    return {
      initialized: this.initialized,
      activeManagerCount: this.managers.size,
      maxManagers: this.config.maxManagers,
      totalQueuedFeatures: this.getTotalQueueLength(),
      mergeQueueLength: mergeManager.getQueueLength(),
      managers: this.getManagerStatus()
    }
  }

  /**
   * Get info for all managers
   */
  getAllManagerInfo(): FeatureManagerInfo[] {
    return this.getManagerStatus()
  }

  /**
   * Get info for a specific manager
   */
  getManagerInfo(featureManagerId: number): FeatureManagerInfo | null {
    const entry = this.managers.get(featureManagerId)
    return entry ? { ...entry.info } : null
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Clear all listeners from managers
    for (const entry of this.managers.values()) {
      entry.manager.cleanup()
    }
    this.managers.clear()
    this.initialized = false
    this.projectRoot = null
    console.log('[FeatureManagerPool] Cleaned up')
  }

  // ===========================================================================
  // Event Typing Helpers
  // ===========================================================================

  emit<K extends keyof FeatureManagerPoolEvents>(
    event: K,
    data: FeatureManagerPoolEvents[K]
  ): boolean {
    return super.emit(event, data)
  }

  on<K extends keyof FeatureManagerPoolEvents>(
    event: K,
    listener: (data: FeatureManagerPoolEvents[K]) => void
  ): this {
    return super.on(event, listener)
  }
}

/**
 * Get the singleton FeatureManagerPool instance
 */
export function getFeatureManagerPool(): FeatureManagerPool {
  return FeatureManagerPool.getInstance()
}
