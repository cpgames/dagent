/**
 * QA agent types for DAGent.
 * Defines state, context, and configuration for QA agents.
 * QA agents review code changes against task specifications
 * and provide pass/fail feedback for the dev→qa→merge pipeline.
 *
 * QA Agent is autonomous - no harness communication needed.
 * On QA_PASSED: task transitions to merging
 * On QA_FAILED: task transitions back to dev with feedback stored in task.qaFeedback
 */

/**
 * Internal QA agent status for tracking agent lifecycle.
 */
export type QAAgentStatus =
  | 'initializing'
  | 'loading_context'
  | 'reviewing'
  | 'completed'
  | 'failed'

/**
 * QA agent state interface.
 */
export interface QAAgentState {
  status: QAAgentStatus
  agentId: string | null
  featureId: string
  taskId: string
  worktreePath: string | null
  reviewResult: QAReviewResult | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
}

/**
 * Result of a QA code review.
 */
export interface QAReviewResult {
  passed: boolean
  feedback?: string // Only present when !passed
  filesReviewed: string[]
}

/**
 * QA agent configuration.
 */
export interface QAAgentConfig {
  autoReview: boolean // Automatically start review on initialize (default: true)
}

/**
 * Default QA agent state.
 */
export const DEFAULT_QA_AGENT_STATE: Omit<QAAgentState, 'featureId' | 'taskId'> = {
  status: 'initializing',
  agentId: null,
  worktreePath: null,
  reviewResult: null,
  error: null,
  startedAt: null,
  completedAt: null
}

/**
 * Default QA agent configuration.
 */
export const DEFAULT_QA_AGENT_CONFIG: QAAgentConfig = {
  autoReview: true
}
