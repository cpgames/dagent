/**
 * FeatureMergeAgent - handles merging completed features into main/working branch.
 * Different from MergeAgent which handles task-to-feature merges in worktrees.
 *
 * This agent operates on the main repository directly:
 * - Merges feature branch into target branch (default: main)
 * - Detects and reports conflicts
 * - Uses AI to analyze conflicts and suggest resolutions
 * - Optionally deletes feature branch after successful merge
 */

import { EventEmitter } from 'events'
import type { MergeConflict } from '../git/types'
import type {
  FeatureMergeAgentState,
  FeatureMergeAgentStatus,
  FeatureMergeResult
} from './feature-merge-types'
import { DEFAULT_FEATURE_MERGE_AGENT_STATE } from './feature-merge-types'
import type { IntentionDecision } from './harness-types'
import type { ConflictAnalysis } from './merge-types'
import { getAgentPool } from './agent-pool'
import { getGitManager, getFeatureBranchName } from '../git'
import { getAgentService } from '../agent'
import { RequestPriority } from '../agent/request-types'
import { getFeatureStatusManager } from '../ipc/feature-handlers'

export class FeatureMergeAgent extends EventEmitter {
  private state: FeatureMergeAgentState
  private providedFeatureBranch?: string // Branch name from feature record (for legacy support)

  constructor(featureId: string, targetBranch: string = 'main', featureBranch?: string) {
    super()
    this.state = {
      ...DEFAULT_FEATURE_MERGE_AGENT_STATE,
      featureId,
      targetBranch
    }
    this.providedFeatureBranch = featureBranch
  }

  /**
   * Initialize the feature merge agent.
   */
  async initialize(): Promise<boolean> {
    if (this.state.status !== 'initializing') {
      return false
    }

    this.state.startedAt = new Date().toISOString()

    // Register with agent pool (merge has priority)
    const pool = getAgentPool()
    if (!pool.canSpawn('merge')) {
      this.state.status = 'failed'
      this.state.error = 'Cannot spawn merge agent - pool limit reached'
      return false
    }

    const agentInfo = pool.registerAgent({
      type: 'merge',
      featureId: this.state.featureId
    })

    this.state.agentId = agentInfo.id
    pool.updateAgentStatus(agentInfo.id, 'busy', this.state.featureId)

    // Set up branch names - prefer provided branch name (from feature record) for legacy support
    this.state.featureBranch = this.providedFeatureBranch || getFeatureBranchName(this.state.featureId)

    this.emit('feature-merge-agent:initialized', this.getState())
    return true
  }

  /**
   * Check that feature and target branches exist.
   */
  async checkBranches(): Promise<boolean> {
    this.state.status = 'checking_branches'

    console.log(`[FeatureMergeAgent] Checking branches:`)
    console.log(`  Feature ID: ${this.state.featureId}`)
    console.log(`  Feature branch: ${this.state.featureBranch}`)
    console.log(`  Target branch: ${this.state.targetBranch}`)
    console.log(`  Provided branch override: ${this.providedFeatureBranch}`)

    try {
      const gitManager = getGitManager()

      // List all local branches for debugging
      const allBranches = await gitManager.listBranches()
      console.log(`[FeatureMergeAgent] Available local branches: ${allBranches.map(b => b.name).join(', ')}`)

      // Verify feature branch exists
      const featureBranchExists = await gitManager.branchExists(this.state.featureBranch!)
      console.log(`[FeatureMergeAgent] Feature branch '${this.state.featureBranch}' exists: ${featureBranchExists}`)
      if (!featureBranchExists) {
        this.state.error = `Feature branch '${this.state.featureBranch}' not found. Available branches: ${allBranches.map(b => b.name).join(', ')}`
        this.state.status = 'failed'
        return false
      }

      // Verify target branch exists
      const targetBranchExists = await gitManager.branchExists(this.state.targetBranch!)
      console.log(`[FeatureMergeAgent] Target branch '${this.state.targetBranch}' exists: ${targetBranchExists}`)
      if (!targetBranchExists) {
        this.state.error = `Target branch '${this.state.targetBranch}' not found. Available branches: ${allBranches.map(b => b.name).join(', ')}`
        this.state.status = 'failed'
        return false
      }

      // Get diff summary to understand changes
      const diffSummary = await gitManager.getDiffSummary(
        this.state.targetBranch!,
        this.state.featureBranch!
      )

      this.emit('feature-merge-agent:branches-checked', {
        featureBranch: this.state.featureBranch,
        targetBranch: this.state.targetBranch,
        filesChanged: diffSummary.files,
        insertions: diffSummary.insertions,
        deletions: diffSummary.deletions
      })

      return true
    } catch (error) {
      console.error(`[FeatureMergeAgent] checkBranches error:`, error)
      this.state.error = (error as Error).message
      this.state.status = 'failed'
      return false
    }
  }

