import path from 'path';

/**
 * Path utilities for .dagent storage structure.
 * Follows DAGENT_SPEC section 9.1 storage structure.
 */

/**
 * Get the root directory for all feature worktrees.
 * Location: {projectRoot}/.dagent-worktrees/
 */
export function getWorktreesDir(projectRoot: string): string {
  return path.join(projectRoot, '.dagent-worktrees');
}

/**
 * Get the .dagent directory for a specific feature.
 * Location: {projectRoot}/.dagent-worktrees/{featureId}/.dagent/
 */
export function getFeatureDir(projectRoot: string, featureId: string): string {
  return path.join(getWorktreesDir(projectRoot), featureId, '.dagent');
}

/**
 * Get the path to feature.json for a specific feature.
 * Location: {projectRoot}/.dagent-worktrees/{featureId}/.dagent/feature.json
 */
export function getFeaturePath(projectRoot: string, featureId: string): string {
  return path.join(getFeatureDir(projectRoot, featureId), 'feature.json');
}

/**
 * Get the path to dag.json for a specific feature.
 * Location: {projectRoot}/.dagent-worktrees/{featureId}/.dagent/dag.json
 */
export function getDagPath(projectRoot: string, featureId: string): string {
  return path.join(getFeatureDir(projectRoot, featureId), 'dag.json');
}

/**
 * Get the path to chat.json (feature-level chat) for a specific feature.
 * Location: {projectRoot}/.dagent-worktrees/{featureId}/.dagent/chat.json
 */
export function getChatPath(projectRoot: string, featureId: string): string {
  return path.join(getFeatureDir(projectRoot, featureId), 'chat.json');
}

/**
 * Get the path to harness_log.json for a specific feature.
 * Location: {projectRoot}/.dagent-worktrees/{featureId}/.dagent/harness_log.json
 */
export function getHarnessLogPath(projectRoot: string, featureId: string): string {
  return path.join(getFeatureDir(projectRoot, featureId), 'harness_log.json');
}

/**
 * Get the directory for a specific node within a feature.
 * Location: {projectRoot}/.dagent-worktrees/{featureId}/.dagent/nodes/{nodeId}/
 */
export function getNodeDir(projectRoot: string, featureId: string, nodeId: string): string {
  return path.join(getFeatureDir(projectRoot, featureId), 'nodes', nodeId);
}

/**
 * Get the path to chat.json for a specific node.
 * Location: {projectRoot}/.dagent-worktrees/{featureId}/.dagent/nodes/{nodeId}/chat.json
 */
export function getNodeChatPath(projectRoot: string, featureId: string, nodeId: string): string {
  return path.join(getNodeDir(projectRoot, featureId, nodeId), 'chat.json');
}

/**
 * Get the path to logs.json for a specific node.
 * Location: {projectRoot}/.dagent-worktrees/{featureId}/.dagent/nodes/{nodeId}/logs.json
 */
export function getNodeLogsPath(projectRoot: string, featureId: string, nodeId: string): string {
  return path.join(getNodeDir(projectRoot, featureId, nodeId), 'logs.json');
}

/**
 * Get the path to session.json for a specific task.
 * Location: {projectRoot}/.dagent-worktrees/{featureId}/.dagent/nodes/{taskId}/session.json
 */
export function getTaskSessionPath(projectRoot: string, featureId: string, taskId: string): string {
  return path.join(getNodeDir(projectRoot, featureId, taskId), 'session.json');
}

/**
 * Get the path to plan.json for a specific task.
 * Location: {projectRoot}/.dagent-worktrees/{featureId}/.dagent/nodes/{taskId}/plan.json
 */
export function getTaskPlanPath(projectRoot: string, featureId: string, taskId: string): string {
  return path.join(getNodeDir(projectRoot, featureId, taskId), 'plan.json');
}

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

/**
 * Get the .dagent-worktrees directory for a project.
 * This is where all feature worktrees are stored.
 */
export function getDagentRoot(projectRoot: string): string {
  return getWorktreesDir(projectRoot);
}

/**
 * Ensure the .dagent-worktrees directory structure exists.
 * Creates the worktrees directory if it doesn't exist.
 */
export async function ensureDagentStructure(projectRoot: string): Promise<void> {
  const { mkdir } = await import('fs/promises');
  const worktreesDir = getWorktreesDir(projectRoot);
  await mkdir(worktreesDir, { recursive: true });
}
