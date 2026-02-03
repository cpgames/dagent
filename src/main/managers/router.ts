import { EventEmitter } from 'events'
import type { IManageable, IManager } from './types'
import {
  type TaskStatus,
  type FeatureStatus,
  getNextTaskStatus,
  getNextFeatureStatus,
  isTaskTerminal,
  isFeatureTerminal
} from './transitions'

/**
 * Events emitted by the Router.
 */
export interface RouterEvents {
  /** Task transitioned to a new status */
  taskTransition: (taskId: string, from: TaskStatus, to: TaskStatus) => void
  /** Feature transitioned to a new status */
  featureTransition: (featureId: string, from: FeatureStatus, to: FeatureStatus) => void
  /** Task completed (reached terminal state) */
  taskCompleted: (taskId: string) => void
  /** Feature completed (reached terminal state) */
  featureCompleted: (featureId: string) => void
  /** Dependency completed - may unblock other tasks */
  dependencyCompleted: (taskId: string) => void
  /** Router started */
  started: () => void
  /** Router stopped */
  stopped: () => void
}

/**
 * Task-like interface for routing purposes.
 * Actual Task type will implement IManageable.
 */
interface TaskLike extends IManageable {
  status: TaskStatus
  dependencies?: string[]
}

/**
 * Feature-like interface for routing purposes.
 * Actual Feature type will implement IManageable.
 */
interface FeatureLike extends IManageable {
  status: FeatureStatus
}

/**
 * Central Router that coordinates transitions between managers.
 *
 * Responsibilities:
 * - Register and manage all feature/task managers
 * - Listen for itemFinished events from managers
 * - Route items to next manager based on transition rules
 * - Track dependencies and unblock tasks when deps complete
 */
export class Router extends EventEmitter {
  private featureManagers: Map<FeatureStatus, IManager<FeatureLike>> = new Map()
  private taskManagers: Map<TaskStatus, IManager<TaskLike>> = new Map()
  private _isRunning = false

  /**
   * Register a feature manager.
   */
  registerFeatureManager(status: FeatureStatus, manager: IManager<FeatureLike>): void {
    this.featureManagers.set(status, manager)

    // Listen for finished items
    manager.on('itemFinished', (item, success) => {
      this.handleFeatureTransition(item, success)
    })
  }

  /**
   * Register a task manager.
   */
  registerTaskManager(status: TaskStatus, manager: IManager<TaskLike>): void {
    this.taskManagers.set(status, manager)

    // Listen for finished items
    manager.on('itemFinished', (item, success) => {
      this.handleTaskTransition(item, success)
    })
  }

  /**
   * Get a feature manager by status.
   */
  getFeatureManager(status: FeatureStatus): IManager<FeatureLike> | undefined {
    return this.featureManagers.get(status)
  }

  /**
   * Get a task manager by status.
   */
  getTaskManager(status: TaskStatus): IManager<TaskLike> | undefined {
    return this.taskManagers.get(status)
  }

  /**
   * Find a task across all managers.
   */
  findTask(taskId: string): TaskLike | null {
    for (const manager of this.taskManagers.values()) {
      const task = manager.find(taskId)
      if (task) return task
    }
    return null
  }

  /**
   * Find a feature across all managers.
   */
  findFeature(featureId: string): FeatureLike | null {
    for (const manager of this.featureManagers.values()) {
      const feature = manager.find(featureId)
      if (feature) return feature
    }
    return null
  }

  /**
   * Route a new task to its manager based on status.
   */
  routeTask(task: TaskLike): void {
    const manager = this.taskManagers.get(task.status)
    if (manager) {
      manager.add(task)
    } else {
      console.warn(`[Router] No manager registered for task status: ${task.status}`)
    }
  }

  /**
   * Route a new feature to its manager based on status.
   */
  routeFeature(feature: FeatureLike): void {
    const manager = this.featureManagers.get(feature.status)
    if (manager) {
      manager.add(feature)
    } else {
      console.warn(`[Router] No manager registered for feature status: ${feature.status}`)
    }
  }

  /**
   * Handle task transition after processing completes.
   */
  private handleTaskTransition(task: TaskLike, success: boolean): void {
    const fromStatus = task.status
    const nextStatus = getNextTaskStatus(fromStatus, success, task.transitions)

    if (nextStatus) {
      // Update task status
      task.status = nextStatus

      // Route to next manager
      const nextManager = this.taskManagers.get(nextStatus)
      if (nextManager) {
        nextManager.add(task)
      }

      // Emit transition event
      this.emit('taskTransition', task.id, fromStatus, nextStatus)

      // Check if terminal
      if (isTaskTerminal(nextStatus)) {
        this.emit('taskCompleted', task.id)
        this.emit('dependencyCompleted', task.id)
        this.unblockDependentTasks(task.id)
      }
    }
    // If no nextStatus, task stays in completed/failed list
  }

