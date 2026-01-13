import type { DAGGraph } from './dag';

export interface DAGVersion {
  version: number;
  timestamp: string;
  graph: DAGGraph;
  description?: string; // Optional description of change
}

export interface DAGHistory {
  versions: DAGVersion[];
  currentIndex: number; // Index into versions array
  maxVersions: number; // Cap at 20
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  currentVersion: number;
  totalVersions: number;
}
