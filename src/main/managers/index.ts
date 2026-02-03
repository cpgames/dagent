// Types
export type { IManageable, IManager, ProcessResult, ManagerConfig, ManagerEvents } from './types'
export type { TransitionRules } from '@shared/types/task'

// Base classes
export { BaseManager, HolderManager } from './base-manager'

// Router
export { Router, getRouter, resetRouter } from './router'
export type { RouterEvents } from './router'

// Transitions
export {
  type TaskStatus,
  type FeatureStatus,
  TASK_STATUS_LABELS,
  FEATURE_STATUS_LABELS,
  TASK_TRANSITIONS,
  FEATURE_TRANSITIONS,
  getNextTaskStatus,
  getNextFeatureStatus,
  isTaskTerminal,
  isFeatureTerminal,
  isTaskPaused,
  getActiveStatusFromPaused,
  getPausedStatusFromActive
} from './transitions'

// Task managers
export {
  AnalyzingManager,
  DevelopingManager,
  DevelopingPausedManager,
  VerifyingManager,
  VerifyingPausedManager,
  DoneTaskManager
} from './tasks'

// Feature managers are Neon, Cyber, Pulse (one per worktree)
// They are managed by FeatureManagerPool in git/worktree-pool-manager.ts
// Features don't use status-based managers like tasks do
