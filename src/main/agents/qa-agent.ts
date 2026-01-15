/**
 * QA Agent for DAGent.
 * Performs autonomous code review against task specifications.
 * On pass: task transitions to merging
 * On fail: task transitions back to dev with feedback in task.qaFeedback
 */

import { EventEmitter } from 'events'
import type { QAAgentState, QAAgentStatus, QAReviewResult } from './qa-types'
import { DEFAULT_QA_AGENT_STATE } from './qa-types'
import { getAgentPool } from './agent-pool'
import { getAgentService } from '../agent'
import { RequestPriority } from '../agent/request-manager'

export class QAAgent extends EventEmitter {
  private state: QAAgentState
  private taskTitle: string = ''
  private taskDescription: string = ''

  constructor(featureId: string, taskId: string) {
    super()
    this.state = {
      ...DEFAULT_QA_AGENT_STATE,
      featureId,
      taskId
    }
  }

  /**
   * Initialize QA agent for reviewing a task.
   * @param taskTitle - Task title for context
   * @param taskDescription - Task description for spec comparison
   * @param worktreePath - Path to task worktree for code review
   */
  async initialize(
    taskTitle: string,
    taskDescription: string,
    worktreePath: string
  ): Promise<boolean> {
    if (this.state.status !== 'initializing') {
      return false
    }

    this.state.startedAt = new Date().toISOString()
    this.taskTitle = taskTitle
    this.taskDescription = taskDescription
    this.state.worktreePath = worktreePath

    // Register with agent pool (QA has priority over dev)
    const pool = getAgentPool()
    if (!pool.canSpawn('qa')) {
      this.state.status = 'failed'
      this.state.error = 'Cannot spawn QA agent - pool limit reached'
      return false
    }

    const agentInfo = pool.registerAgent({
      type: 'qa',
      featureId: this.state.featureId,
      taskId: this.state.taskId
    })

    this.state.agentId = agentInfo.id
    pool.updateAgentStatus(agentInfo.id, 'busy', this.state.taskId)

    this.emit('qa-agent:initialized', this.getState())
    return true
  }

  /**
   * Execute code review.
   * Queries SDK to review code changes against task spec.
   */
  async execute(): Promise<QAReviewResult> {
    if (!this.state.worktreePath) {
      return {
        passed: false,
        feedback: 'No worktree path configured',
        filesReviewed: []
      }
    }

    // Check if worktree path exists
    const fs = await import('fs')
    if (!fs.existsSync(this.state.worktreePath)) {
      console.error(`[QAAgent ${this.state.taskId}] Worktree path does not exist: ${this.state.worktreePath}`)
      return {
        passed: false,
        feedback: `Worktree path does not exist: ${this.state.worktreePath}`,
        filesReviewed: []
      }
    }

    console.log(`[QAAgent ${this.state.taskId}] Worktree path exists: ${this.state.worktreePath}`)

    this.state.status = 'loading_context'
    this.emit('qa-agent:loading-context')

    try {
      // Build review prompt
      const prompt = this.buildReviewPrompt()

      this.state.status = 'reviewing'
      this.emit('qa-agent:reviewing')

      // Query SDK for code review
      const agentService = getAgentService()
      let responseText = ''
      let eventCount = 0

      console.log(`[QAAgent ${this.state.taskId}] Starting SDK stream...`)

      for await (const event of agentService.streamQuery({
        prompt,
        toolPreset: 'qaAgent',
        permissionMode: 'acceptEdits',
        cwd: this.state.worktreePath,
        agentType: 'qa',
        agentId: `qa-${this.state.taskId}`,
        taskId: this.state.taskId,
        priority: RequestPriority.QA
      })) {
        eventCount++

        // Log all events for debugging
        if (event.type === 'message') {
          console.log(`[QAAgent ${this.state.taskId}] Event ${eventCount}: type=${event.type}, msgType=${event.message?.type}`)
        } else if (event.type === 'error') {
          console.log(`[QAAgent ${this.state.taskId}] Event ${eventCount}: ERROR - ${event.error}`)
        }

        if (event.type === 'message' && event.message?.type === 'assistant') {
          responseText += event.message.content
        }
        if (event.type === 'message' && event.message?.type === 'result') {
          responseText = event.message.content
        }
      }

      console.log(`[QAAgent ${this.state.taskId}] Stream finished, ${eventCount} events received`)

      // Log response for debugging
      console.log(`[QAAgent ${this.state.taskId}] Raw response length: ${responseText.length}`)
      if (responseText.length < 500) {
        console.log(`[QAAgent ${this.state.taskId}] Response: ${responseText}`)
      } else {
        console.log(`[QAAgent ${this.state.taskId}] Response (truncated): ${responseText.substring(0, 500)}...`)
      }

      // Parse the review response
      const result = this.parseReviewResponse(responseText)

      // If review passed, commit the changes
      if (result.passed) {
        console.log(`[QAAgent ${this.state.taskId}] Review passed, committing changes...`)
        const commitResult = await this.commitChanges()

        if (commitResult.error) {
          // Commit failed - mark review as failed
          console.error(`[QAAgent ${this.state.taskId}] Commit failed: ${commitResult.error}`)
          result.passed = false
          result.feedback = `QA passed but commit failed: ${commitResult.error}`
        } else {
          result.commitHash = commitResult.commitHash
          result.filesChanged = commitResult.filesChanged
          console.log(`[QAAgent ${this.state.taskId}] Commit successful: ${commitResult.commitHash}`)
        }
      }

      this.state.reviewResult = result
      this.state.status = 'completed'
      this.state.completedAt = new Date().toISOString()

      this.emit('qa-agent:completed', result)
      return result
    } catch (error) {
      const errorMsg = (error as Error).message
      this.state.status = 'failed'
      this.state.error = errorMsg

      const result: QAReviewResult = {
        passed: false,
        feedback: `Review failed: ${errorMsg}`,
        filesReviewed: []
      }
      this.state.reviewResult = result

      this.emit('qa-agent:failed', errorMsg)
      return result
    }
  }

