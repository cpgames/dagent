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
  FeatureMergeResult,
  ConflictAnalysis
} from './feature-merge-types'
import { DEFAULT_FEATURE_MERGE_AGENT_STATE } from './feature-merge-types'
import type { IntentionDecision } from './dev-types'
import { getAgentPool } from './agent-pool'
import { getGitManager, getFeatureBranchName } from '../git'
import { getAgentService } from '../agent'
import { RequestPriority } from '../agent/request-types'

/** Git status data structure from getStatus() */
interface GitStatusData {
  current: string | null
  conflicted: string[]
  isClean: boolean
}

export class FeatureMergeAgent extends EventEmitter {
  private state: FeatureMergeAgentState
  private providedFeatureBranch?: string // Branch name from feature record (for legacy support)
  private isAborted: boolean = false

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
  async executeMerge(_deleteBranchOnSuccess: boolean = false): Promise<FeatureMergeResult> {
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

      // Perform the merge using GitManager
      // Note: We don't auto-archive - user decides when to archive the feature
      // We also don't delete branch/worktree since archiving handles cleanup
      const result = await gitManager.mergeFeatureIntoMain(
        this.state.featureId,
        false, // Never auto-delete - archiving will handle cleanup
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
        this.emit('feature-merge-agent:conflicts', result.conflicts)

        // Analyze conflicts using SDK
        const analysis = await this.analyzeConflicts(result.conflicts)
        if (analysis) {
          this.state.conflictAnalysis = analysis
          this.emit('feature-merge-agent:analysis', analysis)
        }

        // Attempt to resolve conflicts using AI
        const resolveResult = await this.resolveConflicts()
        if (resolveResult.success) {
          // Conflicts resolved, return success
          return this.state.mergeResult!
        } else {
          // Resolution failed, update error state
          this.state.status = 'failed'
          this.state.error = resolveResult.error || 'Failed to resolve conflicts'
          this.emit('feature-merge-agent:failed', {
            success: false,
            merged: false,
            branchDeleted: false,
            error: this.state.error
          })
          return {
            success: false,
            merged: false,
            branchDeleted: false,
            error: this.state.error,
            conflicts: result.conflicts
          }
        }
      } else {
        this.state.status = 'failed'
        this.state.error = result.error || 'Merge failed'

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
        // Emit streaming events for log display
        this.emit('feature-merge-agent:stream', event)

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
   * Resolve conflicts using Claude SDK.
   * This method uses AI to read conflicted files, understand the changes,
   * and write resolutions that preserve both sides' intent.
   */
  async resolveConflicts(): Promise<{ success: boolean; error?: string }> {
    if (this.state.conflicts.length === 0) {
      return { success: true }
    }

    this.state.status = 'resolving_conflicts'
    this.emit('feature-merge-agent:resolving', { conflicts: this.state.conflicts })

    try {
      const agentService = getAgentService()
      const gitManager = getGitManager()
      const prompt = this.buildConflictResolutionPrompt()

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
        // Check for abort
        if (this.isAborted) {
          console.log(`[FeatureMergeAgent] Aborted during conflict resolution`)
          return { success: false, error: 'Resolution aborted by user' }
        }

        // Emit all streaming events for log display
        this.emit('feature-merge-agent:stream', event)

        if (event.type === 'error') {
          return { success: false, error: event.error || 'Resolution failed' }
        }
      }

      // Check if conflicts were resolved (no conflict markers remaining)
      const statusResult = await gitManager.getStatus()
      const statusData = statusResult.data as GitStatusData | undefined
      const hasUnresolvedConflicts = (statusData?.conflicted?.length ?? 0) > 0

      if (hasUnresolvedConflicts) {
        return { success: false, error: 'Some conflicts could not be resolved automatically' }
      }

      // Stage resolved files and commit
      const baseDir = gitManager.getConfig().baseDir
      const commitResult = await gitManager.commitMerge(
        baseDir,
        `Merge ${this.state.featureBranch} into ${this.state.targetBranch} (AI-resolved conflicts)`
      )

      if (!commitResult.success) {
        return { success: false, error: commitResult.error || 'Failed to commit resolved merge' }
      }

      this.state.status = 'completed'
      this.state.completedAt = new Date().toISOString()
      this.state.mergeResult = {
        success: true,
        merged: true,
        branchDeleted: false
      }

      this.emit('feature-merge-agent:completed', this.state.mergeResult)
      return { success: true }
    } catch (error) {
      const errorMsg = (error as Error).message
      this.state.status = 'failed'
      this.state.error = errorMsg
      return { success: false, error: errorMsg }
    }
  }

  /**
   * Build prompt for conflict resolution (AI will edit files).
   */
  private buildConflictResolutionPrompt(): string {
    const parts: string[] = [
      '# Merge Conflict Resolution Task',
      '',
      '## Context',
      `You are resolving merge conflicts between:`,
      `- Feature branch: ${this.state.featureBranch}`,
      `- Target branch: ${this.state.targetBranch}`,
      '',
      '## Conflicts to Resolve',
      `${this.state.conflicts.length} file(s) have conflicts:`,
      ''
    ]

    for (const conflict of this.state.conflicts) {
      parts.push(`- **${conflict.file}** (${conflict.type})`)
    }

    // Include analysis if available
    if (this.state.conflictAnalysis) {
      parts.push('')
      parts.push('## Prior Analysis')
      parts.push(`Recommendation: ${this.state.conflictAnalysis.recommendation}`)
      parts.push('')
      for (const detail of this.state.conflictAnalysis.conflictDetails) {
        parts.push(`### ${detail.file}`)
        parts.push(`Analysis: ${detail.analysis}`)
        parts.push(`Suggested approach: ${detail.suggestedResolution}`)
        parts.push('')
      }
    }

    parts.push(
      '',
      '## Your Task',
      '',
      '1. Read each conflicted file using the Read tool',
      '2. Understand the intent of BOTH sides of each conflict',
      '3. Resolve conflicts by editing the files to merge changes intelligently:',
      '   - Remove conflict markers (<<<<<<<, =======, >>>>>>>)',
      '   - Combine changes when both sides added different things',
      '   - Use the most recent/complete version when changes overlap',
      '   - Preserve functionality from both branches',
      '4. After editing each file, verify it has no syntax errors',
      '',
      '**Important:**',
      '- Do NOT just pick one side - merge the changes thoughtfully',
      '- Ensure the resulting code compiles/runs correctly',
      '- Add git staging for each resolved file with `git add <file>`',
      '',
      'Resolve all conflicts now.'
    )

    return parts.join('\n')
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
   * Abort the merge agent execution.
   */
  abort(): void {
    console.log(`[FeatureMergeAgent ${this.state.featureId}] Aborting...`)
    this.isAborted = true

    // Interrupt the agent service stream
    const agentService = getAgentService()
    agentService.abort()
  }

  /**
   * Clean up resources.
   */
  async cleanup(): Promise<void> {
    // Set abort flag to stop any running execution
    this.abort()

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
