import type { Task } from '@shared/types/task';
import type { Connection } from '@shared/types/connection';
import type { DAGGraph } from '@shared/types/dag';

/**
 * Configuration for DAGManager instance.
 */
export interface DAGManagerConfig {
  /** Feature ID this manager operates on */
  featureId: string;

  /** Project root path for storage access */
  projectRoot: string;

  /** Whether to persist changes automatically */
  autoSave?: boolean;
}

/**
 * Event: Node added to graph.
 */
export interface NodeAddedEvent {
  type: 'node-added';
  node: Task;
}

/**
 * Event: Node removed from graph.
 */
export interface NodeRemovedEvent {
  type: 'node-removed';
  nodeId: string;
}

/**
 * Event: Connection added to graph.
 */
export interface ConnectionAddedEvent {
  type: 'connection-added';
  connection: Connection;
}

/**
 * Event: Connection removed from graph.
 */
export interface ConnectionRemovedEvent {
  type: 'connection-removed';
  connectionId: string;
}

/**
 * Event: Node position updated.
 */
export interface NodeMovedEvent {
  type: 'node-moved';
  nodeId: string;
  position: { x: number; y: number };
}

/**
 * Event: Graph reset/replaced entirely.
 */
export interface GraphResetEvent {
  type: 'graph-reset';
  graph: DAGGraph;
}

/**
 * Union type of all DAG events.
 */
export type DAGEvent =
  | NodeAddedEvent
  | NodeRemovedEvent
  | ConnectionAddedEvent
  | ConnectionRemovedEvent
  | NodeMovedEvent
  | GraphResetEvent;
