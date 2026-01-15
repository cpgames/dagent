// src/main/agent/request-types.ts
// Types for the centralized request queue system

import type { AgentStreamEvent } from './types'

/**
 * Priority levels for SDK requests (lower = higher priority)
 *
 * Priority order rationale:
 * - PM: Human is waiting, highest priority
 * - HARNESS_MERGE: Unblock merge agent fastest
 * - MERGE: Unblock dependent tasks
 * - QA: Validate before merge
 * - HARNESS_DEV: Respond to dev agents
 * - DEV: New work, lowest priority
 */
export enum RequestPriority {
  PM = 0,           // Human is waiting
  HARNESS_MERGE = 1, // Unblock fastest
  MERGE = 2,         // Unblock dependents
  QA = 3,            // Validate before merge
  HARNESS_DEV = 4,   // Respond to dev
  DEV = 5            // New work (lowest)
}

/**
 * A queued request waiting for execution
 */
export interface QueuedRequest {
  /** Unique request ID */
  id: string
  /** Priority level (lower = higher priority) */
  priority: RequestPriority
  /** Agent identifier (e.g., 'pm', 'dev-task1', 'qa-task2', 'merge-task3') */
  agentId: string
  /** Optional task ID for task-specific agents */
  taskId?: string
  /** Factory function that creates the SDK query async iterable */
  execute: () => AsyncIterable<AgentStreamEvent>
  /** Promise resolution callback */
  resolve: (value: AsyncIterable<AgentStreamEvent>) => void
  /** Promise rejection callback */
  reject: (error: Error) => void
  /** Timestamp when request was enqueued (for FIFO within priority) */
  enqueuedAt: number
}

/**
 * Configuration for RequestManager
 */
export interface RequestManagerConfig {
  /** Maximum number of concurrent SDK requests (default: 3) */
  maxConcurrent: number
}

/**
 * Status information from RequestManager
 */
export interface RequestManagerStatus {
  /** Number of currently active requests */
  activeCount: number
  /** Number of requests waiting in queue */
  queueLength: number
  /** Maximum concurrent requests allowed */
  maxConcurrent: number
}
