import type { Task } from '@shared/types/task'
import { HolderManager } from '../base-manager'

/**
 * DevelopingPausedManager holds tasks that were paused during development.
 * Tasks here have stashed changes waiting to be resumed.
 * This is a holder - no processing, just storage until user resumes.
 */
export class DevelopingPausedManager extends HolderManager<Task> {
  readonly status = 'developing_paused' as const
}
