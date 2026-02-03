import type { Task } from '@shared/types/task'
import { HolderManager } from '../base-manager'

/**
 * DoneTaskManager holds completed tasks.
 * This is a terminal state - tasks don't process here.
 */
export class DoneTaskManager extends HolderManager<Task> {
  readonly status = 'done' as const
}
