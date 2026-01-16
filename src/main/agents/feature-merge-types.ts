/**
 * Types for FeatureMergeAgent - handles merging completed features into main branch.
 * Different from MergeAgent which handles task-to-feature merges.
 */

import type { MergeConflict } from '../git/types'
import type { IntentionDecision } from './harness-types'
import type { ConflictAnalysis } from './merge-types'

export type FeatureMergeAgentStatus =
  | 'initializing'
  | 'checking_branches'
  | 'proposing_intention'
  | 'awaiting_approval'
  | 'merging'
  | 'resolving_conflicts'
  | 'completed'
  | 'failed'

export interface FeatureMergeAgentState {
  status: FeatureMergeAgentStatus
  agentId: string | null
  featureId: string
  featureBranch: string | null // e.g., feature/car/main
  targetBranch: string | null // e.g., main
  conflicts: MergeConflict[]
  conflictAnalysis: ConflictAnalysis | null
  intention: string | null
  approval: IntentionDecision | null
  mergeResult: FeatureMergeResult | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface FeatureMergeResult {
  success: boolean
  merged: boolean
  conflicts?: MergeConflict[]
  commitHash?: string
  branchDeleted: boolean
  error?: string
}

export const DEFAULT_FEATURE_MERGE_AGENT_STATE: Omit<FeatureMergeAgentState, 'featureId'> = {
  status: 'initializing',
  agentId: null,
  featureBranch: null,
  targetBranch: null,
  conflicts: [],
  conflictAnalysis: null,
  intention: null,
  approval: null,
  mergeResult: null,
  error: null,
  startedAt: null,
  completedAt: null
}
