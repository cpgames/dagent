export type TaskStatus =
  | 'blocked'           // Waiting on dependencies
  | 'ready_for_dev'     // Ready for dev agent assignment
  | 'in_progress'       // Being worked on (dev, qa, or merge)
  | 'ready_for_qa'      // Dev complete, ready for QA review
  | 'ready_for_merge'   // QA passed, ready for merge
  | 'completed'         // Done
  | 'failed';           // Error state

/**
 * Human-readable labels for task statuses.
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  blocked: 'Blocked',
  ready_for_dev: 'Ready for dev',
  in_progress: 'In progress',
  ready_for_qa: 'Ready for QA',
  ready_for_merge: 'Ready for merge',
  completed: 'Completed',
  failed: 'Failed'
};

/**
 * Get human-readable label for a task status.
 */
export function getTaskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status] || status;
}

export interface TaskPosition {
  x: number;
  y: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  locked: boolean;
  position: TaskPosition;
  qaFeedback?: string; // Feedback from QA agent when task fails QA
  assignedAgentId?: string; // ID of agent currently working on this task
}
