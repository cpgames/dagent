/**
 * TaskPlanStore for persisting Ralph Loop iteration state.
 * Follows singleton pattern from FeatureStore.
 * Each task has a plan.json in its node directory.
 */

import { readJson, writeJson, deleteJson, exists } from '../storage/json-store'
import { getTaskPlanPathInWorktree } from '../storage/paths'
import type { TaskPlan, TaskPlanConfig, ChecklistItem, ActivityEntry } from './task-plan-types'
import { DEFAULT_CHECKLIST_ITEMS, DEFAULT_TASK_PLAN_CONFIG } from './task-plan-types'
import { getFeatureStore } from '../ipc/storage-handlers'

// Singleton store per projectRoot
const stores = new Map<string, TaskPlanStore>()

/**
 * Get or create a TaskPlanStore singleton for a project.
 */
export function getTaskPlanStore(projectRoot: string): TaskPlanStore {
  let store = stores.get(projectRoot)
  if (!store) {
    store = new TaskPlanStore(projectRoot)
    stores.set(projectRoot, store)
  }
  return store
}

/**
 * TaskPlanStore manages CRUD operations for task plans.
 */
export class TaskPlanStore {
  // projectRoot passed to constructor is used as the cache key in the stores Map
  constructor(_projectRoot: string) {
    // Constructor parameter used only for Map key lookup in getTaskPlanStore()
    void _projectRoot
  }

  /**
   * Get the file path for a task's plan.json.
   * Requires feature to have a worktreePath set.
   */
  private async getPath(featureId: string, taskId: string): Promise<string | null> {
    const featureStore = getFeatureStore()
    if (!featureStore) {
      console.error('[TaskPlanStore] FeatureStore not initialized')
      return null
    }
    const feature = await featureStore.loadFeature(featureId)
    if (!feature?.worktreePath) {
      console.error(`[TaskPlanStore] Feature ${featureId} does not have a worktree path`)
      return null
    }
    return getTaskPlanPathInWorktree(feature.worktreePath, featureId, taskId)
  }

  /**
   * Create a new TaskPlan with default checklist and config.
   * Saves the plan immediately.
   */
  async createPlan(
    featureId: string,
    taskId: string,
    config?: Partial<TaskPlanConfig>
  ): Promise<TaskPlan> {
    const now = new Date().toISOString()

    // Deep copy default checklist items to avoid mutation
    const checklist: ChecklistItem[] = DEFAULT_CHECKLIST_ITEMS.map((item) => ({ ...item }))

    // Merge provided config with defaults
    const mergedConfig: TaskPlanConfig = {
      ...DEFAULT_TASK_PLAN_CONFIG,
      ...config
    }

    const plan: TaskPlan = {
      taskId,
      featureId,
      iteration: 1,
      maxIterations: 10,
      status: 'pending',
      checklist,
      activity: [],
      createdAt: now,
      updatedAt: now,
      config: mergedConfig
    }

    await this.savePlan(featureId, taskId, plan)
    return plan
  }

  /**
   * Load an existing TaskPlan.
   * @returns TaskPlan or null if not found.
   */
  async loadPlan(featureId: string, taskId: string): Promise<TaskPlan | null> {
    const filePath = await this.getPath(featureId, taskId)
    if (!filePath) return null
    return readJson<TaskPlan>(filePath)
  }

  /**
   * Save a TaskPlan (full replace).
   * Updates the `updatedAt` timestamp.
   */
  async savePlan(featureId: string, taskId: string, plan: TaskPlan): Promise<void> {
    plan.updatedAt = new Date().toISOString()
    const filePath = await this.getPath(featureId, taskId)
    if (!filePath) {
      throw new Error(`Cannot save plan: feature ${featureId} does not have a worktree path`)
    }
    await writeJson(filePath, plan)
  }

  /**
   * Delete a TaskPlan.
   * @returns true if deleted, false if didn't exist.
   */
  async deletePlan(featureId: string, taskId: string): Promise<boolean> {
    const filePath = await this.getPath(featureId, taskId)
    if (!filePath) return false
    return deleteJson(filePath)
  }

  /**
   * Check if a TaskPlan exists.
   */
  async planExists(featureId: string, taskId: string): Promise<boolean> {
    const filePath = await this.getPath(featureId, taskId)
    if (!filePath) return false
    return exists(filePath)
  }

  /**
   * Update a single checklist item by ID.
   * Sets `verifiedAt` if status is changing.
   * @throws Error if plan not found.
   */
  async updateChecklistItem(
    featureId: string,
    taskId: string,
    itemId: string,
    update: Partial<ChecklistItem>
  ): Promise<void> {
    const plan = await this.loadPlan(featureId, taskId)
    if (!plan) {
      throw new Error(`TaskPlan not found for task ${taskId}`)
    }

    const item = plan.checklist.find((i) => i.id === itemId)
    if (!item) {
      throw new Error(`Checklist item ${itemId} not found in task ${taskId}`)
    }

    // If status is changing, set verifiedAt
    if (update.status && update.status !== item.status) {
      item.verifiedAt = new Date().toISOString()
    }

    // Merge update into item
    Object.assign(item, update)

    await this.savePlan(featureId, taskId, plan)
  }

  /**
   * Add an activity entry to the plan.
   * @throws Error if plan not found.
   */
  async addActivity(
    featureId: string,
    taskId: string,
    entry: Omit<ActivityEntry, 'timestamp'>
  ): Promise<void> {
    const plan = await this.loadPlan(featureId, taskId)
    if (!plan) {
      throw new Error(`TaskPlan not found for task ${taskId}`)
    }

    const fullEntry: ActivityEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    }

    plan.activity.push(fullEntry)
    await this.savePlan(featureId, taskId, plan)
  }

  /**
   * Increment the iteration counter and return the new value.
   * @throws Error if plan not found.
   */
  async incrementIteration(featureId: string, taskId: string): Promise<number> {
    const plan = await this.loadPlan(featureId, taskId)
    if (!plan) {
      throw new Error(`TaskPlan not found for task ${taskId}`)
    }

    plan.iteration += 1
    await this.savePlan(featureId, taskId, plan)
    return plan.iteration
  }
}
