import type { Task } from '@shared/types/task'
import { HolderManager } from '../base-manager'

/**
 * VerifyingPausedManager holds tasks that were paused during QA verification.
 * Tasks here have stashed changes waiting to be resumed.
 * This is a holder - no processing, just storage until user resumes.
 */
export class VerifyingPausedManager extends HolderManager<Task> {
  readonly status = 'verifying_paused' as const
}
