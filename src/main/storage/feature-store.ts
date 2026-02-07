import type { Feature, DAGGraph, ChatHistory, AgentLog, DevAgentSession, DevAgentMessage, Task, WorktreeId } from '@shared/types';
import { readJson, writeJson, exists } from './json-store';
import * as paths from './paths';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Storage service for feature data.
 * Manages reading/writing to .dagent directory structure.
 *
 * Storage locations:
 * - Pending features (not_started): .dagent/features/{featureId}/
 * - Active features: .dagent-worktrees/{managerName}/.dagent/features/{featureId}/
 */
export class FeatureStore {
  constructor(private projectRoot: string) {}

  /**
   * Create a new feature with generated ID.
   * @param name - Human-readable feature name (e.g., "My Feature")
   * @param options - Optional feature configuration (description, attachments)
   * @returns Created Feature object
   */
  async createFeature(name: string, options?: {description?: string, attachments?: string[], worktreeId?: WorktreeId}): Promise<Feature> {
    // Check if feature with same name already exists
    const features = await this.listFeatures();
    for (const featureId of features) {
      const existingFeature = await this.loadFeature(featureId);
      if (existingFeature && existingFeature.name === name) {
        throw new Error('Feature with this name already exists');
      }
    }

    // Generate kebab-case slug from name: "My Feature" -> "my-feature"
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    // Generate feature ID: "feature-my-feature"
    const id = `feature-${slug}`;

    // Get current ISO timestamp
    const now = new Date().toISOString();

    // Create Feature object with 'backlog' status
    // Worktree creation is deferred until user clicks Start
    const feature: Feature = {
      id,
      name,
      status: 'backlog',
      blocked: false,
      createdAt: now,
      updatedAt: now,
      description: options?.description,
      attachments: options?.attachments,
      worktreeId: options?.worktreeId || 'neon' // Default to 'neon' if not specified
    };

    // Ensure pending features directory exists
    await paths.ensurePendingFeaturesDir(this.projectRoot);

    // Create the pending feature directory
    const pendingDir = paths.getPendingFeatureDir(this.projectRoot, id);
    await fs.mkdir(pendingDir, { recursive: true });

    // Persist to pending storage
    await this.saveFeature(feature);

    // Create initial task for the feature
    const initialTask: Task = {
      id: `task-${slug}-initial`,
      title: name,  // Feature name becomes task title
      spec: options?.description || '',  // Feature description becomes task spec
      status: 'ready',
      blocked: false,
      position: { x: 250, y: 100 },  // Centered position
      dependencies: []
    };

    // Create initial DAG with the single task
    const initialDag: DAGGraph = {
      nodes: [initialTask],
      connections: []
    };

    // Save the DAG
    await this.saveDag(id, initialDag);

    return feature;
  }

