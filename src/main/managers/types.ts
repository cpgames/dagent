import { EventEmitter } from 'events'
import type { TransitionRules } from '@shared/types/task'

// Re-export TransitionRules from shared types for convenience
export type { TransitionRules } from '@shared/types/task'

/**
 * Base interface for items that can be managed (Features and Tasks).
 * Both types share common manageable properties.
 */
export interface IManageable {
  id: string
  status: string
  /** True if waiting on dependencies - manager skips during tick */
  blocked: boolean
  /** Optional item-level transition overrides (defaults come from TASK_TRANSITIONS/FEATURE_TRANSITIONS) */
  transitions?: TransitionRules
  /** Error message if item failed */
  errorMessage?: string
}

/**
 * Processing result returned by manager's process() method.
 */
export interface ProcessResult {
  success: boolean
  error?: string
}

/**
 * Events emitted by managers.
 */
export interface ManagerEvents<T extends IManageable> {
  /** Emitted when an item finishes processing (success or fail) */
  itemFinished: (item: T, success: boolean) => void
  /** Emitted when an item is added to the manager */
  itemAdded: (item: T) => void
  /** Emitted when an item is removed from the manager */
  itemRemoved: (item: T) => void
  /** Emitted when an item moves to waiting (e.g., awaiting user input) */
  itemWaiting: (item: T) => void
}

/**
 * Base interface for all managers.
 * Managers process items through a tick-based loop.
 */
export interface IManager<T extends IManageable> extends EventEmitter {
  /** The status this manager handles */
  readonly status: string

  /** Items waiting to be processed */
  readonly queue: T[]
  /** Items finished successfully (may auto-transition via Router) */
  readonly completed: T[]
  /** Items that failed (may auto-transition or need manual retry) */
  readonly failed: T[]
  /** Items awaiting user input (e.g., question asked by agent) */
  readonly waiting: T[]

  /**
   * Add an item to the manager's queue.
   */
  add(item: T): void

  /**
   * Remove an item from any list in the manager.
   * @returns The removed item, or null if not found
   */
  remove(itemId: string): T | null

  /**
   * Find an item by ID across all lists.
   */
  find(itemId: string): T | null

  /**
   * Process one tick - find first non-blocked item and process it.
   * Called by interval timer when manager is running.
   */
  tick(): Promise<void>

  /**
   * Start the manager's tick loop.
   */
  start(): void

  /**
   * Stop the manager's tick loop.
   */
  stop(): void

  /**
   * Check if manager is currently running.
   */
  isRunning(): boolean

  /**
   * Abort processing for a specific item (if it's currently being processed).
   * Used when user pauses a task mid-execution.
   */
  abortProcessing(itemId: string): Promise<void>

  // Event emitter typing
  on<K extends keyof ManagerEvents<T>>(event: K, listener: ManagerEvents<T>[K]): this
  emit<K extends keyof ManagerEvents<T>>(event: K, ...args: Parameters<ManagerEvents<T>[K]>): boolean
}

/**
 * Configuration options for creating a manager.
 */
export interface ManagerConfig {
  /** Tick interval in milliseconds (default: 1000) */
  tickInterval?: number
  /** Whether to auto-start on creation (default: false) */
  autoStart?: boolean
}

/**
 * Typed event emitter for managers.
 */
export class TypedEventEmitter<T extends IManageable> extends EventEmitter {
  on<K extends keyof ManagerEvents<T>>(event: K, listener: ManagerEvents<T>[K]): this {
    return super.on(event as string, listener)
  }

  emit<K extends keyof ManagerEvents<T>>(event: K, ...args: Parameters<ManagerEvents<T>[K]>): boolean {
    return super.emit(event as string, ...args)
  }

  off<K extends keyof ManagerEvents<T>>(event: K, listener: ManagerEvents<T>[K]): this {
    return super.off(event as string, listener)
  }
}
