// src/main/agent/request-manager.ts
// Centralized request manager with priority queue for Claude SDK requests

import { randomUUID } from 'crypto'
import type { AgentStreamEvent } from './types'
import type {
  QueuedRequest,
  RequestManagerConfig,
  RequestManagerStatus
} from './request-types'
import { RequestPriority } from './request-types'

/**
 * RequestManager controls concurrent Claude SDK requests with priority-based queueing.
 *
 * Key insight: Agents don't consume resources - API requests do. We can have many
 * agents but limit concurrent requests to avoid overwhelming the API.
 *
 * Priority order (highest to lowest):
 * - PM Agent (P0): Human is waiting
 * - Harness responding to Merge (P1): Unblock fastest
 * - Merge Agent (P2): Unblock dependents
 * - QA Agent (P3): Validate before merge
 * - Harness responding to Dev (P4)
 * - Dev Agent (P5): New work
 */
export class RequestManager {
  private queue: QueuedRequest[] = []
  private activeCount = 0
  private maxConcurrent: number

  constructor(config?: Partial<RequestManagerConfig>) {
    this.maxConcurrent = config?.maxConcurrent ?? 3
  }

  /**
   * Enqueue a request to be executed when a slot is available.
   *
   * If under maxConcurrent, executes immediately.
   * If at capacity, queues the request and resolves when slot available.
   *
   * @param priority Request priority level
   * @param agentId Agent identifier (e.g., 'pm', 'dev-task1')
   * @param execute Factory function that creates the SDK query
   * @param taskId Optional task ID for task-specific agents
   * @returns Promise that resolves to the async iterable of events
   */
  async enqueue(
    priority: RequestPriority,
    agentId: string,
    execute: () => AsyncIterable<AgentStreamEvent>,
    taskId?: string
  ): Promise<AsyncIterable<AgentStreamEvent>> {
    // If we have capacity, execute immediately
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++
      return this.wrapExecution(execute())
    }

    // Queue the request and wait for slot
    return new Promise<AsyncIterable<AgentStreamEvent>>((resolve, reject) => {
      const request: QueuedRequest = {
        id: randomUUID(),
        priority,
        agentId,
        taskId,
        execute,
        resolve,
        reject,
        enqueuedAt: Date.now()
      }

      // Insert into queue sorted by priority ASC, then enqueuedAt ASC (FIFO within priority)
      this.insertSorted(request)
    })
  }

  /**
   * Insert request into queue maintaining sort order
   */
  private insertSorted(request: QueuedRequest): void {
    // Find insertion point
    let insertIndex = this.queue.length
    for (let i = 0; i < this.queue.length; i++) {
      const existing = this.queue[i]
      // Sort by priority (lower = higher), then by enqueuedAt (earlier = first)
      if (
        request.priority < existing.priority ||
        (request.priority === existing.priority && request.enqueuedAt < existing.enqueuedAt)
      ) {
        insertIndex = i
        break
      }
    }
    this.queue.splice(insertIndex, 0, request)
  }

  /**
   * Process the queue when a slot becomes available
   */
  private processQueue(): void {
    // If at capacity or queue empty, nothing to do
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return
    }

    // Get highest priority request (first in queue due to sorting)
    const request = this.queue.shift()!
    this.activeCount++

    // Execute and wrap the result
    const wrapped = this.wrapExecution(request.execute())
    request.resolve(wrapped)

    // Try to fill more slots
    this.processQueue()
  }

  /**
   * Wrap an async iterable to track when it completes
   */
  private wrapExecution(
    iterable: AsyncIterable<AgentStreamEvent>
  ): AsyncIterable<AgentStreamEvent> {
    const self = this

    return {
      [Symbol.asyncIterator](): AsyncIterator<AgentStreamEvent> {
        const iterator = iterable[Symbol.asyncIterator]()

        return {
          async next(): Promise<IteratorResult<AgentStreamEvent>> {
            try {
              const result = await iterator.next()
              if (result.done) {
                self.onRequestComplete()
              }
              return result
            } catch (error) {
              self.onRequestComplete()
              throw error
            }
          },
          async return(value?: AgentStreamEvent): Promise<IteratorResult<AgentStreamEvent>> {
            self.onRequestComplete()
            if (iterator.return) {
              return iterator.return(value)
            }
            return { done: true, value: value as AgentStreamEvent }
          },
          async throw(error?: Error): Promise<IteratorResult<AgentStreamEvent>> {
            self.onRequestComplete()
            if (iterator.throw) {
              return iterator.throw(error)
            }
            throw error
          }
        }
      }
    }
  }

  /**
   * Called when a request completes (success, error, or abort)
   */
  private onRequestComplete(): void {
    this.activeCount = Math.max(0, this.activeCount - 1)
    this.processQueue()
  }

  /**
   * Get current status of the request manager
   */
  getStatus(): RequestManagerStatus {
    return {
      activeCount: this.activeCount,
      queueLength: this.queue.length,
      maxConcurrent: this.maxConcurrent
    }
  }

  /**
   * Update max concurrent requests
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max
    // Try to start queued requests if we increased capacity
    this.processQueue()
  }
}

// Singleton instance
let requestManager: RequestManager | null = null

/**
 * Get the singleton RequestManager instance
 */
export function getRequestManager(): RequestManager {
  if (!requestManager) {
    requestManager = new RequestManager()
  }
  return requestManager
}

// Re-export RequestPriority for convenience
export { RequestPriority }
