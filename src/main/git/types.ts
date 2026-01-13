/**
 * Git manager types for DAGent.
 * Follows DAGENT_SPEC section 8 for Git Integration.
 */

import * as path from 'path'

export interface GitManagerConfig {
  baseDir: string // Project root directory
  worktreesDir: string // .dagent-worktrees directory path
}

export interface WorktreeInfo {
  path: string // Absolute path to worktree
  branch: string // Branch name
  head: string // Current commit hash
  isDetached: boolean // Whether HEAD is detached
  isLocked: boolean // Whether worktree is locked
  prunable: boolean // Whether worktree can be pruned
}

export interface CreateWorktreeOptions {
  branch?: string // Branch to checkout (creates if doesn't exist)
  newBranch?: boolean // Create new branch
  detach?: boolean // Detached HEAD
  force?: boolean // Force creation even if branch exists elsewhere
}

export interface FeatureWorktreeResult extends GitOperationResult {
  worktreePath?: string // Path to created worktree
  branchName?: string // Name of feature branch
  dagentPath?: string // Path to .dagent directory
}

export interface TaskWorktreeResult extends GitOperationResult {
  worktreePath?: string // Path to created worktree
  branchName?: string // Name of task branch
}

export interface BranchInfo {
  name: string
  current: boolean
  commit: string
  label: string
}

export interface GitOperationResult {
  success: boolean
  error?: string
  data?: unknown
}

// Branch naming per DAGENT_SPEC section 8.1
export function getFeatureBranchName(featureId: string): string {
  // feature-car -> feature/car
  const cleanId = featureId.replace(/^feature-/, '')
  return `feature/${cleanId}`
}

export function getTaskBranchName(featureId: string, taskId: string): string {
  // feature/car/task-2145
  const featureBranch = getFeatureBranchName(featureId)
  return `${featureBranch}/task-${taskId}`
}

// Worktree directory naming per DAGENT_SPEC section 8.2
export function getFeatureWorktreeName(featureId: string): string {
  // feature-car
  return featureId
}

export function getTaskWorktreeName(featureId: string, taskId: string): string {
  // feature-car--task-2145
  return `${featureId}--task-${taskId}`
}

// Path helper functions
export function getWorktreePath(worktreesDir: string, worktreeName: string): string {
  return path.join(worktreesDir, worktreeName)
}

export function getDagentDirInWorktree(worktreePath: string): string {
  return path.join(worktreePath, '.dagent')
}
