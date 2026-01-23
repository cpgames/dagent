import path from 'path';
import { promises as fs } from 'fs';

/**
 * Path utilities for .dagent storage structure.
 *
 * Features have two storage locations:
 * 1. Pending features (status: not_started): .dagent/features/{featureId}/
 * 2. Active features (in manager worktree): .dagent-worktrees/{managerName}/.dagent/features/{featureId}/
 *
 * Manager worktrees are named: neon, cyber, pulse (pool of 3)
 */

// ============================================================================
// Worktree Directory
// ============================================================================

/**
 * Get the root directory for all manager worktrees.
 * Location: {projectRoot}/.dagent-worktrees/
 */
export function getWorktreesDir(projectRoot: string): string {
  return path.join(projectRoot, '.dagent-worktrees');
}

// ============================================================================
// Active Feature Paths (in manager worktrees)
// ============================================================================

/**
 * Get the .dagent directory for a specific feature inside a manager worktree.
 * Location: {managerWorktreePath}/.dagent/features/{featureId}/
 *
 * @param managerWorktreePath - The full path to the manager worktree (e.g., .dagent-worktrees/neon)
 * @param featureId - The feature ID
 */
export function getFeatureDirInWorktree(managerWorktreePath: string, featureId: string): string {
  return path.join(managerWorktreePath, '.dagent', 'features', featureId);
}

/**
 * Get the path to feature.json inside a manager worktree.
 */
export function getFeaturePathInWorktree(managerWorktreePath: string, featureId: string): string {
  return path.join(getFeatureDirInWorktree(managerWorktreePath, featureId), 'feature.json');
}

/**
 * Get the path to dag.json inside a manager worktree.
 */
export function getDagPathInWorktree(managerWorktreePath: string, featureId: string): string {
  return path.join(getFeatureDirInWorktree(managerWorktreePath, featureId), 'dag.json');
}

/**
 * Get the path to feature-spec.md inside a manager worktree.
 */
export function getFeatureSpecPathInWorktree(managerWorktreePath: string, featureId: string): string {
  return path.join(getFeatureDirInWorktree(managerWorktreePath, featureId), 'feature-spec.md');
}

/**
 * Get the attachments directory inside a manager worktree.
 */
export function getAttachmentsDirInWorktree(managerWorktreePath: string, featureId: string): string {
  return path.join(getFeatureDirInWorktree(managerWorktreePath, featureId), 'attachments');
}

/**
 * Get the nodes directory inside a manager worktree.
 */
export function getNodeDirInWorktree(managerWorktreePath: string, featureId: string, nodeId: string): string {
  return path.join(getFeatureDirInWorktree(managerWorktreePath, featureId), 'nodes', nodeId);
}

/**
 * Get the path to chat.json for a specific feature inside a manager worktree.
 */
export function getChatPathInWorktree(managerWorktreePath: string, featureId: string): string {
  return path.join(getFeatureDirInWorktree(managerWorktreePath, featureId), 'chat.json');
}

/**
 * Get the path to harness_log.json inside a manager worktree.
 */
export function getHarnessLogPathInWorktree(managerWorktreePath: string, featureId: string): string {
  return path.join(getFeatureDirInWorktree(managerWorktreePath, featureId), 'harness_log.json');
}

/**
 * Get the path to chat.json for a specific node inside a manager worktree.
 */
export function getNodeChatPathInWorktree(managerWorktreePath: string, featureId: string, nodeId: string): string {
  return path.join(getNodeDirInWorktree(managerWorktreePath, featureId, nodeId), 'chat.json');
}

/**
 * Get the path to logs.json for a specific node inside a manager worktree.
 */
export function getNodeLogsPathInWorktree(managerWorktreePath: string, featureId: string, nodeId: string): string {
  return path.join(getNodeDirInWorktree(managerWorktreePath, featureId, nodeId), 'logs.json');
}

/**
 * Get the path to session.json for a specific task inside a manager worktree.
 */
