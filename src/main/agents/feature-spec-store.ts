/**
 * FeatureSpecStore for persisting feature specifications as markdown.
 * Follows singleton pattern from TaskPlanStore.
 * Each feature has a feature-spec.md in its .dagent directory.
 */

import { readFile, writeFile, unlink, access, mkdir } from 'fs/promises'
import path from 'path'
import { getFeatureSpecPathInWorktree } from '../storage/paths'
import type {
  FeatureSpec,
  RequirementItem,
  AcceptanceCriterion,
  SpecHistoryEntry
} from './feature-spec-types'
import {
  createEmptySpec,
  generateRequirementId,
  generateAcceptanceCriterionId
} from './feature-spec-types'
import { getFeatureStore } from '../ipc/storage-handlers'

// Singleton store per projectRoot
const stores = new Map<string, FeatureSpecStore>()

/**
 * Get or create a FeatureSpecStore singleton for a project.
 */
export function getFeatureSpecStore(projectRoot: string): FeatureSpecStore {
  let store = stores.get(projectRoot)
  if (!store) {
    store = new FeatureSpecStore(projectRoot)
    stores.set(projectRoot, store)
  }
  return store
}

/**
 * FeatureSpecStore manages CRUD operations for feature specs.
 * Specs are stored as human-readable markdown files.
 */
export class FeatureSpecStore {
  // projectRoot passed to constructor is used as the cache key in the stores Map
  constructor(_projectRoot: string) {
    // Constructor parameter used only for Map key lookup in getFeatureSpecStore()
    void _projectRoot
  }

