import type { Task } from '@shared/types'
import type { FeatureStatus } from '@shared/types/feature'

/**
 * Compute the feature status based on task states.
 *
 * Status rules (priority highest-to-lowest):
 * 1. Any task `failed` → `needs_attention`
 * 2. All tasks `completed` → `completed`
 * 3. Any task `dev`/`qa`/`merging` → `in_progress`
 * 4. Default (all `blocked`/`ready`) → `not_started`
 *
 * @param tasks - Array of tasks in the feature's DAG
 * @returns The computed feature status
 */
export function computeFeatureStatus(tasks: Task[]): FeatureStatus {
  // Edge case: empty tasks array
  if (tasks.length === 0) {
    return 'not_started'
  }

  // Rule 1: Any task failed → needs_attention
  if (tasks.some((task) => task.status === 'failed')) {
    return 'needs_attention'
  }

  // Rule 2: All tasks completed → completed
  if (tasks.every((task) => task.status === 'completed')) {
    return 'completed'
  }

  // Rule 3: Any task dev/qa/merging → in_progress
  if (tasks.some((task) => task.status === 'dev' || task.status === 'qa' || task.status === 'merging')) {
    return 'in_progress'
  }

  // Rule 4: Default (all blocked/ready) → not_started
  return 'not_started'
}
