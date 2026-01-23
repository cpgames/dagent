import type { Task } from '@shared/types'
import type { FeatureStatus } from '@shared/types/feature'

/**
 * Compute the feature status based on task states.
 *
 * Status rules (priority highest-to-lowest):
 * 1. Any task `failed` → `developing` (needs attention, user can see failure in UI)
 * 2. All tasks `completed` → `needs_merging`
 * 3. Any task `ready_for_qa`/`ready_for_merge` → `verifying` (QA in progress)
 * 4. Any task `in_progress` → `developing` (dev in progress)
 * 5. Any task `ready_for_dev` (with at least one progressed task) → `developing`
 *    This handles QA failure case where task goes back to ready_for_dev
 * 6. Default (all `blocked`/`needs_analysis`) → `planning`
 *
 * @param tasks - Array of tasks in the feature's DAG
 * @returns The computed feature status
 */
export function computeFeatureStatus(tasks: Task[]): FeatureStatus {
  // Edge case: empty tasks array
  if (tasks.length === 0) {
    return 'planning'
  }

  // Rule 1: Any task failed → developing (needs attention, user can see failure in UI)
  if (tasks.some((task) => task.status === 'failed')) {
    return 'developing'
  }

  // Rule 2: All tasks completed → needs_merging
  if (tasks.every((task) => task.status === 'completed')) {
    return 'needs_merging'
  }

  // Rule 3: Any task ready_for_qa/ready_for_merge → verifying (QA in progress)
  if (tasks.some((task) => task.status === 'ready_for_qa' || task.status === 'ready_for_merge')) {
    return 'verifying'
  }

  // Rule 4: Any task in_progress → developing
  if (tasks.some((task) => task.status === 'in_progress')) {
    return 'developing'
  }

  // Rule 5: Any task ready_for_dev (and at least one task has progressed past needs_analysis)
  // This handles QA failure case where task returns to ready_for_dev for rework
  const hasReadyTask = tasks.some((task) => task.status === 'ready_for_dev')
  const hasProgressedTask = tasks.some((task) =>
    task.status === 'completed' || task.status === 'ready_for_dev'
  )
  if (hasReadyTask && hasProgressedTask) {
    return 'developing'
  }

  // Rule 6: Default (all blocked/needs_analysis) → planning
  return 'planning'
}
