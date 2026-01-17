/**
 * QA Agent for DAGent.
 * Performs autonomous code review against task specifications.
 * On pass: task transitions to merging
 * On fail: task transitions back to dev with feedback in task.qaFeedback
 */

import { EventEmitter } from 'events'
import type { QAAgentState, QAAgentStatus, QAReviewResult } from './qa-types'
import { DEFAULT_QA_AGENT_STATE } from './qa-types'
import type { FeatureSpec } from './feature-spec-types'
import { getAgentPool } from './agent-pool'
import { getAgentService } from '../agent'
import { RequestPriority } from '../agent/request-manager'
import { getSessionManager } from '../services/session-manager'

export class QAAgent extends EventEmitter {
  private state: QAAgentState
  private taskTitle: string = ''
  private taskDescription: string = ''
  private featureSpec: FeatureSpec | null = null

  constructor(featureId: string, taskId: string) {
    super()
    this.state = {
      ...DEFAULT_QA_AGENT_STATE,
      featureId,
      taskId
    }
  }

  /**
   * Set the session ID for SessionManager logging.
   * Called by orchestrator to link QA agent with the task's session.
   *
   * @param sessionId - Session ID for logging
   */
  setSessionId(sessionId: string): void {
    this.state.sessionId = sessionId
  }

  /**
   * Log a message to SessionManager.
   * No-op if sessionId is not set.
   *
   * @param role - Message role ('user' for input, 'assistant' for output)
   * @param content - Message content
   * @param metadata - Optional metadata for the message
   */
  private async logToSessionManager(
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.state.sessionId) {
      // No session - skip logging
      return
    }

