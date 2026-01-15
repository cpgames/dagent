import type { MergeConflict, TaskMergeResult } from '../git/types'
import type { IntentionDecision } from './harness-types'

export type MergeAgentStatus =
  | 'initializing'
  | 'checking_branches'
  | 'proposing_intention'
  | 'awaiting_approval'
  | 'merging'
  | 'resolving_conflicts'
  | 'cleaning_up'
  | 'completed'
  | 'failed'

export interface MergeAgentState {
  status: MergeAgentStatus
  agentId: string | null
  featureId: string
  taskId: string
  taskWorktreePath: string | null
  featureBranch: string | null
  taskBranch: string | null
  conflicts: MergeConflict[]
  conflictAnalysis: ConflictAnalysis | null
  intention: string | null
  approval: IntentionDecision | null
  mergeResult: TaskMergeResult | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface MergeContext {
  featureId: string
  taskId: string
  taskTitle: string
  featureBranch: string
  taskBranch: string
  hasConflicts: boolean
  conflicts: MergeConflict[]
}

export interface ConflictResolution {
  file: string
  resolution: 'ours' | 'theirs' | 'both' | 'manual'
  content?: string // For manual resolution
}

export interface MergeIntention {
  type: 'clean_merge' | 'conflict_merge'
  taskId: string
  taskBranch: string
  featureBranch: string
  conflicts?: MergeConflict[]
  proposedResolutions?: ConflictResolution[]
}

export interface ConflictAnalysis {
  suggestions: string[] // Resolution approaches
  recommendation: string // Best approach
  autoResolvable: boolean // Can be resolved automatically
  conflictDetails: Array<{
    file: string
    analysis: string
    suggestedResolution: ConflictResolution['resolution']
  }>
}

export const DEFAULT_MERGE_AGENT_STATE: Omit<MergeAgentState, 'featureId' | 'taskId'> = {
  status: 'initializing',
  agentId: null,
  taskWorktreePath: null,
  featureBranch: null,
  taskBranch: null,
  conflicts: [],
  conflictAnalysis: null,
  intention: null,
  approval: null,
  mergeResult: null,
  error: null,
  startedAt: null,
  completedAt: null
}
