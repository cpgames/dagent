import type { Task, Connection, DAGGraph, TaskStatus } from '@shared/types'

// Result of topological sort
export interface TopologicalResult {
  sorted: string[] // Task IDs in execution order
  hasCycle: boolean // True if cycle detected
  cycleNodes?: string[] // Nodes involved in cycle (if any)
}

// Dependency information for a task
export interface TaskDependencies {
  taskId: string
  dependsOn: string[] // Task IDs this task depends on
  blockedBy: string[] // Task IDs currently blocking (incomplete dependencies)
  dependents: string[] // Task IDs that depend on this task
}

// Analysis of entire DAG
export interface DAGAnalysis {
  topologicalOrder: TopologicalResult
  taskDependencies: Map<string, TaskDependencies>
  readyTasks: string[] // Tasks with all dependencies completed
  blockedTasks: string[] // Tasks waiting on dependencies
  completedTasks: string[] // Tasks already completed
  runningTasks: string[] // Tasks currently running/merging
}

// Serialized version of DAGAnalysis for IPC (Map converted to object)
export interface DAGAnalysisSerialized {
  topologicalOrder: TopologicalResult
  taskDependencies: Record<string, TaskDependencies>
  readyTasks: string[]
  blockedTasks: string[]
  completedTasks: string[]
  runningTasks: string[]
}

// Re-export for convenience
export type { Task, Connection, DAGGraph, TaskStatus }
