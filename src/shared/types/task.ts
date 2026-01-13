export type TaskStatus = 'blocked' | 'ready' | 'running' | 'merging' | 'completed' | 'failed';

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
}
