/**
 * Context module exports.
 * Provides ContextService for assembling comprehensive project context.
 */

export {
  ContextService,
  getContextService,
  initContextService,
  resetContextService
} from './context-service'

export type {
  ProjectStructure,
  GitCommit,
  ProjectContext,
  TaskContext,
  TaskDependencyInfo,
  ContextOptions,
  FullContext
} from './context-service'
