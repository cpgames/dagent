import { EventEmitter } from 'events'
import type { TaskMergeResult } from '../git/types'
import type { MergeAgentState, MergeAgentStatus } from './merge-types'
import { DEFAULT_MERGE_AGENT_STATE } from './merge-types'
import type { IntentionDecision } from './harness-types'
import { getAgentPool } from './agent-pool'
import { getHarnessAgent } from './harness-agent'
import {
  getGitManager,
  getFeatureBranchName,
  getTaskBranchName,
  getFeatureWorktreeName,
  getTaskWorktreeName
} from '../git'
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

    // Set up worktree paths
    const gitManager = getGitManager()
    const config = gitManager.getConfig()
    this.state.featureWorktreePath = path.join(
      config.worktreesDir,
      getFeatureWorktreeName(this.state.featureId)
    )
    this.state.taskWorktreePath = path.join(
      config.worktreesDir,
      getTaskWorktreeName(this.state.featureId, this.state.taskId)
    )

    // Notify harness about merge starting
    const harness = getHarnessAgent()
    harness.markTaskMerging(this.state.taskId)

    this.emit('merge-agent:initialized', this.getState())
    return true
  }

  /**
   * Check branches and detect potential conflicts.
   */
  async checkBranches(): Promise<boolean> {
    this.state.status = 'checking_branches'

    try {
      const gitManager = getGitManager()

      // Verify worktrees exist
      const featureWorktree = await gitManager.getWorktree(this.state.featureWorktreePath!)
      const taskWorktree = await gitManager.getWorktree(this.state.taskWorktreePath!)

      if (!featureWorktree) {
        this.state.error = 'Feature worktree not found'
        this.state.status = 'failed'
        return false
      }

      if (!taskWorktree) {
        this.state.error = 'Task worktree not found'
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
    let intentionText: string

    if (hasConflicts) {
      intentionText =
        `INTENTION: Merge task branch with conflict resolution\n` +
        `Task: ${this.state.taskId}\n` +
        `Branch: ${this.state.taskBranch} -> ${this.state.featureBranch}\n` +
        `Conflicts detected in ${this.state.conflicts.length} files:\n` +
        this.state.conflicts.map((c) => `  - ${c.file} (${c.type})`).join('\n') +
        `\nWill resolve conflicts with harness guidance.`
    } else {
      intentionText =
        `INTENTION: Clean merge of task branch\n` +
        `Task: ${this.state.taskId}\n` +
        `Branch: ${this.state.taskBranch} -> ${this.state.featureBranch}\n` +
        `No conflicts detected. Proceeding with merge.`
    }

    this.state.intention = intentionText

    // Send to harness
    const harness = getHarnessAgent()
    harness.receiveIntention(this.state.agentId!, this.state.taskId, intentionText)

    this.state.status = 'awaiting_approval'
    this.emit('merge-agent:intention-proposed', intentionText)

    return true
  }

  /**
   * Receive approval decision from harness.
   */
  receiveApproval(decision: IntentionDecision): void {
    if (this.state.status !== 'awaiting_approval') {
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

        // Notify harness of completion
        const harness = getHarnessAgent()
        harness.completeTask(this.state.taskId)

        this.emit('merge-agent:completed', result)
      } else if (result.conflicts && result.conflicts.length > 0) {
        // Conflicts detected during merge
        this.state.status = 'resolving_conflicts'
        this.state.conflicts = result.conflicts
        this.emit('merge-agent:conflicts', result.conflicts)
      } else {
        this.state.status = 'failed'
        this.state.error = result.error || 'Merge failed'

        // Notify harness of failure
        const harness = getHarnessAgent()
        harness.failTask(this.state.taskId, this.state.error)

        this.emit('merge-agent:failed', result)
      }

      return result
    } catch (error) {
      const errorMsg = (error as Error).message
      this.state.status = 'failed'
      this.state.error = errorMsg

      // Notify harness of failure
      const harness = getHarnessAgent()
      harness.failTask(this.state.taskId, errorMsg)

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