  /**
   * Handle feature transition after processing completes.
   */
  private handleFeatureTransition(feature: FeatureLike, success: boolean): void {
    const fromStatus = feature.status
    const nextStatus = getNextFeatureStatus(fromStatus, success, feature.transitions)

    if (nextStatus) {
      // Update feature status
      feature.status = nextStatus

      // Route to next manager
      const nextManager = this.featureManagers.get(nextStatus)
      if (nextManager) {
        nextManager.add(feature)
      }

      // Emit transition event
      this.emit('featureTransition', feature.id, fromStatus, nextStatus)

      // Check if terminal
      if (isFeatureTerminal(nextStatus)) {
        this.emit('featureCompleted', feature.id)
      }
    }
  }

  /**
   * Unblock tasks that were waiting on a completed dependency.
   */
  private unblockDependentTasks(completedTaskId: string): void {
    for (const manager of this.taskManagers.values()) {
      // Check queue for dependent tasks
      for (const task of manager.queue) {
        if (task.blocked && task.dependencies?.includes(completedTaskId)) {
          // Check if ALL dependencies are now satisfied
          const allMet = task.dependencies.every((depId) => this.isTaskDone(depId))
          if (allMet) {
            task.blocked = false
          }
        }
      }
    }
  }

  /**
   * Check if a task is done (completed).
   */
  private isTaskDone(taskId: string): boolean {
    const doneManager = this.taskManagers.get('done')
    if (!doneManager) return false
    return doneManager.find(taskId) !== null
  }

  /**
   * Manually transition a task to a different status.
   * Used for user-initiated actions like pause/resume.
   */
  manualTaskTransition(taskId: string, toStatus: TaskStatus): boolean {
    const task = this.findTask(taskId)
    if (!task) return false

    const fromStatus = task.status

    // Remove from current manager
    const currentManager = this.taskManagers.get(fromStatus)
    if (currentManager) {
      currentManager.remove(taskId)
    }

    // Update status and route to new manager
    task.status = toStatus
    const nextManager = this.taskManagers.get(toStatus)
    if (nextManager) {
      nextManager.add(task)
    }

    this.emit('taskTransition', taskId, fromStatus, toStatus)
    return true
  }

  /**
   * Manually transition a feature to a different status.
   */
  manualFeatureTransition(featureId: string, toStatus: FeatureStatus): boolean {
    const feature = this.findFeature(featureId)
    if (!feature) return false

    const fromStatus = feature.status

    // Remove from current manager
    const currentManager = this.featureManagers.get(fromStatus)
    if (currentManager) {
      currentManager.remove(featureId)
    }

    // Update status and route to new manager
    feature.status = toStatus
    const nextManager = this.featureManagers.get(toStatus)
    if (nextManager) {
      nextManager.add(feature)
    }

    this.emit('featureTransition', featureId, fromStatus, toStatus)
    return true
  }

  /**
   * Start all managers.
   */
  start(): void {
    if (this._isRunning) return

    this._isRunning = true

    for (const manager of this.featureManagers.values()) {
      manager.start()
    }
    for (const manager of this.taskManagers.values()) {
      manager.start()
    }

    this.emit('started')
  }

  /**
   * Stop all managers.
   */
  stop(): void {
    if (!this._isRunning) return

    this._isRunning = false

    for (const manager of this.featureManagers.values()) {
      manager.stop()
    }
    for (const manager of this.taskManagers.values()) {
      manager.stop()
    }

    this.emit('stopped')
  }

  /**
   * Check if router is running.
   */
  isRunning(): boolean {
    return this._isRunning
  }

  /**
   * Get all tasks across all managers.
   */
  getAllTasks(): TaskLike[] {
    const tasks: TaskLike[] = []
    for (const manager of this.taskManagers.values()) {
      tasks.push(...manager.queue)
      tasks.push(...manager.completed)
      tasks.push(...manager.failed)
      tasks.push(...manager.waiting)
    }
    return tasks
  }

  /**
   * Get all features across all managers.
   */
  getAllFeatures(): FeatureLike[] {
    const features: FeatureLike[] = []
    for (const manager of this.featureManagers.values()) {
      features.push(...manager.queue)
      features.push(...manager.completed)
      features.push(...manager.failed)
      features.push(...manager.waiting)
    }
    return features
  }

  // Typed event emitter methods
  on<K extends keyof RouterEvents>(event: K, listener: RouterEvents[K]): this {
    return super.on(event, listener)
  }

  emit<K extends keyof RouterEvents>(event: K, ...args: Parameters<RouterEvents[K]>): boolean {
    return super.emit(event, ...args)
  }
}

// Singleton instance
let routerInstance: Router | null = null

/**
 * Get the singleton Router instance.
 */
export function getRouter(): Router {
  if (!routerInstance) {
    routerInstance = new Router()
  }
  return routerInstance
}

/**
 * Reset the Router singleton (for testing).
 */
export function resetRouter(): void {
  if (routerInstance) {
    routerInstance.stop()
    routerInstance = null
  }
}
