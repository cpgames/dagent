import type { Task } from './task';
import type { Connection } from './connection';

export interface DAGGraph {
  nodes: Task[];
  connections: Connection[];
}
