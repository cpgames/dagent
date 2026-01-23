/**
 * FeatureManager
 *
 * Manages a queue of features for a single worktree slot.
 * Each manager:
 * - Maintains a FIFO queue of features waiting to use the worktree
 * - Handles the lifecycle of the current feature (preparing, executing, completing)
 * - Uses MergeManager for all merge operations (preparation and completion)
 * - Uses a state machine to track merge request completion
 * - Emits events for feature and task state changes
 *
 * State Machine:
 * idle → preparing → (waiting_for_prep_merge) → executing → (waiting_for_completion_merge) → idle
 */

import { EventEmitter } from 'events'
import type {
  FeatureQueueEntry,
  FeatureManagerState,
  FeatureManagerEvents
} from '../../shared/types/pool'
import { getMergeManager } from '../services/merge-manager'
import type { MergeOperationResult } from '../services/merge-types'
import { getFeatureStatusManager } from '../ipc/feature-handlers'

/**
 * FeatureManager class - manages feature queue for a single worktree
 */
export class FeatureManager extends EventEmitter {
  private state: FeatureManagerState
  private _projectRoot: string

  constructor(
    featureManagerId: number,
    branchName: string,
    worktreePath: string | null,
    projectRoot: string
  ) {
    super()
    this._projectRoot = projectRoot
    this.state = {
      featureManagerId,
      branchName,
      worktreePath,
      currentFeature: null,
      queue: [],
      currentTaskId: null,
      status: 'idle',
      pendingMergeRequestId: null
    }

    // Subscribe to MergeManager events
    this.setupMergeManagerListeners()
  }

  /**
   * Setup listeners for MergeManager events
   */
  private setupMergeManagerListeners(): void {
    const mergeManager = getMergeManager()

    // Listen for merge started to transition needs_merging → merging
    mergeManager.on('merge:started', ({ request }: { request: { id: string; featureId: string } }) => {
      // Only handle our pending request
      if (request.id !== this.state.pendingMergeRequestId) {
        return
      }

      // Transition feature status: needs_merging → merging
      const statusManager = getFeatureStatusManager()
      statusManager.updateFeatureStatus(request.featureId, 'merging')
        .then(() => {
          console.log(`[FeatureManager:${this.state.featureManagerId}] Feature ${request.featureId} status: merging`)
        })
        .catch((error) => {
          console.error(`[FeatureManager:${this.state.featureManagerId}] Failed to update feature status to merging:`, error)
        })
    })

    mergeManager.on('merge:completed', (result: MergeOperationResult) => {
      // Only handle our pending request
      if (result.request.id !== this.state.pendingMergeRequestId) {
        return
      }

      this.state.pendingMergeRequestId = null
      this.handleMergeCompletion(result)
    })
  }

