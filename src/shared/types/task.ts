export type TaskStatus = 'blocked' | 'ready' | 'dev' | 'qa' | 'merging' | 'completed' | 'failed';

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
}