  /**
   * Build the code review prompt.
   */
  private buildReviewPrompt(): string {
    const parts: string[] = [
      '# Code Review Request',
      '',
      '## Task Specification',
      `**Title:** ${this.taskTitle}`,
      `**Description:** ${this.taskDescription}`,
      '',
      '## Your Review Criteria',
      '1. Does the code implement what the task specified?',
      '2. Are there any obvious bugs or issues?',
      '3. Does the code follow reasonable patterns?',
      '',
      '## Instructions',
      'Use `git diff` to see what changed in this worktree, then respond:',
      '- PASSED if code meets spec and has no obvious issues',
      '- FAILED with brief, actionable feedback if issues found',
      '',
      '## Response Format',
      'You MUST respond in exactly this format:',
      '',
      'QA_RESULT: [PASSED|FAILED]',
      'FILES_REVIEWED: [comma-separated list of files you reviewed]',
      'FEEDBACK: [only if FAILED - 1-3 bullet points of specific issues]',
      '',
      '## Example PASSED Response',
      'QA_RESULT: PASSED',
      'FILES_REVIEWED: src/utils/helper.ts, src/components/Button.tsx',
      'FEEDBACK: N/A',
      '',
      '## Example FAILED Response',
      'QA_RESULT: FAILED',
      'FILES_REVIEWED: src/api/client.ts',
      'FEEDBACK:',
      '- Missing error handling in fetchData() - network errors will crash',
      '- API endpoint URL is hardcoded, should use config'
    ]

    return parts.join('\n')
  }

  /**
   * Parse SDK response to extract review result.
   * Handles various response formats the agent might use.
   */
  private parseReviewResponse(response: string): QAReviewResult {
    // Handle empty response
    if (!response || response.trim().length === 0) {
      return {
        passed: false,
        feedback: 'QA review failed - no response received from agent',
        filesReviewed: []
      }
    }

    const upperResponse = response.toUpperCase()

    // Determine pass/fail - check multiple variations
    const passedPatterns = [
      'QA_RESULT: PASSED',
      'QA_RESULT:PASSED',
      'RESULT: PASSED',
      'REVIEW: PASSED',
      'STATUS: PASSED',
      '**PASSED**',
      'VERDICT: PASS',
      'LGTM', // Looks Good To Me
      'CODE LOOKS GOOD',
      'APPROVED'
    ]

    const failedPatterns = [
      'QA_RESULT: FAILED',
      'QA_RESULT:FAILED',
      'RESULT: FAILED',
      'REVIEW: FAILED',
      'STATUS: FAILED',
      '**FAILED**',
      'VERDICT: FAIL',
      'NEEDS CHANGES',
      'REJECTED'
    ]

    // Check for explicit pass
    const passed = passedPatterns.some((p) => upperResponse.includes(p)) &&
      !failedPatterns.some((p) => upperResponse.includes(p))

    // Extract files reviewed
    const filesMatch = response.match(/FILES_REVIEWED:\s*(.+?)(?=\n|FEEDBACK:|$)/is)
    const filesReviewed: string[] = []
    if (filesMatch) {
      const filesList = filesMatch[1].trim()
      if (filesList && filesList.toLowerCase() !== 'n/a') {
        filesReviewed.push(
          ...filesList.split(',').map((f) => f.trim()).filter((f) => f)
        )
      }
    }

    // Extract feedback if failed
    let feedback: string | undefined
    if (!passed) {
      // Try multiple patterns to extract feedback
      const feedbackPatterns = [
        /FEEDBACK:\s*([\s\S]*?)$/i,
        /ISSUES?:\s*([\s\S]*?)$/i,
        /PROBLEMS?:\s*([\s\S]*?)$/i,
        /CHANGES NEEDED:\s*([\s\S]*?)$/i
      ]

      for (const pattern of feedbackPatterns) {
        const match = response.match(pattern)
        if (match) {
          const feedbackText = match[1].trim()
          if (feedbackText && feedbackText.toLowerCase() !== 'n/a' && feedbackText.length > 5) {
            feedback = feedbackText
            break
          }
        }
      }

      // If no structured feedback, look for bullet points as feedback
      if (!feedback) {
        const bulletMatch = response.match(/(?:^|\n)\s*[-*]\s+(.+)/gm)
        if (bulletMatch && bulletMatch.length > 0) {
          feedback = bulletMatch.join('\n').trim()
        }
      }

      // If still no feedback, use last paragraph as feedback
      if (!feedback) {
        const paragraphs = response.split(/\n\n+/).filter((p) => p.trim().length > 10)
        if (paragraphs.length > 0) {
          feedback = paragraphs[paragraphs.length - 1].trim()
        }
      }

      // Final fallback with more context
      if (!feedback) {
        feedback = `QA review failed - response did not contain structured feedback. Response preview: "${response.substring(0, 200).replace(/\n/g, ' ')}..."`
      }
    }

    console.log(`[QAAgent] Parse result: passed=${passed}, filesReviewed=${filesReviewed.length}, hasFeedback=${!!feedback}`)

    return {
      passed,
      feedback,
      filesReviewed
    }
  }

