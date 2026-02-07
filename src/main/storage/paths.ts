import path from 'path';
import { promises as fs } from 'fs';

/**
 * Path utilities for .dagent storage structure.
 *
 * Features have three storage locations:
 * 1. Backlog features (status: backlog): .dagent/features/backlog/{featureId}/
 * 2. Active features (in manager worktree): .dagent-worktrees/{managerName}/.dagent/features/{featureId}/
 * 3. Archived features (status: archived): .dagent/features/archived/{featureId}/
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
// Backlog Feature Paths (for features without worktrees, status: backlog)
// ============================================================================

/**
 * Get the root directory for all backlog features.
 * Location: {projectRoot}/.dagent/features/backlog/
 */
export function getBacklogFeaturesDir(projectRoot: string): string {
  return path.join(projectRoot, '.dagent', 'features', 'backlog');
}

/**
 * Get the directory for a specific backlog feature.
 * Location: {projectRoot}/.dagent/features/backlog/{featureId}/
 */
export function getBacklogFeatureDir(projectRoot: string, featureId: string): string {
  return path.join(getBacklogFeaturesDir(projectRoot), featureId);
}

/**
 * Get the path to feature.json for a backlog feature.
 * Location: {projectRoot}/.dagent/features/backlog/{featureId}/feature.json
 */
export function getBacklogFeaturePath(projectRoot: string, featureId: string): string {
  return path.join(getBacklogFeatureDir(projectRoot, featureId), 'feature.json');
}

/**
 * Get the path to dag.json for a backlog feature.
 * Location: {projectRoot}/.dagent/features/backlog/{featureId}/dag.json
 */
export function getBacklogDagPath(projectRoot: string, featureId: string): string {
  return path.join(getBacklogFeatureDir(projectRoot, featureId), 'dag.json');
}

/**
 * Get the attachments directory for a backlog feature.
 * Location: {projectRoot}/.dagent/features/backlog/{featureId}/attachments/
 */
export function getBacklogAttachmentsDir(projectRoot: string, featureId: string): string {
  return path.join(getBacklogFeatureDir(projectRoot, featureId), 'attachments');
}

/**
 * Get the sessions directory for a backlog feature.
 * Location: {projectRoot}/.dagent/features/backlog/{featureId}/sessions/
 */
export function getBacklogSessionsDir(projectRoot: string, featureId: string): string {
  return path.join(getBacklogFeatureDir(projectRoot, featureId), 'sessions');
}

// Aliases for backward compatibility
export const getPendingFeaturesDir = getBacklogFeaturesDir;
export const getPendingFeatureDir = getBacklogFeatureDir;
export const getPendingFeaturePath = getBacklogFeaturePath;
export const getPendingDagPath = getBacklogDagPath;
export const getPendingAttachmentsDir = getBacklogAttachmentsDir;
export const getPendingSessionsDir = getBacklogSessionsDir;

// ============================================================================
// Archived Feature Paths
// ============================================================================

/**
 * Get the root directory for archived features.
 * Location: {projectRoot}/.dagent/features/archived/
 */
export function getArchivedFeaturesDir(projectRoot: string): string {
  return path.join(projectRoot, '.dagent', 'features', 'archived');
}

/**
 * Get the directory for a specific archived feature.
 * Location: {projectRoot}/.dagent/features/archived/{featureId}/
 */
export function getArchivedFeatureDir(projectRoot: string, featureId: string): string {
  return path.join(getArchivedFeaturesDir(projectRoot), featureId);
}

/**
 * Get the path to feature.json for an archived feature.
 * Location: {projectRoot}/.dagent/features/archived/{featureId}/feature.json
 */
export function getArchivedFeaturePath(projectRoot: string, featureId: string): string {
  return path.join(getArchivedFeatureDir(projectRoot, featureId), 'feature.json');
}

/**
 * Get the path to dag.json for an archived feature.
 * Location: {projectRoot}/.dagent/features/archived/{featureId}/dag.json
 */
export function getArchivedDagPath(projectRoot: string, featureId: string): string {
  return path.join(getArchivedFeatureDir(projectRoot, featureId), 'dag.json');
}

// Legacy alias - use getArchivedFeaturesDir instead
export function getArchivedDir(projectRoot: string): string {
  return getArchivedFeaturesDir(projectRoot);
}

// ============================================================================
// Agent Configuration Paths
// ============================================================================

/**
 * Get the directory for agent configurations.
 * Location: {projectRoot}/.dagent/agents/
 */
export function getAgentsDir(projectRoot: string): string {
  return path.join(projectRoot, '.dagent', 'agents');
}

/**
 * Get the path to a specific agent's configuration file.
 * Location: {projectRoot}/.dagent/agents/{role}.json
 */
export function getAgentConfigPath(projectRoot: string, role: string): string {
  return path.join(getAgentsDir(projectRoot), `${role}.json`);
}

/**
 * Ensure the .dagent/agents/ directory exists.
 */
export async function ensureAgentsDir(projectRoot: string): Promise<void> {
  const agentsDir = getAgentsDir(projectRoot);
  await fs.mkdir(agentsDir, { recursive: true });
}

/**
 * Legacy: Get the path to agents.json for agent configurations.
 * Location: {projectRoot}/.dagent/agents.json
 * @deprecated Use getAgentConfigPath instead for per-agent configs
 */
export function getAgentConfigsPath(projectRoot: string): string {
  return path.join(projectRoot, '.dagent', 'agents.json');
}

// ============================================================================
// Context/Setup Chat Paths
// ============================================================================

/**
 * Get the directory for context/setup chat storage.
 * Location: {projectRoot}/.dagent/context-chat/
 */
export function getContextChatDir(projectRoot: string): string {
  return path.join(projectRoot, '.dagent', 'context-chat');
}

/**
 * Get the path to messages.json for context/setup chat.
 * Location: {projectRoot}/.dagent/context-chat/messages.json
 */
export function getContextChatMessagesPath(projectRoot: string): string {
  return path.join(getContextChatDir(projectRoot), 'messages.json');
}

/**
 * Get the path to memory.json for context/setup chat.
 * Location: {projectRoot}/.dagent/context-chat/memory.json
 */
export function getContextChatMemoryPath(projectRoot: string): string {
  return path.join(getContextChatDir(projectRoot), 'memory.json');
}

/**
 * Ensure the context chat directory exists.
 */
export async function ensureContextChatDir(projectRoot: string): Promise<void> {
  const dir = getContextChatDir(projectRoot);
  await fs.mkdir(dir, { recursive: true });
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
 * Ensure the .dagent/features/backlog/ directory exists.
 * Creates the directory if it doesn't exist.
 */
export async function ensureBacklogFeaturesDir(projectRoot: string): Promise<void> {
  const backlogDir = getBacklogFeaturesDir(projectRoot);
  await fs.mkdir(backlogDir, { recursive: true });
}

/**
 * Ensure the .dagent/features/archived/ directory exists.
 * Creates the directory if it doesn't exist.
 */
export async function ensureArchivedFeaturesDir(projectRoot: string): Promise<void> {
  const archivedDir = getArchivedFeaturesDir(projectRoot);
  await fs.mkdir(archivedDir, { recursive: true });
}

// Alias for backward compatibility
export const ensurePendingFeaturesDir = ensureBacklogFeaturesDir;
