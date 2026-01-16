/**
 * FeatureSpec types for DAGent feature specification management.
 * Enables PM agent to maintain a living feature specification that
 * captures user intent, requirements, and acceptance criteria.
 * This spec becomes the single source of truth for all agents
 * (Dev, QA, Merge) working on the feature.
 */

// =============================================================================
// Section Types
// =============================================================================

/**
 * Section types within a feature specification.
 */
export type SpecSection = 'goals' | 'requirements' | 'constraints' | 'acceptance_criteria'

// =============================================================================
// Core Interfaces
// =============================================================================

/**
 * Individual requirement item within the spec.
 * Requirements describe specific behaviors needed.
 */
export interface RequirementItem {
  /** Unique identifier (e.g., 'REQ-001') */
  id: string
  /** Human-readable description of the requirement */
  description: string
  /** Whether this requirement has been implemented */
  completed: boolean
  /** ISO timestamp when requirement was added */
  addedAt: string
  /** ISO timestamp when requirement was completed (if applicable) */
  completedAt?: string
}

/**
 * Acceptance criterion for validating feature completion.
 * Criteria describe how to verify the feature is done.
 */
export interface AcceptanceCriterion {
  /** Unique identifier (e.g., 'AC-001') */
  id: string
  /** Human-readable description of what to verify */
  description: string
  /** Whether this criterion has passed testing */
  passed: boolean
  /** ISO timestamp when criterion was tested (if applicable) */
  testedAt?: string
}

/**
 * History entry tracking changes to the spec over time.
 */
export interface SpecHistoryEntry {
  /** ISO timestamp of the change */
  timestamp: string
  /** Brief description of what changed */
  change: string
}

/**
 * Full feature specification document.
 * Maintained by PM agent and consumed by all agents.
 */
export interface FeatureSpec {
  /** Associated feature ID */
  featureId: string
  /** Human-readable feature name */
  featureName: string
  /** High-level goals - what user wants to achieve */
  goals: string[]
  /** Specific requirements - behaviors needed */
  requirements: RequirementItem[]
  /** Constraints - limitations/preferences */
  constraints: string[]
  /** Acceptance criteria - how to verify done */
  acceptanceCriteria: AcceptanceCriterion[]
  /** Change history */
  history: SpecHistoryEntry[]
  /** ISO timestamp when spec was created */
  createdAt: string
  /** ISO timestamp of last update */
  updatedAt: string
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a new requirement ID based on existing requirements.
 * Format: REQ-001, REQ-002, etc.
 */
export function generateRequirementId(existingRequirements: RequirementItem[]): string {
  const maxNum = existingRequirements.reduce((max, req) => {
    const match = req.id.match(/^REQ-(\d+)$/)
    if (match) {
      return Math.max(max, parseInt(match[1], 10))
    }
    return max
  }, 0)
  return `REQ-${String(maxNum + 1).padStart(3, '0')}`
}

/**
 * Generate a new acceptance criterion ID based on existing criteria.
 * Format: AC-001, AC-002, etc.
 */
export function generateAcceptanceCriterionId(existingCriteria: AcceptanceCriterion[]): string {
  const maxNum = existingCriteria.reduce((max, ac) => {
    const match = ac.id.match(/^AC-(\d+)$/)
    if (match) {
      return Math.max(max, parseInt(match[1], 10))
    }
    return max
  }, 0)
  return `AC-${String(maxNum + 1).padStart(3, '0')}`
}

/**
 * Create a new empty FeatureSpec with default values.
 */
export function createEmptySpec(featureId: string, featureName: string): FeatureSpec {
  const now = new Date().toISOString()
  return {
    featureId,
    featureName,
    goals: [],
    requirements: [],
    constraints: [],
    acceptanceCriteria: [],
    history: [
      {
        timestamp: now,
        change: 'Initial spec created'
      }
    ],
    createdAt: now,
    updatedAt: now
  }
}