  /**
   * Save feature metadata to feature.json.
   * Storage locations:
   * - backlog: .dagent/features/backlog/{featureId}/
   * - archived: .dagent/features/archived/{featureId}/
   * - active/creating_worktree/merging: .dagent-worktrees/{manager}/.dagent/features/{featureId}/
   *
   * When archiving: Copies ENTIRE feature folder from worktree to archived.
   * When unarchiving: Copies ENTIRE feature folder from archived back to worktree (using preserved worktreeId).
   */
  async saveFeature(feature: Feature): Promise<void> {
    // Handle archiving: move ENTIRE folder from worktree to archived
    if (feature.status === 'archived' && feature.worktreePath) {
      await this.archiveFeatureFolder(feature);
      return;
    }

    // Handle unarchiving: move ENTIRE folder from archived back to worktree
    // This happens when status changes from archived to active/merging and worktreeId is preserved
    if ((feature.status === 'active' || feature.status === 'merging') && feature.worktreeId) {
      const wasArchived = await this.isFeatureArchived(feature.id);
      if (wasArchived) {
        await this.unarchiveFeatureFolder(feature);
        return;
      }
    }

    // Normal save logic for non-archive transitions
    let filePath: string;
    let shouldCleanupPrevious = false;
    let previousLocation: 'backlog' | 'worktree' | 'archived' | null = null;

    if (feature.status === 'backlog') {
      // Backlog features go to .dagent/features/backlog/
      filePath = paths.getBacklogFeaturePath(this.projectRoot, feature.id);
      shouldCleanupPrevious = true;
      previousLocation = 'worktree'; // Clean up worktree if it exists
    } else if (feature.status === 'archived') {
      // Archived without worktreePath - just save feature.json to archived
      // (This shouldn't happen normally, but handle it gracefully)
      filePath = paths.getArchivedFeaturePath(this.projectRoot, feature.id);
    } else if (feature.worktreePath) {
      // Active/creating_worktree/merging features go to worktree
      const worktreeFeaturePath = paths.getFeaturePathInWorktree(feature.worktreePath, feature.id);

      // Check if we can access the worktree directory
      let worktreeExists = false;
      try {
        await fs.access(feature.worktreePath);
        worktreeExists = true;
      } catch {
        worktreeExists = false;
      }

      if (worktreeExists) {
        filePath = worktreeFeaturePath;
        shouldCleanupPrevious = true;
        previousLocation = 'backlog'; // Clean up backlog location
      } else {
        // Worktree doesn't exist yet, save to backlog location temporarily
        console.log(`[FeatureStore] Worktree ${feature.worktreePath} doesn't exist yet, saving ${feature.id} to backlog location`);
        filePath = paths.getBacklogFeaturePath(this.projectRoot, feature.id);
      }
    } else {
      // Feature without worktree path - save to backlog location
      console.warn(`[FeatureStore] Feature ${feature.id} in ${feature.status} status without worktreePath - saving to backlog location`);
      filePath = paths.getBacklogFeaturePath(this.projectRoot, feature.id);
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    console.log(`[FeatureStore] Saving feature ${feature.id} (status=${feature.status}) to: ${filePath}`);
    await writeJson(filePath, feature);
    console.log(`[FeatureStore] Feature ${feature.id} saved successfully`);

    // Clean up previous location if needed
    if (shouldCleanupPrevious && previousLocation) {
      console.log(`[FeatureStore] Cleaning up previous location: ${previousLocation}, worktreePath: ${feature.worktreePath}`);
      await this.cleanupPreviousLocation(feature, previousLocation);
    }
  }

  /**
   * Check if a feature exists in the archived location.
   */
  private async isFeatureArchived(featureId: string): Promise<boolean> {
    const archivedPath = paths.getArchivedFeaturePath(this.projectRoot, featureId);
    return exists(archivedPath);
  }

  /**
   * Archive a feature by copying the ENTIRE feature folder from worktree to archived.
   * Preserves all data: feature.json, dag.json, nodes/, sessions/, attachments/, etc.
   */
  private async archiveFeatureFolder(feature: Feature): Promise<void> {
    if (!feature.worktreePath) {
      throw new Error(`Cannot archive feature ${feature.id}: no worktreePath set`);
    }

    const sourceDir = paths.getFeatureDirInWorktree(feature.worktreePath, feature.id);
    const destDir = paths.getArchivedFeatureDir(this.projectRoot, feature.id);

    console.log(`[FeatureStore] Archiving feature ${feature.id}: ${sourceDir} -> ${destDir}`);

    // Ensure archived features directory exists
    await paths.ensureArchivedFeaturesDir(this.projectRoot);

    // Copy entire folder recursively
    await this.copyDirRecursive(sourceDir, destDir);

    // Update feature.json in the archived location with new status
    const archivedFeaturePath = paths.getArchivedFeaturePath(this.projectRoot, feature.id);
    await writeJson(archivedFeaturePath, feature);

    // Clean up the worktree location
    try {
      await fs.rm(sourceDir, { recursive: true });
      console.log(`[FeatureStore] Cleaned up worktree location for archived feature ${feature.id}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[FeatureStore] Failed to clean up worktree location for ${feature.id}:`, error);
      }
    }

    console.log(`[FeatureStore] Feature ${feature.id} archived successfully`);
  }