  /**
   * Propose merge intention (optional - can skip for auto-approval).
   */
  async proposeIntention(): Promise<boolean> {
    this.state.status = 'proposing_intention'

    // Build intention based on conflict status
    const hasConflicts = this.state.conflicts.length > 0
    const analysis = this.state.conflictAnalysis
    let intentionText: string

    if (hasConflicts) {
      intentionText =
        `INTENTION: Merge feature branch with conflict resolution\n` +
        `Feature: ${this.state.featureId}\n` +
        `Branch: ${this.state.featureBranch} -> ${this.state.targetBranch}\n` +
        `Conflicts detected in ${this.state.conflicts.length} files:\n` +
        this.state.conflicts.map((c) => `  - ${c.file} (${c.type})`).join('\n')

      // Include AI analysis if available
      if (analysis) {
        intentionText +=
          `\n\n## AI Analysis\n` +
          `Auto-resolvable: ${analysis.autoResolvable ? 'Yes' : 'No'}\n` +
          `Recommendation: ${analysis.recommendation}\n` +
          `\nSuggestions:\n` +
          analysis.suggestions.map((s) => `  - ${s}`).join('\n')
      } else {
        intentionText += `\nWill resolve conflicts with user guidance.`
      }
    } else {
      intentionText =
        `INTENTION: Clean merge of feature branch\n` +
        `Feature: ${this.state.featureId}\n` +
        `Branch: ${this.state.featureBranch} -> ${this.state.targetBranch}\n` +
        `No conflicts expected. Proceeding with merge.`
    }

    this.state.intention = intentionText
    this.state.status = 'awaiting_approval'

    this.emit('feature-merge-agent:intention-proposed', intentionText)
    return true
  }

  /**
   * Receive approval decision.
   */
  receiveApproval(decision: IntentionDecision): void {
    // Allow approval after branch check (auto-approve) or after intention proposal
    if (this.state.status !== 'awaiting_approval' && this.state.status !== 'checking_branches') {
      console.warn(
        `[FeatureMergeAgent] receiveApproval called in unexpected state: ${this.state.status}`
      )
      return
    }

    this.state.approval = decision

    if (decision.approved) {
      this.emit('feature-merge-agent:approved', decision)
    } else {
      this.state.status = 'failed'
      this.state.error = decision.reason || 'Merge intention rejected'
      this.emit('feature-merge-agent:rejected', decision)
    }
  }

  /**
   * Execute the merge.
   */
  async executeMerge(deleteBranchOnSuccess: boolean = false): Promise<FeatureMergeResult> {
    if (!this.state.approval?.approved) {
      return {
        success: false,
        merged: false,
        branchDeleted: false,
        error: 'Merge not approved'
      }
    }

    this.state.status = 'merging'
    this.emit('feature-merge-agent:merging')

    try {
      const gitManager = getGitManager()

      // Archive feature BEFORE merge deletes the worktree (which contains feature.json)
      // We archive first because mergeFeatureIntoMain with deleteBranchOnSuccess=true
      // will delete the worktree directory, including the feature.json file
      let archivedBeforeMerge = false
      if (deleteBranchOnSuccess) {
        try {
          await this.archiveFeature()
          archivedBeforeMerge = true
        } catch (archiveError) {
          console.warn(`[FeatureMergeAgent] Failed to archive before merge: ${(archiveError as Error).message}`)
          // Continue with merge anyway - worst case is we can't archive
        }
      }

      // Perform the merge using GitManager
      // Pass the feature branch name to handle legacy naming conventions
      const result = await gitManager.mergeFeatureIntoMain(
        this.state.featureId,
        deleteBranchOnSuccess,
        this.state.targetBranch!,
        this.state.featureBranch || undefined
      )

      this.state.mergeResult = result

      if (result.success && result.merged) {
        this.state.status = 'completed'
        this.state.completedAt = new Date().toISOString()

        this.emit('feature-merge-agent:completed', result)
      } else if (result.conflicts && result.conflicts.length > 0) {
        // Conflicts detected during merge
        this.state.status = 'resolving_conflicts'
        this.state.conflicts = result.conflicts

        // Revert archive if we archived before merge
        if (archivedBeforeMerge) {
          await this.unarchiveFeature()
        }

        // Analyze conflicts using SDK
        const analysis = await this.analyzeConflicts(result.conflicts)
        if (analysis) {
          this.state.conflictAnalysis = analysis
          this.emit('feature-merge-agent:analysis', analysis)
        }

        this.emit('feature-merge-agent:conflicts', result.conflicts)
      } else {
        this.state.status = 'failed'
        this.state.error = result.error || 'Merge failed'

        // Revert archive if we archived before merge
        if (archivedBeforeMerge) {
          await this.unarchiveFeature()
        }

        this.emit('feature-merge-agent:failed', result)
      }

      return result
    } catch (error) {
      const errorMsg = (error as Error).message
      this.state.status = 'failed'
      this.state.error = errorMsg

      const result: FeatureMergeResult = {
        success: false,
        merged: false,
        branchDeleted: false,
        error: errorMsg
      }

      this.emit('feature-merge-agent:failed', result)
      return result
    }
  }