  /**
   * Get the file path for a feature's spec.
   * Requires feature to have a managerWorktreePath set.
   */
  private async getPath(featureId: string): Promise<string | null> {
    const featureStore = getFeatureStore()
    if (!featureStore) {
      console.error('[FeatureSpecStore] FeatureStore not initialized')
      return null
    }
    const feature = await featureStore.loadFeature(featureId)
    if (!feature?.managerWorktreePath) {
      console.error(`[FeatureSpecStore] Feature ${featureId} does not have a worktree path`)
      return null
    }
    return getFeatureSpecPathInWorktree(feature.managerWorktreePath, featureId)
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * Create a new FeatureSpec with empty sections.
   * Saves the spec immediately.
   */
  async createSpec(featureId: string, featureName: string): Promise<FeatureSpec> {
    const spec = createEmptySpec(featureId, featureName)
    await this.saveSpec(featureId, spec)
    return spec
  }

  /**
   * Load an existing FeatureSpec from markdown.
   * @returns FeatureSpec or null if not found.
   */
  async loadSpec(featureId: string): Promise<FeatureSpec | null> {
    const filePath = await this.getPath(featureId)
    if (!filePath) return null
    try {
      const content = await readFile(filePath, 'utf-8')
      return this.parseMarkdown(content, featureId)
    } catch {
      return null
    }
  }

  /**
   * Save a FeatureSpec as markdown.
   * Updates the `updatedAt` timestamp.
   */
  async saveSpec(featureId: string, spec: FeatureSpec): Promise<void> {
    spec.updatedAt = new Date().toISOString()
    const content = this.toMarkdown(spec)
    const filePath = await this.getPath(featureId)
    if (!filePath) {
      throw new Error(`Cannot save spec: feature ${featureId} does not have a worktree path`)
    }
    // Ensure directory exists
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf-8')
  }

  /**
   * Delete a FeatureSpec.
   * @returns true if deleted, false if didn't exist.
   */
  async deleteSpec(featureId: string): Promise<boolean> {
    const filePath = await this.getPath(featureId)
    if (!filePath) return false
    try {
      await unlink(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if a FeatureSpec exists.
   */
  async specExists(featureId: string): Promise<boolean> {
    const filePath = await this.getPath(featureId)
    if (!filePath) return false
    try {
      await access(filePath)
      return true
    } catch {
      return false
    }
  }

  // ===========================================================================
  // Update Operations
  // ===========================================================================

  /**
   * Update spec sections using "set" semantics.
   * Provided arrays replace existing content entirely. Omitted fields are unchanged.
   * Handles ID generation for requirements and acceptance criteria.
   * @throws Error if spec not found.
   */
  async updateSpec(
    featureId: string,
    updates: {
      goals?: string[]
      requirements?: string[]
      constraints?: string[]
      acceptanceCriteria?: string[]
      historyNote?: string
    }
  ): Promise<void> {
    const spec = await this.loadSpec(featureId)
    if (!spec) {
      throw new Error(`FeatureSpec not found for feature ${featureId}`)
    }

    const now = new Date().toISOString()

    // Replace goals if provided
    if (updates.goals !== undefined) {
      spec.goals = updates.goals
    }

    // Replace requirements if provided (generate new IDs)
    if (updates.requirements !== undefined) {
      spec.requirements = updates.requirements.map((desc, idx) => ({
        id: `REQ-${String(idx + 1).padStart(3, '0')}`,
        description: desc,
        completed: false,
        addedAt: now
      }))
    }

    // Replace constraints if provided
    if (updates.constraints !== undefined) {
      spec.constraints = updates.constraints
    }

    // Replace acceptance criteria if provided (generate new IDs)
    if (updates.acceptanceCriteria !== undefined) {
      spec.acceptanceCriteria = updates.acceptanceCriteria.map((desc, idx) => ({
        id: `AC-${String(idx + 1).padStart(3, '0')}`,
        description: desc,
        passed: false
      }))
    }

    // Add history note if provided
    if (updates.historyNote) {
      spec.history.push({
        timestamp: now,
        change: updates.historyNote
      })
    }

    await this.saveSpec(featureId, spec)
  }

  /**
   * Add a goal to the spec.
   * @throws Error if spec not found.
   */
  async addGoal(featureId: string, goal: string): Promise<void> {
    const spec = await this.loadSpec(featureId)
    if (!spec) {
      throw new Error(`FeatureSpec not found for feature ${featureId}`)
    }
    spec.goals.push(goal)
    await this.saveSpec(featureId, spec)
  }

  /**
   * Add a requirement with auto-generated ID.
   * @throws Error if spec not found.
   * @returns The created RequirementItem.
   */
  async addRequirement(featureId: string, description: string): Promise<RequirementItem> {
    const spec = await this.loadSpec(featureId)
    if (!spec) {
      throw new Error(`FeatureSpec not found for feature ${featureId}`)
    }

    const requirement: RequirementItem = {
      id: generateRequirementId(spec.requirements),
      description,
      completed: false,
      addedAt: new Date().toISOString()
    }

    spec.requirements.push(requirement)
    await this.saveSpec(featureId, spec)
    return requirement
  }

  /**
   * Add a constraint to the spec.
   * @throws Error if spec not found.
   */
  async addConstraint(featureId: string, constraint: string): Promise<void> {
    const spec = await this.loadSpec(featureId)
    if (!spec) {
      throw new Error(`FeatureSpec not found for feature ${featureId}`)
    }
    spec.constraints.push(constraint)
    await this.saveSpec(featureId, spec)
  }

  /**
   * Add an acceptance criterion with auto-generated ID.
   * @throws Error if spec not found.
   * @returns The created AcceptanceCriterion.
   */
  async addAcceptanceCriterion(
    featureId: string,
    description: string
  ): Promise<AcceptanceCriterion> {
    const spec = await this.loadSpec(featureId)
    if (!spec) {
      throw new Error(`FeatureSpec not found for feature ${featureId}`)
    }

    const criterion: AcceptanceCriterion = {
      id: generateAcceptanceCriterionId(spec.acceptanceCriteria),
      description,
      passed: false
    }

    spec.acceptanceCriteria.push(criterion)
    await this.saveSpec(featureId, spec)
    return criterion
  }

  /**
   * Mark a requirement as complete.
   * @throws Error if spec or requirement not found.
   */
  async markRequirementComplete(featureId: string, reqId: string): Promise<void> {
    const spec = await this.loadSpec(featureId)
    if (!spec) {
      throw new Error(`FeatureSpec not found for feature ${featureId}`)
    }

    const requirement = spec.requirements.find((r) => r.id === reqId)
    if (!requirement) {
      throw new Error(`Requirement ${reqId} not found in feature ${featureId}`)
    }

    requirement.completed = true
    requirement.completedAt = new Date().toISOString()
    await this.saveSpec(featureId, spec)
  }

  /**
   * Mark an acceptance criterion as passed.
   * @throws Error if spec or criterion not found.
   */
  async markCriterionPassed(featureId: string, acId: string): Promise<void> {
    const spec = await this.loadSpec(featureId)
    if (!spec) {
      throw new Error(`FeatureSpec not found for feature ${featureId}`)
    }

    const criterion = spec.acceptanceCriteria.find((c) => c.id === acId)
    if (!criterion) {
      throw new Error(`Acceptance criterion ${acId} not found in feature ${featureId}`)
    }

    criterion.passed = true
    criterion.testedAt = new Date().toISOString()
    await this.saveSpec(featureId, spec)
  }

  /**
   * Add a history entry to track spec changes.
   * @throws Error if spec not found.
   */
  async addHistoryEntry(featureId: string, change: string): Promise<void> {
    const spec = await this.loadSpec(featureId)
    if (!spec) {
      throw new Error(`FeatureSpec not found for feature ${featureId}`)
    }

    const entry: SpecHistoryEntry = {
      timestamp: new Date().toISOString(),
      change
    }

    spec.history.push(entry)
    await this.saveSpec(featureId, spec)
  }

  // ===========================================================================
  // Markdown Serialization
  // ===========================================================================

  /**
   * Convert a FeatureSpec to human-readable markdown.
   */
  private toMarkdown(spec: FeatureSpec): string {
    const lines: string[] = []

    // Header
    lines.push(`# Feature: ${spec.featureName}`)
    lines.push('')

    // Goals
    lines.push('## Goals')
    if (spec.goals.length === 0) {
      lines.push('_No goals defined yet._')
    } else {
      for (const goal of spec.goals) {
        lines.push(`- ${goal}`)
      }
    }
    lines.push('')

    // Requirements
    lines.push('## Requirements')
    if (spec.requirements.length === 0) {
      lines.push('_No requirements defined yet._')
    } else {
      for (const req of spec.requirements) {
        const checkbox = req.completed ? '[x]' : '[ ]'
        lines.push(`- ${checkbox} ${req.id}: ${req.description}`)
      }
    }
    lines.push('')

    // Constraints
    lines.push('## Constraints')
    if (spec.constraints.length === 0) {
      lines.push('_No constraints defined yet._')
    } else {
      for (const constraint of spec.constraints) {
        lines.push(`- ${constraint}`)
      }
    }
    lines.push('')

    // Acceptance Criteria
    lines.push('## Acceptance Criteria')
    if (spec.acceptanceCriteria.length === 0) {
      lines.push('_No acceptance criteria defined yet._')
    } else {
      for (const ac of spec.acceptanceCriteria) {
        const checkbox = ac.passed ? '[x]' : '[ ]'
        lines.push(`- ${checkbox} ${ac.id}: ${ac.description}`)
      }
    }
    lines.push('')

    // History
    lines.push('## History')
    if (spec.history.length === 0) {
      lines.push('_No history entries._')
    } else {
      for (const entry of spec.history) {
        const date = entry.timestamp.split('T')[0]
        lines.push(`- ${date}: ${entry.change}`)
      }
    }
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Parse markdown content back to FeatureSpec object.
   */
  private parseMarkdown(content: string, featureId: string): FeatureSpec {
    const lines = content.split('\n')

    let featureName = ''
    const goals: string[] = []
    const requirements: RequirementItem[] = []
    const constraints: string[] = []
    const acceptanceCriteria: AcceptanceCriterion[] = []
    const history: SpecHistoryEntry[] = []

    let currentSection = ''

    for (const line of lines) {
      const trimmed = line.trim()

      // Parse feature name from header
      if (trimmed.startsWith('# Feature:')) {
        featureName = trimmed.replace('# Feature:', '').trim()
        continue
      }

      // Detect section headers
      if (trimmed === '## Goals') {
        currentSection = 'goals'
        continue
      } else if (trimmed === '## Requirements') {
        currentSection = 'requirements'
        continue
      } else if (trimmed === '## Constraints') {
        currentSection = 'constraints'
        continue
      } else if (trimmed === '## Acceptance Criteria') {
        currentSection = 'acceptance_criteria'
        continue
      } else if (trimmed === '## History') {
        currentSection = 'history'
        continue
      }

      // Skip empty lines and placeholder text
      if (!trimmed || trimmed.startsWith('_')) {
        continue
      }

      // Parse list items based on current section
      if (trimmed.startsWith('- ')) {
        const item = trimmed.substring(2)

        switch (currentSection) {
          case 'goals':
            goals.push(item)
            break

          case 'requirements': {
            const reqMatch = item.match(/^\[([ x])\]\s*(REQ-\d+):\s*(.+)$/)
            if (reqMatch) {
              requirements.push({
                id: reqMatch[2],
                description: reqMatch[3],
                completed: reqMatch[1] === 'x',
                addedAt: new Date().toISOString() // Can't recover from markdown
              })
            }
            break
          }

          case 'constraints':
            constraints.push(item)
            break

          case 'acceptance_criteria': {
            const acMatch = item.match(/^\[([ x])\]\s*(AC-\d+):\s*(.+)$/)
            if (acMatch) {
              acceptanceCriteria.push({
                id: acMatch[2],
                description: acMatch[3],
                passed: acMatch[1] === 'x'
              })
            }
            break
          }

          case 'history': {
            const historyMatch = item.match(/^(\d{4}-\d{2}-\d{2}):\s*(.+)$/)
            if (historyMatch) {
              history.push({
                timestamp: historyMatch[1] + 'T00:00:00.000Z',
                change: historyMatch[2]
              })
            }
            break
          }
        }
      }
    }

    const now = new Date().toISOString()

    return {
      featureId,
      featureName,
      goals,
      requirements,
      constraints,
      acceptanceCriteria,
      history,
      createdAt: now, // Can't recover from markdown
      updatedAt: now
    }
  }
}