export function getTaskSessionPathInWorktree(managerWorktreePath: string, featureId: string, taskId: string): string {
  return path.join(getNodeDirInWorktree(managerWorktreePath, featureId, taskId), 'session.json');
}

/**
 * Get the path to plan.json for a specific task inside a manager worktree.
 */
export function getTaskPlanPathInWorktree(managerWorktreePath: string, featureId: string, taskId: string): string {
  return path.join(getNodeDirInWorktree(managerWorktreePath, featureId, taskId), 'plan.json');
}

/**
 * Get the sessions directory inside a manager worktree.
 * Location: {managerWorktreePath}/.dagent/features/{featureId}/sessions/
 */
export function getSessionsDirInWorktree(managerWorktreePath: string, featureId: string): string {
  return path.join(getFeatureDirInWorktree(managerWorktreePath, featureId), 'sessions');
}

// ============================================================================
// Pending Feature Paths (for features without worktrees, status: not_started)
// ============================================================================

/**
 * Get the root directory for all pending features.
 * Location: {projectRoot}/.dagent/features/
 */
export function getPendingFeaturesDir(projectRoot: string): string {
  return path.join(projectRoot, '.dagent', 'features');
}

/**
 * Get the directory for a specific pending feature.
 * Location: {projectRoot}/.dagent/features/{featureId}/
 */
export function getPendingFeatureDir(projectRoot: string, featureId: string): string {
  return path.join(getPendingFeaturesDir(projectRoot), featureId);
}

/**
 * Get the path to feature.json for a pending feature.
 * Location: {projectRoot}/.dagent/features/{featureId}/feature.json
 */
export function getPendingFeaturePath(projectRoot: string, featureId: string): string {
  return path.join(getPendingFeatureDir(projectRoot, featureId), 'feature.json');
}

/**
 * Get the path to dag.json for a pending feature.
 * Location: {projectRoot}/.dagent/features/{featureId}/dag.json
 */
export function getPendingDagPath(projectRoot: string, featureId: string): string {
  return path.join(getPendingFeatureDir(projectRoot, featureId), 'dag.json');
}

/**
 * Get the attachments directory for a pending feature.
 * Location: {projectRoot}/.dagent/features/{featureId}/attachments/
 */
export function getPendingAttachmentsDir(projectRoot: string, featureId: string): string {
  return path.join(getPendingFeatureDir(projectRoot, featureId), 'attachments');
}

/**
 * Get the sessions directory for a pending feature.
 * Location: {projectRoot}/.dagent/features/{featureId}/sessions/
 */
export function getPendingSessionsDir(projectRoot: string, featureId: string): string {
  return path.join(getPendingFeatureDir(projectRoot, featureId), 'sessions');
}

// ============================================================================
// Other Paths
// ============================================================================

/**
 * Get the root directory for archived features.
 * Location: {projectRoot}/.dagent-archived/
 */
export function getArchivedDir(projectRoot: string): string {
  return path.join(projectRoot, '.dagent-archived');
}

/**
 * Get the path to agents.json for agent configurations.
 * Location: {projectRoot}/.dagent/agents.json
 */
export function getAgentConfigsPath(projectRoot: string): string {
  return path.join(projectRoot, '.dagent', 'agents.json');
}

// ============================================================================
// Directory Initialization
// ============================================================================

/**
 * Ensure the .dagent-worktrees directory structure exists.
 * Creates the worktrees directory if it doesn't exist.
 */
export async function ensureDagentStructure(projectRoot: string): Promise<void> {
  const worktreesDir = getWorktreesDir(projectRoot);
  await fs.mkdir(worktreesDir, { recursive: true });
}

/**
 * Ensure the .dagent/features/ directory exists.
 * Creates the directory if it doesn't exist.
 */
export async function ensurePendingFeaturesDir(projectRoot: string): Promise<void> {
  const pendingDir = getPendingFeaturesDir(projectRoot);
  await fs.mkdir(pendingDir, { recursive: true });
}
