import type { IManageable, IManager, ProcessResult, ManagerConfig } from './types'
import { TypedEventEmitter } from './types'

/**
 * Abstract base class for all managers.
 * Provides tick-based processing loop and item list management.
 *
 * Subclasses must implement:
 * - process(item): The actual work to do for each item
 *
 * Optional overrides:
 * - canProcess(item): Additional checks before processing (default: !item.blocked)
 */
export abstract class BaseManager<T extends IManageable>
  extends TypedEventEmitter<T>
  implements IManager<T>
{
  abstract readonly status: string

  protected _queue: T[] = []
  protected _completed: T[] = []
  protected _failed: T[] = []
  protected _waiting: T[] = []

  private tickInterval: ReturnType<typeof setInterval> | null = null
  private _isRunning = false
  private _isProcessing = false
  private _currentItemId: string | null = null
  private abortController: AbortController | null = null

  protected readonly config: Required<ManagerConfig>

  constructor(config: ManagerConfig = {}) {
    super()
    this.config = {
      tickInterval: config.tickInterval ?? 1000,
      autoStart: config.autoStart ?? false
    }

    if (this.config.autoStart) {
      this.start()
    }
  }

  // Readonly access to lists
  get queue(): T[] {
    return [...this._queue]
  }

  get completed(): T[] {
    return [...this._completed]
  }

  get failed(): T[] {
    return [...this._failed]
  }

  get waiting(): T[] {
    return [...this._waiting]
  }

  /**
   * Add an item to the manager's queue.
   */
  add(item: T): void {
    // Ensure item has correct status for this manager
    if (item.status !== this.status) {
      item.status = this.status
    }
    this._queue.push(item)
    this.emit('itemAdded', item)
  }

  /**
   * Remove an item from any list in the manager.
   */
  remove(itemId: string): T | null {
    // Check all lists
    for (const list of [this._queue, this._completed, this._failed, this._waiting]) {
      const index = list.findIndex((i) => i.id === itemId)
      if (index !== -1) {
        const [item] = list.splice(index, 1)
        this.emit('itemRemoved', item)
        return item
      }
    }
    return null
  }

  /**
   * Find an item by ID across all lists.
   */
  find(itemId: string): T | null {
    for (const list of [this._queue, this._completed, this._failed, this._waiting]) {
      const item = list.find((i) => i.id === itemId)
      if (item) return item
    }
    return null
  }

  /**
   * Start the manager's tick loop.
   */
  start(): void {
    if (this._isRunning) return

    this._isRunning = true
    this.tickInterval = setInterval(() => {
      this.tick().catch((err) => {
        console.error(`[${this.constructor.name}] Tick error:`, err)
      })
    }, this.config.tickInterval)
  }

  /**
   * Stop the manager's tick loop.
   */
  stop(): void {
    if (!this._isRunning) return

    this._isRunning = false
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
  }

  /**
   * Check if manager is currently running.
   */
  isRunning(): boolean {
    return this._isRunning
  }

  /**
   * Process one tick.
   * Finds first processable item in queue and processes it.
   */
  async tick(): Promise<void> {
    // Skip if already processing
    if (this._isProcessing) return

    // Find first processable item
    const item = this._queue.find((i) => this.canProcess(i))
    if (!item) return

    this._isProcessing = true
    this._currentItemId = item.id
    this.abortController = new AbortController()

    try {
      const result = await this.process(item, this.abortController.signal)

      // If aborted, don't move item
      if (this.abortController.signal.aborted) {
        return
      }

      // Remove from queue
      const queueIndex = this._queue.findIndex((i) => i.id === item.id)
      if (queueIndex !== -1) {
        this._queue.splice(queueIndex, 1)
      }

      // Move to appropriate list
      if (result.success) {
        this._completed.push(item)
      } else {
        item.errorMessage = result.error
        this._failed.push(item)
      }

      // Notify listeners (Router will handle transition)
      this.emit('itemFinished', item, result.success)
    } catch (error) {
      // Unexpected error - move to failed
      const queueIndex = this._queue.findIndex((i) => i.id === item.id)
      if (queueIndex !== -1) {
        this._queue.splice(queueIndex, 1)
      }
      item.errorMessage = error instanceof Error ? error.message : String(error)
      this._failed.push(item)
      this.emit('itemFinished', item, false)
    } finally {
      this._isProcessing = false
      this._currentItemId = null
      this.abortController = null
    }
  }

  /**
   * Abort processing for a specific item.
   * Used when user pauses a task mid-execution.
   */
  async abortProcessing(itemId: string): Promise<void> {
    if (this._currentItemId === itemId && this.abortController) {
      this.abortController.abort()
    }
  }

  /**
   * Move an item to the waiting list.
   * Used when processing requires user input.
   */
  protected moveToWaiting(item: T): void {
    // Remove from queue
    const queueIndex = this._queue.findIndex((i) => i.id === item.id)
    if (queueIndex !== -1) {
      this._queue.splice(queueIndex, 1)
    }

    // Add to waiting
    this._waiting.push(item)
    this.emit('itemWaiting', item)
  }

  /**
   * Move an item from waiting back to queue.
   * Called when user provides input.
   */
  moveFromWaitingToQueue(itemId: string): T | null {
    const index = this._waiting.findIndex((i) => i.id === itemId)
    if (index === -1) return null

    const [item] = this._waiting.splice(index, 1)
    this._queue.unshift(item) // Add to front of queue for priority
    return item
  }

  /**
   * Check if an item can be processed.
   * Override in subclass for additional checks.
   */
  protected canProcess(item: T): boolean {
    return !item.blocked
  }

  /**
   * Process a single item. Must be implemented by subclass.
   * @param item The item to process
   * @param signal AbortSignal for cancellation
   * @returns ProcessResult indicating success/failure
   */
  protected abstract process(item: T, signal: AbortSignal): Promise<ProcessResult>
}

/**
 * Simple holder manager that doesn't process items.
 * Used for paused tasks or archived items that just need storage.
 */
export abstract class HolderManager<T extends IManageable>
  extends TypedEventEmitter<T>
  implements IManager<T>
{
  abstract readonly status: string

  protected _queue: T[] = []
  protected _completed: T[] = []
  protected _failed: T[] = []
  protected _waiting: T[] = []

  get queue(): T[] {
    return [...this._queue]
  }

  get completed(): T[] {
    return [...this._completed]
  }

  get failed(): T[] {
    return [...this._failed]
  }

  get waiting(): T[] {
    return [...this._waiting]
  }

  add(item: T): void {
    if (item.status !== this.status) {
      item.status = this.status
    }
    this._queue.push(item)
    this.emit('itemAdded', item)
  }

  remove(itemId: string): T | null {
    for (const list of [this._queue, this._completed, this._failed, this._waiting]) {
      const index = list.findIndex((i) => i.id === itemId)
      if (index !== -1) {
        const [item] = list.splice(index, 1)
        this.emit('itemRemoved', item)
        return item
      }
    }
    return null
  }

  find(itemId: string): T | null {
    for (const list of [this._queue, this._completed, this._failed, this._waiting]) {
      const item = list.find((i) => i.id === itemId)
      if (item) return item
    }
    return null
  }

  // No-op for holder managers
  async tick(): Promise<void> {}
  start(): void {}
  stop(): void {}
  isRunning(): boolean {
    return false
  }
  async abortProcessing(): Promise<void> {}
}
