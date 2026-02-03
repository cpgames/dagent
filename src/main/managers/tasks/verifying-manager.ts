import type { Task } from '@shared/types/task'
import type { ProcessResult } from '../types'
import { BaseManager } from '../base-manager'

/**
 * VerifyingManager handles tasks in the 'verifying' status.
 * QA agent verifies task implementation against acceptance criteria.
 *
 * Processing flow:
 * 1. Pick up task from queue (skips blocked)
 * 2. Run QA agent to verify implementation
 * 3. On success (QA pass): task moves to completed (Router transitions to 'archived')
 * 4. On failure (QA fail): task moves to failed (Router transitions to 'developing')
 */
export class VerifyingManager extends BaseManager<Task> {
  readonly status = 'verifying' as const

  /**
   * Process a task - run QA agent verification.
   */
  protected async process(task: Task, signal: AbortSignal): Promise<ProcessResult> {
    // TODO: Wire up actual QA agent
    // For now, return success to allow testing the flow

    // Check for abort
    if (signal.aborted) {
      return { success: false, error: 'Aborted' }
    }

    try {
      // Placeholder - actual implementation will:
      // 1. Get or create QA agent session
      // 2. Build verification prompt with task context and acceptance criteria
      // 3. Run QA agent
      // 4. Track iterations (qaIterations++)
      // 5. Store qaFeedback if failed
      // 6. Return success/failure

      console.log(`[VerifyingManager] Verifying task: ${task.id} - ${task.title}`)

      // Increment QA iterations
      task.qaIterations = (task.qaIterations || 0) + 1

      // Simulate some work
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 100)
        signal.addEventListener('abort', () => {
          clearTimeout(timeout)
          reject(new Error('Aborted'))
        })
      })

      return { success: true }
    } catch (error) {
      if (signal.aborted) {
        return { success: false, error: 'Aborted' }
      }
      // Store QA feedback for next dev iteration
      task.qaFeedback = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        error: task.qaFeedback
      }
    }
  }
}