    try {
      const sessionManager = getSessionManager()
      await sessionManager.addMessage(
        this.state.sessionId,
        this.state.featureId,
        {
          role,
          content,
          metadata: {
            ...metadata,
            agentId: this.state.agentId || undefined,
            taskId: this.state.taskId,
            agentType: 'qa',
            internal: true // Mark as internal so it doesn't show in chat UI
          }
        }
      )
    } catch (error) {
      console.error('[QAAgent] Failed to log to session:', error)
    }
  }

  /**
   * Initialize QA agent for reviewing a task.
   * @param taskTitle - Task title for context
   * @param taskDescription - Task description for spec comparison
   * @param worktreePath - Path to task worktree for code review
   * @param featureSpec - Optional feature specification for acceptance criteria validation
   */
  async initialize(
    taskTitle: string,
    taskDescription: string,
    worktreePath: string,
    featureSpec?: FeatureSpec
  ): Promise<boolean> {
    if (this.state.status !== 'initializing') {
      return false
    }

    this.state.startedAt = new Date().toISOString()
    this.taskTitle = taskTitle
    this.taskDescription = taskDescription
    this.state.worktreePath = worktreePath
    this.featureSpec = featureSpec || null
    this.state.featureSpec = featureSpec || null

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

    // Log review start to SessionManager
    await this.logToSessionManager('user', `Starting QA review for task: ${this.taskTitle}`, {
      reviewStart: true,
      worktreePath: this.state.worktreePath
    })

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
        // Log review passed to SessionManager
        await this.logToSessionManager('assistant', `QA review PASSED`, {
          reviewPassed: true,
          filesReviewed: result.filesReviewed
        })

        console.log(`[QAAgent ${this.state.taskId}] Review passed, committing changes...`)
        const commitResult = await this.commitChanges()

        if (commitResult.error) {
          // Commit failed - mark review as failed
          console.error(`[QAAgent ${this.state.taskId}] Commit failed: ${commitResult.error}`)
          result.passed = false
          result.feedback = `QA passed but commit failed: ${commitResult.error}`

          // Log commit failure to SessionManager
          await this.logToSessionManager('assistant', `Commit failed: ${commitResult.error}`, {
            commitFailed: true,
            error: commitResult.error
          })
        } else {
          result.commitHash = commitResult.commitHash
          result.filesChanged = commitResult.filesChanged
          console.log(`[QAAgent ${this.state.taskId}] Commit successful: ${commitResult.commitHash}`)

          // Log commit success to SessionManager
          await this.logToSessionManager('assistant', `Changes committed: ${commitResult.commitHash}`, {
            commitSuccess: true,
            commitHash: commitResult.commitHash,
            filesChanged: commitResult.filesChanged
          })
        }
      } else {
        // Log review failed to SessionManager
        await this.logToSessionManager('assistant', `QA review FAILED`, {
          reviewFailed: true,
          feedback: result.feedback,
          filesReviewed: result.filesReviewed
        })
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

      // Log error to SessionManager
      await this.logToSessionManager('assistant', `QA review error: ${errorMsg}`, {
        reviewError: true,
        error: errorMsg
      })

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
   * Includes feature spec acceptance criteria when available.
   */
  private buildReviewPrompt(): string {
    const parts: string[] = ['# Code Review Request', '']

    // Include feature spec if available
    if (this.featureSpec) {
      parts.push('## Feature Specification')
      parts.push(`**Feature:** ${this.featureSpec.featureName}`)
      parts.push('')

      if (this.featureSpec.goals.length > 0) {
        parts.push('### Goals')
        for (const goal of this.featureSpec.goals) {
          parts.push(`- ${goal}`)
        }
        parts.push('')
      }

      if (this.featureSpec.acceptanceCriteria.length > 0) {
        parts.push('### Acceptance Criteria')
        for (const ac of this.featureSpec.acceptanceCriteria) {
          const status = ac.passed ? '✓' : '○'
          parts.push(`- ${ac.id}: ${ac.description} [${status}]`)
        }
        parts.push('')
      }
    }

    // Task being reviewed
    parts.push('## Task Being Reviewed')
    parts.push(`**Title:** ${this.taskTitle}`)
    parts.push(`**Description:** ${this.taskDescription}`)
    parts.push('')

    // Review criteria - spec-aware when available
    parts.push('## Review Criteria')
    parts.push('1. Does the code implement what the task specified?')
    if (this.featureSpec && this.featureSpec.acceptanceCriteria.length > 0) {
      parts.push('2. Does the code satisfy the acceptance criteria listed above?')
      parts.push('3. Are there any obvious bugs or issues?')
      parts.push('4. Does the code follow reasonable patterns?')
    } else {
      parts.push('2. Are there any obvious bugs or issues?')
      parts.push('3. Does the code follow reasonable patterns?')
    }
    parts.push('')

    // Instructions
    parts.push('## Instructions')
    parts.push('Use `git diff` to see what changed in this worktree, then respond:')
    parts.push('- PASSED if code meets spec and has no obvious issues')
    parts.push('- FAILED with brief, actionable feedback if issues found')
    parts.push('')

    // Response format
    parts.push('## Response Format')
    parts.push('You MUST respond in exactly this format:')
    parts.push('')
    parts.push('QA_RESULT: [PASSED|FAILED]')
    parts.push('FILES_REVIEWED: [comma-separated list of files you reviewed]')
    if (this.featureSpec && this.featureSpec.acceptanceCriteria.length > 0) {
      parts.push(
        'CRITERIA_STATUS: [list which AC-XXX items pass/fail, e.g., "AC-001: PASS, AC-002: FAIL"]'
      )
    }
    parts.push('FEEDBACK: [only if FAILED - 1-3 bullet points of specific issues]')
    parts.push('')

    // Examples
    parts.push('## Example PASSED Response')
    parts.push('QA_RESULT: PASSED')
    parts.push('FILES_REVIEWED: src/utils/helper.ts, src/components/Button.tsx')
    if (this.featureSpec && this.featureSpec.acceptanceCriteria.length > 0) {
      parts.push('CRITERIA_STATUS: AC-001: PASS, AC-002: PASS')
    }
    parts.push('FEEDBACK: N/A')
    parts.push('')

    parts.push('## Example FAILED Response')
    parts.push('QA_RESULT: FAILED')
    parts.push('FILES_REVIEWED: src/api/client.ts')
    if (this.featureSpec && this.featureSpec.acceptanceCriteria.length > 0) {
      parts.push('CRITERIA_STATUS: AC-001: PASS, AC-002: FAIL')
    }
    parts.push('FEEDBACK:')
    parts.push('- Missing error handling in fetchData() - network errors will crash')
    if (this.featureSpec && this.featureSpec.acceptanceCriteria.length > 0) {
      parts.push('- AC-002 not satisfied: validation logic not implemented')
    } else {
      parts.push('- API endpoint URL is hardcoded, should use config')
    }

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
