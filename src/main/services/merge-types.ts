/**
 * Merge Service Types
 *
 * Types for the centralized merge management system.
 * All merges in DAGent go through MergeManager which processes
 * requests sequentially using a single MergeAgent.
 */

import type { MergeResult, MergeConflict } from '../git/types'

/**
 * Direction of merge operation
 */
export type MergeDirection = 'source_to_target' | 'bidirectional'

/**
 * Type of merge operation - determines workflow
 */
export type MergeType =
  | 'preparation'   // target → manager (sync manager with latest before starting feature)
  | 'completion'    // manager → target (push feature work back to user's branch)
  | 'bidirectional' // target → manager, then manager → target (full sync)

/**
 * Status of a merge request
 */
export type MergeRequestStatus =
  | 'pending'       // Waiting in queue
  | 'in_progress'   // Currently being processed
  | 'syncing'       // Phase 1 of bidirectional: target → manager
  | 'integrating'   // Phase 2 of bidirectional: manager → target
  | 'resolving'     // Resolving conflicts
  | 'completed'     // Successfully completed
  | 'failed'        // Failed (may have conflicts)

/**
 * A merge request submitted to MergeManager
 */
export interface MergeRequest {
  /** Unique identifier for this request */
  id: string

  /** Type of merge determines workflow */
  type: MergeType

  /** Source branch to merge FROM */
  sourceBranch: string

  /** Target branch to merge INTO */
  targetBranch: string

  /** Feature ID this merge is for */
  featureId: string

  /** Feature manager ID (if applicable) */
  featureManagerId?: number

  /** Working directory for the merge (worktree path) */
  workingDirectory: string

  /** Current status */
  status: MergeRequestStatus

  /** When the request was created */
  createdAt: string

  /** When processing started */
  startedAt?: string

  /** When processing completed */
  completedAt?: string

  /** Error message if failed */
  error?: string

  /** Conflicts encountered (if any) */
  conflicts?: MergeConflict[]

  /** Whether to use AI to resolve conflicts */
  useAIConflictResolution?: boolean

  /** Priority (higher = processed first) */
  priority?: number
}

/**
 * Result of a merge operation
 */
export interface MergeOperationResult {
  /** Whether the merge succeeded */
  success: boolean

  /** The request that was processed */
  request: MergeRequest

  /** Result of the primary merge (or sync phase for bidirectional) */
  mergeResult?: MergeResult

  /** Result of integrate phase (for bidirectional only) */
  integrateResult?: MergeResult

  /** Number of conflicts resolved by AI */
  conflictsResolved?: number

  /** Error message if failed */
  error?: string
}

/**
 * Events emitted by MergeManager
 */
export interface MergeManagerEvents {
  /** A merge request was added to the queue */
  'merge:queued': { request: MergeRequest; queuePosition: number }

  /** A merge started processing */
  'merge:started': { request: MergeRequest }

  /** Merge is syncing (bidirectional phase 1) */
  'merge:syncing': { request: MergeRequest }

  /** Merge is integrating (bidirectional phase 2) */
  'merge:integrating': { request: MergeRequest }

  /** Conflicts detected, attempting resolution */
  'merge:conflicts': { request: MergeRequest; conflicts: MergeConflict[] }

  /** Conflicts resolved */
  'merge:conflicts-resolved': { request: MergeRequest; count: number }

  /** A merge completed (success or failure) */
  'merge:completed': MergeOperationResult

  /** Queue was updated */
  'queue:updated': { queueLength: number; currentRequest: MergeRequest | null }
}

/**
 * Status of the MergeManager
 */
export interface MergeManagerStatus {
  /** Whether the manager is initialized */
  initialized: boolean

  /** Current request being processed (if any) */
  currentRequest: MergeRequest | null

  /** Number of requests in queue */
  queueLength: number

  /** All pending requests */
  pendingRequests: MergeRequest[]

  /** Whether a merge is currently in progress */
  isBusy: boolean
}

/**
 * Options for creating a merge request
 */
export interface CreateMergeRequestOptions {
  type: MergeType
  sourceBranch: string
  targetBranch: string
  featureId: string
  featureManagerId?: number
  workingDirectory: string
  useAIConflictResolution?: boolean
  priority?: number
}
