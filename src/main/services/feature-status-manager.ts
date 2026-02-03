import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import * as path from 'path'
import type { FeatureStatus } from '@shared/types/feature'
import type { FeatureStore } from '../storage/feature-store'
import { getProjectRoot } from '../ipc/storage-handlers'

/**
 * Valid status transitions map for the dual-manager architecture.
 *
 * Feature lifecycle:
 * 1. backlog: Feature created, no worktree yet
 * 2. creating_worktree: Assigned to feature manager, worktree being created
 * 3. active: Has worktree, work in progress
 * 4. merging: All tasks archived, merging feature branch to main
 * 5. archived: Complete and merged, worktree can be reclaimed
 */
const VALID_TRANSITIONS: Record<FeatureStatus, FeatureStatus[]> = {
  backlog: ['creating_worktree', 'archived'],
  creating_worktree: ['active', 'backlog'], // active on success, backlog on failure
  active: ['backlog', 'merging', 'archived'],
  merging: ['active', 'archived'],
  archived: ['backlog', 'merging'] // merging: user wants to create a new PR
}

/**
 * Task statuses that indicate active work with potentially uncommitted changes.
 * Transitioning a feature to backlog is blocked if any task is in these states.
 */
const ACTIVE_TASK_STATUSES = ['in_progress', 'ready_for_qa', 'developing', 'verifying']

/**
 * FeatureStatusManager - Centralized feature status management service.
 *
 * Responsibilities:
 * - Validate status transitions against allowed workflow
 * - Update feature status in storage
 * - Emit events for UI reactivity
 * - Ensure all status changes are tracked and persisted
 *
 * Feature Workflow:
 * - backlog → creating_worktree (user starts feature, assigned to manager)
 * - creating_worktree → active (worktree created successfully)
 * - creating_worktree → backlog (worktree creation failed)
 * - active → merging (all tasks archived)
 * - merging → archived (merge complete)
 * - merging → active (merge failed)
 * - archived → backlog (un-archive to restart)
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

    const previousStatus = feature.status

    // Validate transition
    if (!this.validateTransition(feature.status, newStatus)) {
      throw new Error(
        `Invalid status transition for feature ${featureId}: ${feature.status} → ${newStatus}`
      )
    }

    // Block transition to backlog if any tasks have uncommitted work
    if (newStatus === 'backlog' && feature.status === 'active') {
      const dag = await this.featureStore.loadDag(featureId)
      if (dag) {
        const activeTasks = dag.nodes.filter(task => ACTIVE_TASK_STATUSES.includes(task.status))
        if (activeTasks.length > 0) {
          const taskNames = activeTasks.map(t => t.title).join(', ')
          throw new Error(
            `Cannot move feature to backlog: ${activeTasks.length} task(s) have uncommitted work (${taskNames}). ` +
            `Complete or cancel active tasks first.`
          )
        }
      }
    }

    // When transitioning from archived to merging, reconstruct the worktreePath from worktreeId
    if (newStatus === 'merging' && feature.status === 'archived') {
      if (!feature.worktreeId) {
        throw new Error(
          `Cannot move feature to merging: feature is not assigned to a worktree pool. ` +
          `Move to backlog first, then start the feature to assign it to a pool.`
        )
      }

      // Reconstruct the correct worktreePath from worktreeId
      const projectRoot = getProjectRoot()
      if (projectRoot) {
        const correctWorktreePath = path.join(projectRoot, '.dagent-worktrees', feature.worktreeId)
        if (feature.worktreePath !== correctWorktreePath) {
          console.log(`[FeatureStatusManager] Fixing worktreePath for ${featureId}: ${feature.worktreePath} -> ${correctWorktreePath}`)
          feature.worktreePath = correctWorktreePath
        }
      }
    }

    // Ensure branch is always set when worktreeId is present (fix for older features)
    if (feature.worktreeId && !feature.branch) {
      feature.branch = `dagent/${feature.worktreeId}`
      console.log(`[FeatureStatusManager] Set missing branch for ${featureId}: ${feature.branch}`)
    }

    // Update feature status and timestamp
    feature.status = newStatus
    feature.updatedAt = new Date().toISOString()

    console.log(`[FeatureStatusManager] Saving feature ${featureId} with status ${newStatus}, worktreePath: ${feature.worktreePath}, branch: ${feature.branch}`)

    // Persist to storage
    await this.featureStore.saveFeature(feature)

    console.log(`[FeatureStatusManager] Feature ${featureId} saved successfully`)

    // Emit event for internal listeners
    this.eventEmitter.emit('feature-status-changed', {
      featureId,
      status: newStatus,
      previousStatus,
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
   * Get allowed next statuses for a given status.
   * @param currentStatus - Current feature status
   * @returns Array of allowed next statuses
   */
  getAllowedTransitions(currentStatus: FeatureStatus): FeatureStatus[] {
    return VALID_TRANSITIONS[currentStatus] || []
  }

  /**
   * Check if all tasks in a feature are completed and update feature status accordingly.
   * @param featureId - Feature ID
   * @returns true if feature was transitioned to completed
   */
  async checkAndUpdateCompletionStatus(featureId: string): Promise<boolean> {
    const feature = await this.featureStore.loadFeature(featureId)
    if (!feature || feature.status !== 'active') {
      return false
    }

    // Load DAG to check task statuses
    const dag = await this.featureStore.loadDag(featureId)
    if (!dag || dag.nodes.length === 0) {
      return false
    }

    // Check if all tasks are archived
    const allArchived = dag.nodes.every(task => task.status === 'done')
    if (allArchived) {
      await this.updateFeatureStatus(featureId, 'merging')
      return true
    }

    return false
  }

  /**
   * Reactivate a merging/archived feature when a new task is added or a task is reopened.
   * @param featureId - Feature ID
   */
  async reactivateIfCompleted(featureId: string): Promise<void> {
    const feature = await this.featureStore.loadFeature(featureId)
    if (feature?.status === 'merging' || feature?.status === 'archived') {
      await this.updateFeatureStatus(featureId, 'active')
      console.log(`[FeatureStatusManager] Reactivated feature ${featureId}`)
    }
  }
}