  /**
   * Abort the merge (if in progress).
   */
  async abortMerge(): Promise<boolean> {
    try {
      const gitManager = getGitManager()
      const result = await gitManager.abortMerge()
      return result.success
    } catch {
      return false
    }
  }

  /**
   * Analyze conflicts using Claude SDK for intelligent resolution suggestions.
   */
  async analyzeConflicts(conflicts: MergeConflict[]): Promise<ConflictAnalysis | null> {
    if (conflicts.length === 0) {
      return null
    }

    try {
      const agentService = getAgentService()
      const gitManager = getGitManager()
      const prompt = this.buildConflictAnalysisPrompt(conflicts)
      let responseText = ''

      for await (const event of agentService.streamQuery({
        prompt,
        toolPreset: 'mergeAgent',
        permissionMode: 'acceptEdits',
        cwd: gitManager.getConfig().baseDir,
        agentType: 'merge',
        agentId: `feature-merge-${this.state.featureId}`,
        featureId: this.state.featureId,
        priority: RequestPriority.MERGE
      })) {
        if (event.type === 'message' && event.message?.type === 'assistant') {
          responseText += event.message.content
        }
        if (event.type === 'message' && event.message?.type === 'result') {
          responseText = event.message.content
        }
      }

      return this.parseConflictAnalysis(responseText, conflicts)
    } catch (error) {
      console.error('Feature merge conflict analysis failed:', error)
      return null
    }
  }

  /**
   * Build prompt for conflict analysis.
   */
  private buildConflictAnalysisPrompt(conflicts: MergeConflict[]): string {
    const parts: string[] = [
      '# Feature Merge Conflict Analysis Request',
      '',
      '## Context',
      `Feature branch: ${this.state.featureBranch}`,
      `Target branch: ${this.state.targetBranch}`,
      '',
      '## Conflicts',
      `${conflicts.length} file(s) have conflicts:`,
      ''
    ]

    for (const conflict of conflicts) {
      parts.push(`### ${conflict.file}`)
      parts.push(`Type: ${conflict.type}`)
      parts.push('')
    }

    parts.push(
      'Note: Use the Read tool to examine the conflicting files for detailed analysis.',
      ''
    )

    parts.push(
      '## Your Task',
      'Analyze the conflicts and provide:',
      '1. For each file, analyze what caused the conflict',
      '2. Suggest resolution approach (ours/theirs/both/manual)',
      '3. Provide an overall recommendation',
      '4. Indicate if conflicts can be auto-resolved',
      '',
      'Format your response as:',
      'AUTO_RESOLVABLE: [yes|no]',
      'RECOMMENDATION: [overall approach]',
      '',
      'For each file:',
      'FILE: [filename]',
      'ANALYSIS: [what caused the conflict]',
      'RESOLUTION: [ours|theirs|both|manual]',
      '',
      'SUGGESTIONS:',
      '- [suggestion 1]',
      '- [suggestion 2]'
    )

    return parts.join('\n')
  }