  /**
   * Unarchive a feature by copying the ENTIRE feature folder from archived back to worktree.
   * Uses preserved worktreeId to determine correct worktree location.
   */
  private async unarchiveFeatureFolder(feature: Feature): Promise<void> {
    if (!feature.worktreeId) {
      throw new Error(`Cannot unarchive feature ${feature.id}: no worktreeId preserved`);
    }

    // Reconstruct worktreePath from worktreeId
    const worktreePath = path.join(paths.getWorktreesDir(this.projectRoot), feature.worktreeId);
    feature.worktreePath = worktreePath;

    const sourceDir = paths.getArchivedFeatureDir(this.projectRoot, feature.id);
    const destDir = paths.getFeatureDirInWorktree(worktreePath, feature.id);

    console.log(`[FeatureStore] Unarchiving feature ${feature.id}: ${sourceDir} -> ${destDir}`);

    // Ensure worktree features directory exists
    const worktreeFeaturesDir = path.join(worktreePath, '.dagent', 'features');
    await fs.mkdir(worktreeFeaturesDir, { recursive: true });

    // Copy entire folder recursively
    await this.copyDirRecursive(sourceDir, destDir);

    // Update feature.json in the worktree location with new status and worktreePath
    const worktreeFeaturePath = paths.getFeaturePathInWorktree(worktreePath, feature.id);
    await writeJson(worktreeFeaturePath, feature);

    // Clean up the archived location
    try {
      await fs.rm(sourceDir, { recursive: true });
      console.log(`[FeatureStore] Cleaned up archived location for unarchived feature ${feature.id}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[FeatureStore] Failed to clean up archived location for ${feature.id}:`, error);
      }
    }