  /**
   * Handle merge completion from MergeManager
   */
  private handleMergeCompletion(result: MergeOperationResult): void {
    const featureId = this.state.currentFeature?.featureId

    if (this.state.status === 'waiting_for_prep_merge') {
      if (result.success) {
        console.log(`[FeatureManager:${this.state.featureManagerId}] Preparation merge completed for ${featureId}`)
        this.state.status = 'executing'
        this.emit('feature:prepared', { featureId: featureId!, targetBranch: this.state.currentFeature?.targetBranch || '' })
      } else {
        console.error(`[FeatureManager:${this.state.featureManagerId}] Preparation merge failed for ${featureId}:`, result.error)
        this.state.status = 'preparing'
        this.emit('feature:prep_failed', { featureId: featureId!, error: result.error || 'Unknown error' })
      }
    } else if (this.state.status === 'waiting_for_completion_merge') {
      if (result.success) {
        console.log(`[FeatureManager:${this.state.featureManagerId}] Completion merge succeeded for ${featureId}`)
        this.finishCurrentFeature(true)
      } else {
        console.error(`[FeatureManager:${this.state.featureManagerId}] Completion merge failed for ${featureId}:`, result.error)
        // Stay in waiting state for retry
        this.state.status = 'merging'
        this.emit('feature:merge_failed', { featureId: featureId!, error: result.error || 'Unknown error' })
      }
    }
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  getState(): FeatureManagerState {
    return { ...this.state }
  }

  getFeatureManagerId(): number {
    return this.state.featureManagerId
  }

  getBranchName(): string {
    return this.state.branchName
  }

  getWorktreePath(): string | null {
    return this.state.worktreePath
  }

  setWorktreePath(path: string): void {
    this.state.worktreePath = path
  }

  getProjectRoot(): string {
    return this._projectRoot
  }

  getCurrentFeatureId(): string | null {
    return this.state.currentFeature?.featureId ?? null
  }

  isIdle(): boolean {
    return this.state.status === 'idle' && this.state.currentFeature === null
  }

  hasEmptyQueue(): boolean {
    return this.state.queue.length === 0
  }

  getTotalFeatures(): number {
    return (this.state.currentFeature ? 1 : 0) + this.state.queue.length
  }

  getQueueLength(): number {
    return this.state.queue.length
  }

  // ===========================================================================
  // Queue Operations
  // ===========================================================================

  /**
   * Add a feature to the queue
   * @returns Queue position (0 if immediately active, 1+ if queued)
   */
  enqueue(featureId: string, targetBranch: string): number {
    const entry: FeatureQueueEntry = {
      featureId,
      targetBranch,
      addedAt: new Date().toISOString(),
      status: 'queued'
    }

    // If no current feature, this becomes the current feature
    if (this.state.currentFeature === null && this.state.status === 'idle') {
      this.state.currentFeature = { ...entry, status: 'active' }
      console.log(`[FeatureManager:${this.state.featureManagerId}] Feature ${featureId} is now active`)
      return 0
    }

    // Otherwise, add to queue
    this.state.queue.push(entry)
    const position = this.state.queue.length

    console.log(`[FeatureManager:${this.state.featureManagerId}] Feature ${featureId} queued at position ${position}`)
    this.emit('queue:updated', { queueLength: this.state.queue.length })

    return position
  }

  /**
   * Remove a feature from the queue (silent removal for deletion)
   */
  dequeue(featureId: string): boolean {
    if (this.state.currentFeature?.featureId === featureId) {
      console.log(`[FeatureManager:${this.state.featureManagerId}] Cannot dequeue active feature ${featureId}`)
      return false
    }

    const index = this.state.queue.findIndex(e => e.featureId === featureId)
    if (index === -1) {
      return false
    }

    this.state.queue.splice(index, 1)
    console.log(`[FeatureManager:${this.state.featureManagerId}] Feature ${featureId} removed from queue`)
    this.emit('queue:updated', { queueLength: this.state.queue.length })

    return true
  }

  getQueuePosition(featureId: string): number | null {
    if (this.state.currentFeature?.featureId === featureId) {
      return 0
    }

    const index = this.state.queue.findIndex(e => e.featureId === featureId)
    if (index === -1) {
      return null
    }

    return index + 1
  }

  hasFeature(featureId: string): boolean {
    return this.getQueuePosition(featureId) !== null
  }

  // ===========================================================================
  // Feature Lifecycle
  // ===========================================================================

  /**
   * Start the next feature from the queue.
   * Initiates preparation merge to sync manager branch with target.
   */
  async startNextFeature(): Promise<boolean> {
    if (this.state.currentFeature !== null) {
      console.log(`[FeatureManager:${this.state.featureManagerId}] Already has active feature ${this.state.currentFeature.featureId}`)
      return false
    }

    const nextEntry = this.state.queue.shift()
    if (!nextEntry) {
      console.log(`[FeatureManager:${this.state.featureManagerId}] Queue is empty`)
      this.state.status = 'idle'
      return false
    }

    this.state.currentFeature = { ...nextEntry, status: 'active' }
    this.state.status = 'preparing'

    console.log(`[FeatureManager:${this.state.featureManagerId}] Starting feature ${nextEntry.featureId}`)

    this.emit('feature:started', {
      featureId: nextEntry.featureId,
      targetBranch: nextEntry.targetBranch
    })
    this.emit('queue:updated', { queueLength: this.state.queue.length })

    // Request preparation merge: target → manager
    await this.requestPreparationMerge(nextEntry.featureId, nextEntry.targetBranch)

    return true
  }

  /**
   * Request preparation merge from MergeManager
   * Syncs manager branch with target before starting feature work
   */
  async requestPreparationMerge(featureId: string, targetBranch: string): Promise<void> {
    if (!this.state.worktreePath) {
      console.error(`[FeatureManager:${this.state.featureManagerId}] No worktree path for preparation merge`)
      this.emit('feature:prep_failed', { featureId, error: 'No worktree path' })
      return
    }

    const mergeManager = getMergeManager()

    // Check if MergeManager is initialized
    if (!mergeManager.isInitialized()) {
      // Initialize with project root
      mergeManager.initialize(this._projectRoot)
    }

    try {
      this.state.status = 'waiting_for_prep_merge'

      const request = await mergeManager.submitRequest({
        type: 'preparation',
        sourceBranch: targetBranch, // target is source (we're pulling FROM target INTO manager)
        targetBranch: this.state.branchName, // manager branch is target
        featureId,
        featureManagerId: this.state.featureManagerId,
        workingDirectory: this.state.worktreePath,
        useAIConflictResolution: true,
        priority: 10 // Preparation merges are high priority
      })

      this.state.pendingMergeRequestId = request.id
      console.log(`[FeatureManager:${this.state.featureManagerId}] Submitted preparation merge request ${request.id}`)
    } catch (error) {
      console.error(`[FeatureManager:${this.state.featureManagerId}] Failed to submit preparation merge:`, error)
      this.state.status = 'preparing'
      this.emit('feature:prep_failed', { featureId, error: (error as Error).message })
    }
  }

  /**
   * Mark the manager branch as prepared for the current feature.
   * Called externally if preparation merge is not needed or was done externally.
   */
  markPrepared(): void {
    if (this.state.status === 'preparing' || this.state.status === 'waiting_for_prep_merge') {
      this.state.status = 'executing'
      console.log(`[FeatureManager:${this.state.featureManagerId}] Manager prepared, ready for execution`)
    }
  }

  /**
   * Set the currently executing task ID
   */
  setCurrentTask(taskId: string | null): void {
    const previousTaskId = this.state.currentTaskId
    this.state.currentTaskId = taskId

    if (taskId && this.state.currentFeature) {
      this.emit('task:started', {
        featureId: this.state.currentFeature.featureId,
        taskId
      })
    } else if (previousTaskId && this.state.currentFeature) {
      this.emit('task:completed', {
        featureId: this.state.currentFeature.featureId,
        taskId: previousTaskId
      })
    }
  }

  /**
   * Complete the current feature and request completion merge.
   * Called by orchestrator after status transitions are done.
   *
   * Note: Status transitions (in_progress → completed → needs_merging) are
   * handled by the orchestrator's transitionToNeedsMerging(). This method
   * only handles internal state and merge request submission.
   */
  async completeCurrentFeature(): Promise<void> {
    if (!this.state.currentFeature) {
      console.log(`[FeatureManager:${this.state.featureManagerId}] No current feature to complete`)
      return
    }

    const featureId = this.state.currentFeature.featureId
    const targetBranch = this.state.currentFeature.targetBranch

    this.state.status = 'waiting_for_completion_merge'
    this.state.currentTaskId = null

    console.log(`[FeatureManager:${this.state.featureManagerId}] Feature ${featureId} requesting completion merge`)

    this.emit('feature:completed', { featureId })

    // Request bidirectional completion merge
    await this.requestCompletionMerge(featureId, targetBranch)
  }

  /**
   * Request completion merge from MergeManager
   * Bidirectional: target → manager (sync), then manager → target (push)
   */
  private async requestCompletionMerge(featureId: string, targetBranch: string): Promise<void> {
    if (!this.state.worktreePath) {
      console.error(`[FeatureManager:${this.state.featureManagerId}] No worktree path for completion merge`)
      this.emit('feature:merge_failed', { featureId, error: 'No worktree path' })
      return
    }

    const mergeManager = getMergeManager()

    try {
      const request = await mergeManager.submitRequest({
        type: 'bidirectional',
        sourceBranch: this.state.branchName, // manager branch is source (we're pushing TO target)
        targetBranch,
        featureId,
        featureManagerId: this.state.featureManagerId,
        workingDirectory: this.state.worktreePath,
        useAIConflictResolution: true,
        priority: 5 // Completion merges have medium priority
      })

      this.state.pendingMergeRequestId = request.id
      console.log(`[FeatureManager:${this.state.featureManagerId}] Submitted completion merge request ${request.id}`)

      // Emit legacy event for compatibility
      this.emit('merge:requested', { featureId, targetBranch })
    } catch (error) {
      console.error(`[FeatureManager:${this.state.featureManagerId}] Failed to submit completion merge:`, error)
      this.state.status = 'merging'
      this.emit('feature:merge_failed', { featureId, error: (error as Error).message })
    }
  }

  /**
   * Finish the current feature after merge completes
   *
   * Status flow: merging → archived (merge succeeded)
   */
  private async finishCurrentFeature(success: boolean): Promise<void> {
    if (!this.state.currentFeature) {
      return
    }

    const featureId = this.state.currentFeature.featureId

    if (success) {
      const targetBranch = this.state.currentFeature.targetBranch
      this.state.currentFeature.status = 'completed'  // Internal queue status
      console.log(`[FeatureManager:${this.state.featureManagerId}] Feature ${featureId} merge completed successfully`)

      // Update feature status: merging → archived
      const statusManager = getFeatureStatusManager()
      try {
        await statusManager.updateFeatureStatus(featureId, 'archived')
        console.log(`[FeatureManager:${this.state.featureManagerId}] Feature ${featureId} status: archived`)
      } catch (error) {
        console.error(`[FeatureManager:${this.state.featureManagerId}] Failed to update feature status:`, error)
      }

      this.emit('feature:merged', { featureId, targetBranch })
    }

    // Clear current feature
    this.state.currentFeature = null
    this.state.status = 'idle'

    // Start next feature if queue not empty
    if (this.state.queue.length > 0) {
      await this.startNextFeature()
    }
  }

  /**
   * Called after merge is complete (legacy compatibility).
   * @deprecated Use the MergeManager event-based flow instead
   */
  async onMergeComplete(success: boolean): Promise<void> {
    await this.finishCurrentFeature(success)
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clean up resources and listeners
   */
  cleanup(): void {
    this.removeAllListeners()
    this.state.pendingMergeRequestId = null
  }

  // ===========================================================================
  // Event Typing Helpers
  // ===========================================================================

  emit<K extends keyof FeatureManagerEvents>(
    event: K,
    data: FeatureManagerEvents[K]
  ): boolean {
    return super.emit(event, data)
  }

  on<K extends keyof FeatureManagerEvents>(
    event: K,
    listener: (data: FeatureManagerEvents[K]) => void
  ): this {
    return super.on(event, listener)
  }
}
