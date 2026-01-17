import { EventEmitter } from 'events'
import type { TaskMergeResult, MergeConflict } from '../git/types'
import type { MergeAgentState, MergeAgentStatus, ConflictAnalysis } from './merge-types'
import { DEFAULT_MERGE_AGENT_STATE } from './merge-types'
import type { IntentionDecision } from './harness-types'
import { getAgentPool } from './agent-pool'
import {
  getGitManager,
  getFeatureBranchName,
  getTaskBranchName,
  getTaskWorktreeName
} from '../git'
import { getAgentService } from '../agent'
import { RequestPriority } from '../agent/request-types'
import { getFeatureStore } from '../ipc/storage-handlers'
import * as path from 'path'

export class MergeAgent extends EventEmitter {
  private state: MergeAgentState

  constructor(featureId: string, taskId: string) {
    super()
    this.state = {
      ...DEFAULT_MERGE_AGENT_STATE,
      featureId,
      taskId
    }
  }

  /**
   * Initialize merge agent for a task.
   * @param _taskTitle - Task title (reserved for future logging/UI purposes)
   */
  async initialize(_taskTitle: string): Promise<boolean> {
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
      featureId: this.state.featureId,
      taskId: this.state.taskId
    })

    this.state.agentId = agentInfo.id
    pool.updateAgentStatus(agentInfo.id, 'busy', this.state.taskId)

    // Set up branch names
    this.state.featureBranch = getFeatureBranchName(this.state.featureId)
    this.state.taskBranch = getTaskBranchName(this.state.featureId, this.state.taskId)

    // Set up task worktree path (no feature worktree needed - merge happens in task worktree)
    const gitManager = getGitManager()
    const config = gitManager.getConfig()
    this.state.taskWorktreePath = path.join(
      config.worktreesDir,
      getTaskWorktreeName(this.state.featureId, this.state.taskId)
    )

    // MergeAgent is autonomous - no harness notification needed
    // Orchestrator tracks merge state via task status and events

    this.emit('merge-agent:initialized', this.getState())
    return true
  }

  /**
   * Check branches and detect potential conflicts.
   * Only requires task worktree to exist (no feature worktree needed).
   */
  async checkBranches(): Promise<boolean> {
    this.state.status = 'checking_branches'

    try {
      const gitManager = getGitManager()

      // Verify task worktree exists (feature worktree not needed - merge happens in task worktree)
      const taskWorktree = await gitManager.getWorktree(this.state.taskWorktreePath!)

      if (!taskWorktree) {
        this.state.error = 'Task worktree not found'
        this.state.status = 'failed'
        return false
      }

      // Verify feature branch exists
      const featureBranchExists = await gitManager.branchExists(this.state.featureBranch!)
      if (!featureBranchExists) {
        this.state.error = `Feature branch ${this.state.featureBranch} not found`
        this.state.status = 'failed'
        return false
      }

      // Get diff summary to understand changes
      const diffSummary = await gitManager.getDiffSummary(
        this.state.featureBranch!,
        this.state.taskBranch!
      )

      this.emit('merge-agent:branches-checked', {
        filesChanged: diffSummary.files,
        insertions: diffSummary.insertions,
        deletions: diffSummary.deletions
      })

      return true
    } catch (error) {
      this.state.error = (error as Error).message
      this.state.status = 'failed'
      return false
    }
  }

  /**
   * Propose merge intention to harness.
   */
  async proposeIntention(): Promise<boolean> {
    this.state.status = 'proposing_intention'

    // Build intention based on conflict status
    const hasConflicts = this.state.conflicts.length > 0
    const analysis = this.state.conflictAnalysis
    let intentionText: string

    if (hasConflicts) {
      intentionText =
        `INTENTION: Merge task branch with conflict resolution\n` +
        `Task: ${this.state.taskId}\n` +
        `Branch: ${this.state.taskBranch} -> ${this.state.featureBranch}\n` +
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
        intentionText += `\nWill resolve conflicts with harness guidance.`
      }
    } else {
      intentionText =
        `INTENTION: Clean merge of task branch\n` +
        `Task: ${this.state.taskId}\n` +
        `Branch: ${this.state.taskBranch} -> ${this.state.featureBranch}\n` +
        `No conflicts detected. Proceeding with merge.`
    }

    this.state.intention = intentionText

    // MergeAgent is autonomous - emit event instead of harness call
    // Orchestrator auto-approves merges via receiveApproval()

    this.state.status = 'awaiting_approval'
    this.emit('merge-agent:intention-proposed', intentionText)

    return true
  }

  /**
   * Receive approval decision from harness.
   * Can be called after checkBranches() for auto-approval without intention phase,
   * or after proposeIntention() for full approval workflow.
   */
  receiveApproval(decision: IntentionDecision): void {
    // Allow approval after branch check (auto-approve) or after intention proposal
    if (this.state.status !== 'awaiting_approval' && this.state.status !== 'checking_branches') {
      console.warn(`[MergeAgent] receiveApproval called in unexpected state: ${this.state.status}`)
      return
    }

    this.state.approval = decision

    if (decision.approved) {
      this.emit('merge-agent:approved', decision)
    } else {
      this.state.status = 'failed'
      this.state.error = decision.reason || 'Merge intention rejected'
      this.emit('merge-agent:rejected', decision)
    }
  }

  /**
   * Execute the merge operation.
   */
  async executeMerge(): Promise<TaskMergeResult> {
    if (!this.state.approval?.approved) {
      return {
        success: false,
        merged: false,
        worktreeRemoved: false,
        branchDeleted: false,
        error: 'Merge not approved'
      }
    }

    this.state.status = 'merging'
    this.emit('merge-agent:merging')

    try {
      const gitManager = getGitManager()

      // Perform the merge using GitManager
      const result = await gitManager.mergeTaskIntoFeature(
        this.state.featureId,
        this.state.taskId,
        true // Remove worktree on success
      )

      this.state.mergeResult = result

      if (result.success && result.merged) {
        this.state.status = 'completed'
        this.state.completedAt = new Date().toISOString()

        // Check if all tasks in the feature are now complete
        await this.checkAndArchiveFeature()

        // MergeAgent is autonomous - emit event for orchestrator
        // Orchestrator handles task status transition and cascade

        this.emit('merge-agent:completed', result)
      } else if (result.conflicts && result.conflicts.length > 0) {
        // Conflicts detected during merge
        this.state.status = 'resolving_conflicts'
        this.state.conflicts = result.conflicts

        // Analyze conflicts using SDK
        const analysis = await this.analyzeConflicts(result.conflicts)
        if (analysis) {
          this.state.conflictAnalysis = analysis
          this.emit('merge-agent:analysis', analysis)
        }

        this.emit('merge-agent:conflicts', result.conflicts)
      } else {
        this.state.status = 'failed'
        this.state.error = result.error || 'Merge failed'

        // MergeAgent is autonomous - emit event for orchestrator
        // Orchestrator handles task status transition

        this.emit('merge-agent:failed', result)
      }

      return result
    } catch (error) {
      const errorMsg = (error as Error).message
      this.state.status = 'failed'
      this.state.error = errorMsg

      // MergeAgent is autonomous - emit event for orchestrator
      // Orchestrator handles task status transition

      const result: TaskMergeResult = {
        success: false,
        merged: false,
        worktreeRemoved: false,
        branchDeleted: false,
        error: errorMsg
      }

      this.emit('merge-agent:failed', result)
      return result
    }
  }

  /**
   * Abort the merge operation.
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
   * Analyze conflicts using Claude Agent SDK for intelligent resolution suggestions.
   */
  async analyzeConflicts(conflicts: MergeConflict[]): Promise<ConflictAnalysis | null> {
    if (!this.state.taskWorktreePath || conflicts.length === 0) {
      return null
    }

    try {
      const agentService = getAgentService()
      const prompt = this.buildConflictAnalysisPrompt(conflicts)
      let responseText = ''

      for await (const event of agentService.streamQuery({
        prompt,
        toolPreset: 'mergeAgent',
        permissionMode: 'acceptEdits',
        cwd: this.state.taskWorktreePath,
        agentType: 'merge',
        agentId: `merge-${this.state.taskId}`,
        taskId: this.state.taskId,
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
      console.error('Conflict analysis failed:', error)
      return null
    }
  }

  /**
   * Build prompt for conflict analysis.
   */
  private buildConflictAnalysisPrompt(conflicts: MergeConflict[]): string {
    const parts: string[] = [
      '# Merge Conflict Analysis Request',
      '',
      '## Context',
      `Task branch: ${this.state.taskBranch}`,
      `Feature branch: ${this.state.featureBranch}`,
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
    const recommendationMatch = response.match(/RECOMMENDATION:\s*(.+?)(?=\n|FILE:|SUGGESTIONS:|$)/is)
    const recommendation = recommendationMatch?.[1]?.trim() || 'Manual review required'

    // Parse file analyses
    const conflictDetails: ConflictAnalysis['conflictDetails'] = []
    const filePattern = /FILE:\s*(.+?)\nANALYSIS:\s*(.+?)\nRESOLUTION:\s*(ours|theirs|both|manual)/gis

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
   * Get current merge agent state.
   */
  getState(): MergeAgentState {
    return { ...this.state }
  }

  /**
   * Get merge agent status.
   */
  getStatus(): MergeAgentStatus {
    return this.state.status
  }

  /**
   * Check if all tasks in the feature are complete, and if so, archive the feature.
   * Called after successful task merge to detect when the entire feature is done.
   */
  private async checkAndArchiveFeature(): Promise<void> {
    try {
      const featureStore = getFeatureStore()
      if (!featureStore) {
        console.warn('[MergeAgent] Cannot check feature completion - FeatureStore not available')
        return
      }

      // Load the feature's DAG
      const dag = await featureStore.loadDag(this.state.featureId)
      if (!dag) {
        console.warn(`[MergeAgent] Cannot check feature completion - DAG not found for feature ${this.state.featureId}`)
        return
      }

      // Check if all tasks are completed
      const allTasksComplete = dag.nodes.every(task => task.status === 'completed')

      if (allTasksComplete) {
        console.log(`[MergeAgent] All tasks complete for feature ${this.state.featureId} - updating to completed status`)

        // Load feature and update status to completed
        // Note: We transition to 'completed' here, not 'archived'
        // The feature will be archived later when merged to main (Phase 99 Task 2)
        const feature = await featureStore.loadFeature(this.state.featureId)
        if (feature && feature.status !== 'completed') {
          feature.status = 'completed'
          feature.updatedAt = new Date().toISOString()
          await featureStore.saveFeature(feature)
          console.log(`[MergeAgent] Feature ${this.state.featureId} transitioned to completed`)
        }
      }
    } catch (error) {
      console.error('[MergeAgent] Error checking feature completion:', error)
      // Don't fail the merge if status update fails
    }
  }

  /**
   * Clean up merge agent resources.
   */
  async cleanup(): Promise<void> {
    // Release from pool
    if (this.state.agentId) {
      const pool = getAgentPool()
      pool.terminateAgent(this.state.agentId)
    }

    this.emit('merge-agent:cleanup')
  }
}

// Factory for creating merge agents
export function createMergeAgent(featureId: string, taskId: string): MergeAgent {
  return new MergeAgent(featureId, taskId)
}

// Active merge agents registry
const activeMergeAgents: Map<string, MergeAgent> = new Map()

export function registerMergeAgent(agent: MergeAgent): void {
  activeMergeAgents.set(agent.getState().taskId, agent)
}

export function getMergeAgent(taskId: string): MergeAgent | undefined {
  return activeMergeAgents.get(taskId)
}

export function removeMergeAgent(taskId: string): boolean {
  return activeMergeAgents.delete(taskId)
}

export function getAllMergeAgents(): MergeAgent[] {
  return Array.from(activeMergeAgents.values())
}

export function clearMergeAgents(): void {
  for (const agent of activeMergeAgents.values()) {
    agent.cleanup()
  }
  activeMergeAgents.clear()
}