    console.log(`[FeatureStore] Feature ${feature.id} unarchived successfully to ${worktreePath}`);
  }

  /**
   * Recursively copy a directory and all its contents.
   */
  private async copyDirRecursive(src: string, dest: string): Promise<void> {
    // Create destination directory
    await fs.mkdir(dest, { recursive: true });

    // Read source directory contents
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(src, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn(`[FeatureStore] Source directory doesn't exist: ${src}`);
        return;
      }
      throw error;
    }

    // Copy each entry
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Clean up feature data from a previous location after it has been moved.
   */
  private async cleanupPreviousLocation(
    feature: Feature,
    location: 'backlog' | 'worktree' | 'archived'
  ): Promise<void> {
    try {
      if (location === 'backlog') {
        const backlogDir = paths.getBacklogFeatureDir(this.projectRoot, feature.id);
        await fs.rm(backlogDir, { recursive: true });
        console.log(`[FeatureStore] Cleaned up backlog location for ${feature.id}`);
      } else if (location === 'worktree' && feature.worktreePath) {
        const worktreeDir = paths.getFeatureDirInWorktree(feature.worktreePath, feature.id);
        await fs.rm(worktreeDir, { recursive: true });
        console.log(`[FeatureStore] Cleaned up worktree location for ${feature.id}`);
      } else if (location === 'archived') {
        const archivedDir = paths.getArchivedFeatureDir(this.projectRoot, feature.id);
        await fs.rm(archivedDir, { recursive: true });
        console.log(`[FeatureStore] Cleaned up archived location for ${feature.id}`);
      }
    } catch (error) {
      // Ignore if directory doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[FeatureStore] Failed to clean up ${location} location for ${feature.id}:`, error);
      }
    }
  }

  /**
   * Load feature metadata from feature.json.
   * Checks backlog, archived, and worktree locations.
   * @returns Feature data, or null if not found.
   */
  async loadFeature(featureId: string): Promise<Feature | null> {
    // Check backlog location
    const backlogPath = paths.getBacklogFeaturePath(this.projectRoot, featureId);
    if (await exists(backlogPath)) {
      return readJson<Feature>(backlogPath);
    }

    // Check archived location
    const archivedPath = paths.getArchivedFeaturePath(this.projectRoot, featureId);
    if (await exists(archivedPath)) {
      return readJson<Feature>(archivedPath);
    }

    // Scan manager worktrees for the feature
    const worktreesDir = paths.getWorktreesDir(this.projectRoot);
    try {
      const entries = await fs.readdir(worktreesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const managerWorktreePath = path.join(worktreesDir, entry.name);
          const featurePath = paths.getFeaturePathInWorktree(managerWorktreePath, featureId);
          if (await exists(featurePath)) {
            return readJson<Feature>(featurePath);
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return null;
  }

  /**
   * Delete a feature and all its data.
   * Checks backlog, archived, and worktree locations.
   * @returns true if deleted, false if feature didn't exist.
   */
  async deleteFeature(featureId: string): Promise<boolean> {
    let deleted = false;

    // Try deleting from backlog location
    const backlogDir = paths.getBacklogFeatureDir(this.projectRoot, featureId);
    try {
      await fs.rm(backlogDir, { recursive: true });
      deleted = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Try deleting from archived location
    const archivedDir = paths.getArchivedFeatureDir(this.projectRoot, featureId);
    try {
      await fs.rm(archivedDir, { recursive: true });
      deleted = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Scan manager worktrees and delete feature data from any that contain it
    const worktreesDir = paths.getWorktreesDir(this.projectRoot);
    try {
      const entries = await fs.readdir(worktreesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const managerWorktreePath = path.join(worktreesDir, entry.name);
          const featureDirInWorktree = paths.getFeatureDirInWorktree(managerWorktreePath, featureId);
          try {
            await fs.rm(featureDirInWorktree, { recursive: true });
            deleted = true;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error;
            }
            // Feature doesn't exist in this worktree, try next
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // Worktrees directory doesn't exist yet, that's fine
    }

    return deleted;
  }

  /**
   * Save DAG graph to dag.json.
   * Saves to pending location for not_started features, manager worktree location otherwise.
   */
  async saveDag(featureId: string, dag: DAGGraph): Promise<void> {
    // Determine location based on feature
    const feature = await this.loadFeature(featureId);
    let filePath: string;

    if (feature?.status === 'backlog') {
      filePath = paths.getPendingDagPath(this.projectRoot, featureId);
    } else if (feature?.worktreePath) {
      filePath = paths.getDagPathInWorktree(feature.worktreePath, featureId);
    } else {
      // Feature is transitioning but managerWorktreePath not set yet
      // Keep in pending location until worktree path is established
      console.warn(`[FeatureStore] DAG for feature ${featureId} in ${feature?.status} status without managerWorktreePath - saving to pending location`);
      filePath = paths.getPendingDagPath(this.projectRoot, featureId);
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await writeJson(filePath, dag);
  }

  /**
   * Load DAG graph from dag.json.
   * Checks pending location first, then archived, then manager worktrees.
   * @returns DAG graph, or null if not found.
   */
  async loadDag(featureId: string): Promise<DAGGraph | null> {
    // First check pending location
    const pendingPath = paths.getPendingDagPath(this.projectRoot, featureId);
    if (await exists(pendingPath)) {
      return readJson<DAGGraph>(pendingPath);
    }

    // Check archived location
    const archivedPath = paths.getArchivedDagPath(this.projectRoot, featureId);
    if (await exists(archivedPath)) {
      return readJson<DAGGraph>(archivedPath);
    }

    // Load feature to get manager worktree path
    const feature = await this.loadFeature(featureId);
    if (feature?.worktreePath) {
      const worktreePath = paths.getDagPathInWorktree(feature.worktreePath, featureId);
      if (await exists(worktreePath)) {
        return readJson<DAGGraph>(worktreePath);
      }
    }

    return null;
  }

  /**
   * Check if a feature has a spec file (feature-spec.md).
   * Used to determine if planning was completed.
   * @returns true if spec file exists, false otherwise.
   */
  async hasFeatureSpec(featureId: string): Promise<boolean> {
    const feature = await this.loadFeature(featureId);
    if (feature?.worktreePath) {
      const specPath = paths.getFeatureSpecPathInWorktree(feature.worktreePath, featureId);
      return exists(specPath);
    }
    return false;
  }

  /**
   * Save feature-level chat history.
   * @deprecated Use SessionManager.addMessage() instead. See doc/api-reference.md for migration guide.
   */
  async saveChat(featureId: string, chat: ChatHistory): Promise<void> {
    console.warn('[DEPRECATED] FeatureStore.saveChat() is deprecated. Use SessionManager.addMessage() instead.');
    const feature = await this.loadFeature(featureId);
    if (!feature?.worktreePath) {
      throw new Error(`Feature ${featureId} does not have a worktree path set`);
    }
    const filePath = paths.getChatPathInWorktree(feature.worktreePath, featureId);
    await writeJson(filePath, chat);
  }

  /**
   * Load feature-level chat history.
   * @deprecated Use SessionManager.getSession() instead. See doc/api-reference.md for migration guide.
   * @returns Chat history, or null if not found.
   */
  async loadChat(featureId: string): Promise<ChatHistory | null> {
    console.warn('[DEPRECATED] FeatureStore.loadChat() is deprecated. Use SessionManager.getSession() instead.');
    const feature = await this.loadFeature(featureId);
    if (!feature?.worktreePath) {
      return null;
    }
    const filePath = paths.getChatPathInWorktree(feature.worktreePath, featureId);
    return readJson<ChatHistory>(filePath);
  }

  /**
   * Save harness log for a feature.
   */
  async saveHarnessLog(featureId: string, log: AgentLog): Promise<void> {
    const feature = await this.loadFeature(featureId);
    if (!feature?.worktreePath) {
      throw new Error(`Feature ${featureId} does not have a worktree path set`);
    }
    const filePath = paths.getHarnessLogPathInWorktree(feature.worktreePath, featureId);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await writeJson(filePath, log);
  }

  /**
   * Load harness log for a feature.
   * @returns Agent log, or null if not found.
   */
  async loadHarnessLog(featureId: string): Promise<AgentLog | null> {
    const feature = await this.loadFeature(featureId);
    if (!feature?.worktreePath) {
      return null;
    }
    const filePath = paths.getHarnessLogPathInWorktree(feature.worktreePath, featureId);
    return readJson<AgentLog>(filePath);
  }

  /**
   * Save node-specific chat history.
   * @deprecated Use SessionManager with task context instead.
   */
  async saveNodeChat(featureId: string, nodeId: string, chat: ChatHistory): Promise<void> {
    console.warn('[DEPRECATED] FeatureStore.saveNodeChat() is deprecated. Use SessionManager with task context instead.');
    const feature = await this.loadFeature(featureId);
    if (!feature?.worktreePath) {
      throw new Error(`Feature ${featureId} does not have a worktree path set`);
    }
    const filePath = paths.getNodeChatPathInWorktree(feature.worktreePath, featureId, nodeId);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await writeJson(filePath, chat);
  }

  /**
   * Load node-specific chat history.
   * @deprecated Use SessionManager with task context instead.
   * @returns Chat history, or null if not found.
   */
  async loadNodeChat(featureId: string, nodeId: string): Promise<ChatHistory | null> {
    console.warn('[DEPRECATED] FeatureStore.loadNodeChat() is deprecated. Use SessionManager with task context instead.');
    const feature = await this.loadFeature(featureId);
    if (!feature?.worktreePath) {
      return null;
    }
    const filePath = paths.getNodeChatPathInWorktree(feature.worktreePath, featureId, nodeId);
    return readJson<ChatHistory>(filePath);
  }

  /**
   * Save node-specific agent logs.
   */
  async saveNodeLogs(featureId: string, nodeId: string, log: AgentLog): Promise<void> {
    const feature = await this.loadFeature(featureId);
    if (!feature?.worktreePath) {
      throw new Error(`Feature ${featureId} does not have a worktree path set`);
    }
    const filePath = paths.getNodeLogsPathInWorktree(feature.worktreePath, featureId, nodeId);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await writeJson(filePath, log);
  }

  /**
   * Load node-specific agent logs.
   * @returns Agent log, or null if not found.
   */
  async loadNodeLogs(featureId: string, nodeId: string): Promise<AgentLog | null> {
    const feature = await this.loadFeature(featureId);
    if (!feature?.worktreePath) {
      return null;
    }
    const filePath = paths.getNodeLogsPathInWorktree(feature.worktreePath, featureId, nodeId);
    return readJson<AgentLog>(filePath);
  }

  /**
   * Save dev agent session.
   */
  async saveTaskSession(featureId: string, taskId: string, session: DevAgentSession): Promise<void> {
    const feature = await this.loadFeature(featureId);
    if (!feature?.worktreePath) {
      throw new Error(`Feature ${featureId} does not have a worktree path set`);
    }
    const filePath = paths.getTaskSessionPathInWorktree(feature.worktreePath, featureId, taskId);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await writeJson(filePath, session);
  }

  /**
   * Load dev agent session.
   * @returns Session, or null if not found.
   */
  async loadTaskSession(featureId: string, taskId: string): Promise<DevAgentSession | null> {
    const feature = await this.loadFeature(featureId);
    if (!feature?.worktreePath) {
      return null;
    }
    const filePath = paths.getTaskSessionPathInWorktree(feature.worktreePath, featureId, taskId);
    return readJson<DevAgentSession>(filePath);
  }

  /**
   * Append a message to an existing dev agent session.
   * Creates session if it doesn't exist.
   */
  async appendSessionMessage(
    featureId: string,
    taskId: string,
    message: DevAgentMessage,
    sessionDefaults?: Partial<DevAgentSession>
  ): Promise<void> {
    let session = await this.loadTaskSession(featureId, taskId);
    if (!session) {
      session = {
        taskId,
        agentId: sessionDefaults?.agentId || 'unknown',
        status: 'active',
        startedAt: new Date().toISOString(),
        messages: [],
        ...sessionDefaults
      };
    }
    session.messages.push(message);
    await this.saveTaskSession(featureId, taskId, session);
  }

  /**
   * Clear all messages from a task session.
   * Keeps the session metadata but empties the messages array.
   */
  async clearSessionMessages(featureId: string, taskId: string): Promise<void> {
    const session = await this.loadTaskSession(featureId, taskId);
    if (session) {
      session.messages = [];
      await this.saveTaskSession(featureId, taskId, session);
    }
  }

  /**
   * List task IDs that have session.json files.
   * @returns Array of task IDs with sessions.
   */
  async listTaskSessions(featureId: string): Promise<string[]> {
    const feature = await this.loadFeature(featureId);
    if (!feature?.worktreePath) {
      return [];
    }

    const featureDir = paths.getFeatureDirInWorktree(feature.worktreePath, featureId);
    const nodesDir = path.join(featureDir, 'nodes');

    try {
      const entries = await fs.readdir(nodesDir, { withFileTypes: true });
      const taskIds: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionPath = paths.getTaskSessionPathInWorktree(feature.worktreePath, featureId, entry.name);
          if (await exists(sessionPath)) {
            taskIds.push(entry.name);
          }
        }
      }
      return taskIds;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete a node directory and all its data.
   * @returns true if deleted, false if node didn't exist.
   */
  async deleteNode(featureId: string, nodeId: string): Promise<boolean> {
    const feature = await this.loadFeature(featureId);
    if (!feature?.worktreePath) {
      return false;
    }

    const nodeDir = paths.getNodeDirInWorktree(feature.worktreePath, featureId, nodeId);
    try {
      await fs.rm(nodeDir, { recursive: true });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * List all feature IDs from backlog, archived, and worktree directories.
   * Only includes directories that have a valid feature.json.
   */
  async listFeatures(): Promise<string[]> {
    const featureIds = new Set<string>();

    // List from backlog directory (.dagent/features/backlog/)
    const backlogDir = paths.getBacklogFeaturesDir(this.projectRoot);
    try {
      const backlogEntries = await fs.readdir(backlogDir, { withFileTypes: true });
      for (const entry of backlogEntries) {
        if (entry.isDirectory()) {
          const featurePath = paths.getBacklogFeaturePath(this.projectRoot, entry.name);
          if (await exists(featurePath)) {
            featureIds.add(entry.name);
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // Directory doesn't exist yet, that's fine
    }

    // List from archived directory (.dagent/features/archived/)
    const archivedDir = paths.getArchivedFeaturesDir(this.projectRoot);
    try {
      const archivedEntries = await fs.readdir(archivedDir, { withFileTypes: true });
      for (const entry of archivedEntries) {
        if (entry.isDirectory()) {
          const featurePath = paths.getArchivedFeaturePath(this.projectRoot, entry.name);
          if (await exists(featurePath)) {
            featureIds.add(entry.name);
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // Directory doesn't exist yet, that's fine
    }

    // Scan manager worktrees for features (.dagent-worktrees/{managerName}/.dagent/features/)
    const worktreesDir = paths.getWorktreesDir(this.projectRoot);
    try {
      const worktreeEntries = await fs.readdir(worktreesDir, { withFileTypes: true });
      for (const worktreeEntry of worktreeEntries) {
        if (worktreeEntry.isDirectory()) {
          const managerWorktreePath = path.join(worktreesDir, worktreeEntry.name);
          const featuresDir = path.join(managerWorktreePath, '.dagent', 'features');

          try {
            const featureEntries = await fs.readdir(featuresDir, { withFileTypes: true });
            for (const featureEntry of featureEntries) {
              if (featureEntry.isDirectory()) {
                const featurePath = paths.getFeaturePathInWorktree(managerWorktreePath, featureEntry.name);
                if (await exists(featurePath)) {
                  featureIds.add(featureEntry.name);
                }
              }
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error;
            }
            // No features directory in this worktree, that's fine
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // Directory doesn't exist yet, that's fine
    }

    return Array.from(featureIds);
  }

  /**
   * Save an attachment file for a feature.
   * Stores in pending location for not_started features, worktree location otherwise.
   * @param featureId - Feature ID
   * @param fileName - Original file name
   * @param fileBuffer - File data as Buffer
   * @returns Relative path: attachments/{fileName}
   */
  async saveAttachment(featureId: string, fileName: string, fileBuffer: Buffer): Promise<string> {
    // Determine location based on feature status
    const feature = await this.loadFeature(featureId);
    let attachmentsDir: string;

    if (feature?.status === 'backlog') {
      attachmentsDir = paths.getPendingAttachmentsDir(this.projectRoot, featureId);
    } else if (feature?.worktreePath) {
      attachmentsDir = paths.getAttachmentsDirInWorktree(feature.worktreePath, featureId);
    } else {
      // Fallback to pending location
      attachmentsDir = paths.getPendingAttachmentsDir(this.projectRoot, featureId);
    }

    await fs.mkdir(attachmentsDir, { recursive: true });

    const filePath = path.join(attachmentsDir, fileName);
    await fs.writeFile(filePath, fileBuffer);

    return `attachments/${fileName}`;
  }

  /**
   * List all attachments for a feature.
   * Checks pending location for not_started features.
   * @param featureId - Feature ID
   * @returns Array of attachment relative paths
   */
  async listAttachments(featureId: string): Promise<string[]> {
    // Determine location based on feature status
    const feature = await this.loadFeature(featureId);
    let attachmentsDir: string;

    if (feature?.status === 'backlog') {
      attachmentsDir = paths.getPendingAttachmentsDir(this.projectRoot, featureId);
    } else if (feature?.worktreePath) {
      attachmentsDir = paths.getAttachmentsDirInWorktree(feature.worktreePath, featureId);
    } else {
      // Fallback to pending location
      attachmentsDir = paths.getPendingAttachmentsDir(this.projectRoot, featureId);
    }

    try {
      const entries = await fs.readdir(attachmentsDir);
      return entries.map(fileName => `attachments/${fileName}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete an attachment file for a feature.
   * Also removes it from the feature's attachments array.
   * Handles both pending and worktree locations.
   * @param featureId - Feature ID
   * @param attachmentPath - Relative path like "attachments/filename.png"
   */
  async deleteAttachment(featureId: string, attachmentPath: string): Promise<void> {
    // Load feature to determine location and update attachments array
    const feature = await this.loadFeature(featureId);

    // Determine the base directory
    let baseDir: string;
    if (feature?.status === 'backlog') {
      baseDir = paths.getPendingFeatureDir(this.projectRoot, featureId);
    } else if (feature?.worktreePath) {
      baseDir = paths.getFeatureDirInWorktree(feature.worktreePath, featureId);
    } else {
      baseDir = paths.getPendingFeatureDir(this.projectRoot, featureId);
    }

    const fullPath = path.join(baseDir, attachmentPath);

    // Delete the file
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, continue to remove from feature anyway
    }

    // Update feature's attachments array
    if (feature && feature.attachments) {
      feature.attachments = feature.attachments.filter(a => a !== attachmentPath);
      if (feature.attachments.length === 0) {
        feature.attachments = undefined;
      }
      await this.saveFeature(feature);
    }
  }

  /**
   * Move a feature from pending storage to manager worktree storage.
   * Called when a feature is assigned to a manager and needs its files moved.
   * @param featureId - Feature ID to move
   * @param managerWorktreePath - Full path to the manager worktree (e.g., .dagent-worktrees/neon)
   * @throws Error if feature doesn't exist or isn't in not_started/creating_worktree status
   */
  async moveFeatureToWorktree(featureId: string, managerWorktreePath: string): Promise<void> {
    // Check if feature already exists in worktree location AND has valid content
    const worktreeFeaturePath = paths.getFeaturePathInWorktree(managerWorktreePath, featureId);
    if (await exists(worktreeFeaturePath)) {
      // File exists - but we need to check if it has valid content
      // An empty or corrupted file should be overwritten
      const existingFeature = await readJson<Feature>(worktreeFeaturePath);
      if (existingFeature && existingFeature.id === featureId) {
        // Feature already moved to worktree with valid content
        console.log(`[FeatureStore] Feature ${featureId} already in worktree location with valid content, skipping move`);

        // Still need to move dag.json and attachments if they exist in pending
        await this.movePendingAssets(featureId, managerWorktreePath);
        return;
      }
      // File exists but is empty or invalid - will be overwritten below
      console.log(`[FeatureStore] Feature ${featureId} exists in worktree but is empty/invalid, will overwrite`);
    }

    // Load feature from pending location
    const pendingFeaturePath = paths.getPendingFeaturePath(this.projectRoot, featureId);
    if (!(await exists(pendingFeaturePath))) {
      throw new Error(`Feature ${featureId} not found in pending location`);
    }

    const feature = await readJson<Feature>(pendingFeaturePath);
    if (!feature) {
      throw new Error(`Failed to load feature ${featureId} from pending location`);
    }

    // Only features in backlog or creating_worktree status can be moved to a worktree
    if (feature.status !== 'backlog' && feature.status !== 'creating_worktree') {
      throw new Error(`Feature ${featureId} must be in backlog or creating_worktree status (current: ${feature.status})`);
    }

    // Store the manager worktree path in the feature
    feature.worktreePath = managerWorktreePath;

    // Create the feature directory inside the manager worktree
    const worktreeFeatureDir = paths.getFeatureDirInWorktree(managerWorktreePath, featureId);
    await fs.mkdir(worktreeFeatureDir, { recursive: true });

    // Copy feature.json to worktree location
    await writeJson(worktreeFeaturePath, feature);
    console.log(`[FeatureStore] Wrote feature ${featureId} to worktree: ${worktreeFeaturePath}`);

    // Move dag.json and attachments from pending to worktree
    await this.movePendingAssets(featureId, managerWorktreePath);
  }

  /**
   * Move dag.json and attachments from pending location to worktree.
   * Also cleans up the pending directory after moving.
   * @param featureId - Feature ID
   * @param managerWorktreePath - Full path to manager worktree
   */
  private async movePendingAssets(featureId: string, managerWorktreePath: string): Promise<void> {
    // Copy dag.json if it exists in pending
    const pendingDagPath = paths.getPendingDagPath(this.projectRoot, featureId);
    if (await exists(pendingDagPath)) {
      const dag = await readJson<DAGGraph>(pendingDagPath);
      if (dag) {
        const worktreeDagPath = paths.getDagPathInWorktree(managerWorktreePath, featureId);
        await writeJson(worktreeDagPath, dag);
      }
    }

    // Copy attachments directory if it exists in pending
    const pendingAttachmentsDir = paths.getPendingAttachmentsDir(this.projectRoot, featureId);
    try {
      const attachments = await fs.readdir(pendingAttachmentsDir);
      if (attachments.length > 0) {
        const worktreeAttachmentsDir = paths.getAttachmentsDirInWorktree(managerWorktreePath, featureId);
        await fs.mkdir(worktreeAttachmentsDir, { recursive: true });
        for (const fileName of attachments) {
          const srcPath = path.join(pendingAttachmentsDir, fileName);
          const destPath = path.join(worktreeAttachmentsDir, fileName);
          await fs.copyFile(srcPath, destPath);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // No attachments directory, that's fine
    }

    // Delete the pending feature directory if it exists
    const pendingFeatureDir = paths.getPendingFeatureDir(this.projectRoot, featureId);
    try {
      await fs.rm(pendingFeatureDir, { recursive: true });
      console.log(`[FeatureStore] Cleaned up pending directory for ${featureId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[FeatureStore] Failed to clean up pending directory for ${featureId}:`, error);
      }
      // Directory doesn't exist, that's fine
    }
  }
}