  /**
   * Parse SDK response into ConflictAnalysis.
   */
  private parseConflictAnalysis(response: string, conflicts: MergeConflict[]): ConflictAnalysis {
    const upperResponse = response.toUpperCase()

    // Parse auto-resolvable
    const autoResolvable = upperResponse.includes('AUTO_RESOLVABLE: YES')

    // Parse recommendation
    const recommendationMatch = response.match(
      /RECOMMENDATION:\s*(.+?)(?=\n|FILE:|SUGGESTIONS:|$)/is
    )
    const recommendation = recommendationMatch?.[1]?.trim() || 'Manual review required'

    // Parse file analyses
    const conflictDetails: ConflictAnalysis['conflictDetails'] = []
    const filePattern =
      /FILE:\s*(.+?)\nANALYSIS:\s*(.+?)\nRESOLUTION:\s*(ours|theirs|both|manual)/gis

    let match
    while ((match = filePattern.exec(response)) !== null) {
      const file = match[1].trim()
      const analysis = match[2].trim()
      const resolutionStr = match[3].toLowerCase().trim()
      const suggestedResolution = ['ours', 'theirs', 'both', 'manual'].includes(resolutionStr)
        ? (resolutionStr as 'ours' | 'theirs' | 'both' | 'manual')
        : 'manual'

      conflictDetails.push({ file, analysis, suggestedResolution })
    }

    // If parsing didn't find file entries, create default entries
    if (conflictDetails.length === 0) {
      for (const conflict of conflicts) {
        conflictDetails.push({
          file: conflict.file,
          analysis: 'Unable to parse analysis from SDK response',
          suggestedResolution: 'manual'
        })
      }
    }

    // Parse suggestions
    const suggestionsMatch = response.match(/SUGGESTIONS:\s*([\s\S]*?)$/i)
    const suggestions: string[] = []
    if (suggestionsMatch) {
      const suggestionLines = suggestionsMatch[1].split('\n')
      for (const line of suggestionLines) {
        const trimmed = line.replace(/^[-*]\s*/, '').trim()
        if (trimmed) {
          suggestions.push(trimmed)
        }
      }
    }

    if (suggestions.length === 0) {
      suggestions.push('Review conflicts manually and resolve based on project requirements')
    }

    return {
      suggestions,
      recommendation,
      autoResolvable,
      conflictDetails
    }
  }

  /**
   * Get current state.
   */
  getState(): FeatureMergeAgentState {
    return { ...this.state }
  }

  /**
   * Get current status.
   */
  getStatus(): FeatureMergeAgentStatus {
    return this.state.status
  }

  /**
   * Archive the feature after successful merge.
   * Transitions feature from 'merging' to 'archived' status.
   */
  private async archiveFeature(): Promise<void> {
    const statusManager = getFeatureStatusManager()
    await statusManager.updateFeatureStatus(this.state.featureId, 'archived')

    console.log(`[FeatureMergeAgent] Feature ${this.state.featureId} archived`)

    this.emit('feature-archived', {
      featureId: this.state.featureId,
      mergeType: 'ai'
    })
  }

  /**
   * Revert archive if merge fails after we archived.
   * Transitions feature from 'archived' back to 'needs_merging' for retry.
   */
  private async unarchiveFeature(): Promise<void> {
    try {
      const statusManager = getFeatureStatusManager()
      // Go back to needs_merging so merge can be retried
      await statusManager.updateFeatureStatus(this.state.featureId, 'not_started')

      console.log(`[FeatureMergeAgent] Feature ${this.state.featureId} un-archived after merge failure`)
    } catch (error) {
      // Log error but don't fail - the feature might already be in a valid state
      console.warn(`[FeatureMergeAgent] Failed to un-archive feature ${this.state.featureId}:`, (error as Error).message)
    }
  }

  /**
   * Clean up resources.
   */
  async cleanup(): Promise<void> {
    // Release from pool
    if (this.state.agentId) {
      const pool = getAgentPool()
      pool.terminateAgent(this.state.agentId)
    }

    this.emit('feature-merge-agent:cleanup')
  }
}

// Factory for creating feature merge agents
export function createFeatureMergeAgent(
  featureId: string,
  targetBranch: string = 'main',
  featureBranch?: string
): FeatureMergeAgent {
  return new FeatureMergeAgent(featureId, targetBranch, featureBranch)
}

// Active feature merge agents registry (keyed by featureId)
const activeFeatureMergeAgents: Map<string, FeatureMergeAgent> = new Map()

export function registerFeatureMergeAgent(agent: FeatureMergeAgent): void {
  activeFeatureMergeAgents.set(agent.getState().featureId, agent)
}

export function getFeatureMergeAgent(featureId: string): FeatureMergeAgent | undefined {
  return activeFeatureMergeAgents.get(featureId)
}

export function removeFeatureMergeAgent(featureId: string): boolean {
  return activeFeatureMergeAgents.delete(featureId)
}

export function getAllFeatureMergeAgents(): FeatureMergeAgent[] {
  return Array.from(activeFeatureMergeAgents.values())
}

export function clearFeatureMergeAgents(): void {
  for (const agent of activeFeatureMergeAgents.values()) {
    agent.cleanup()
  }
  activeFeatureMergeAgents.clear()
}