  /**
   * Commit changes after successful QA review.
   * Uses the task worktree for committing.
   */
  private async commitChanges(): Promise<{ commitHash?: string; filesChanged?: number; error?: string }> {
    if (!this.state.worktreePath) {
      return { error: 'No worktree path' }
    }

    try {
      const { simpleGit } = await import('simple-git')
      const git = simpleGit({ baseDir: this.state.worktreePath })

      // Verify git repository
      const isRepo = await git.checkIsRepo()
      if (!isRepo) {
        return { error: 'Not a git repository' }
      }

      // Stage all changes
      await git.add('.')
      const status = await git.status()

      const stagedCount = status.staged.length + status.created.length
      const hasChanges = stagedCount > 0 || status.modified.length > 0 || status.not_added.length > 0

      if (!hasChanges) {
        console.log(`[QAAgent ${this.state.taskId}] No changes to commit`)
        return { filesChanged: 0 }
      }

      const filesChanged = stagedCount || status.modified.length + status.not_added.length

      // Commit with task info (QA-approved)
      const commitMessage = `feat(${this.state.taskId}): ${this.taskTitle}\n\nQA-approved`
      console.log(`[QAAgent ${this.state.taskId}] Committing ${filesChanged} files: ${commitMessage}`)

      const commitResult = await git.commit(commitMessage)
      console.log(`[QAAgent ${this.state.taskId}] Committed: ${commitResult.commit}`)

      return { commitHash: commitResult.commit, filesChanged }
    } catch (error) {
      const errorMsg = (error as Error).message
      console.error('[QAAgent] Failed to commit:', errorMsg)
      return { error: errorMsg }
    }
  }

  /**
   * Get current QA agent state.
   */
  getState(): QAAgentState {
    return { ...this.state }
  }

  /**
   * Get QA agent status.
   */
  getStatus(): QAAgentStatus {
    return this.state.status
  }

  /**
   * Clean up QA agent resources.
   */
  async cleanup(): Promise<void> {
    // Release from pool
    if (this.state.agentId) {
      const pool = getAgentPool()
      pool.terminateAgent(this.state.agentId)
    }

    this.emit('qa-agent:cleanup')
  }
}

// Factory for creating QA agents
export function createQAAgent(featureId: string, taskId: string): QAAgent {
  return new QAAgent(featureId, taskId)
}

// Active QA agents registry
const activeQAAgents: Map<string, QAAgent> = new Map()

export function registerQAAgent(agent: QAAgent): void {
  activeQAAgents.set(agent.getState().taskId, agent)
}

export function getQAAgent(taskId: string): QAAgent | undefined {
  return activeQAAgents.get(taskId)
}

export function removeQAAgent(taskId: string): boolean {
  return activeQAAgents.delete(taskId)
}

export function getAllQAAgents(): QAAgent[] {
  return Array.from(activeQAAgents.values())
}

export function clearQAAgents(): void {
  for (const agent of activeQAAgents.values()) {
    agent.cleanup()
  }
  activeQAAgents.clear()
}
