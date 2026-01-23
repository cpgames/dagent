import type { Feature, DAGGraph, ChatHistory, AgentLog, DevAgentSession, DevAgentMessage, Task, CompletionAction } from '@shared/types';
import { readJson, writeJson, exists } from './json-store';
import * as paths from './paths';
import { promises as fs } from 'fs';
import path from 'path';
import { getFeatureBranchName } from '../git/types';

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
   * Create a new feature with generated ID and branch name.
   * @param name - Human-readable feature name (e.g., "My Feature")
   * @param options - Optional feature configuration (description, attachments, completionAction)
   * @returns Created Feature object
   */
  async createFeature(name: string, options?: {description?: string, attachments?: string[], completionAction?: CompletionAction, autoStart?: boolean}): Promise<Feature> {
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

    // Create Feature object with 'not_started' status
    // Worktree creation is deferred until user clicks Start (Phase v3.2-03)
    const feature: Feature = {
      id,
      name,
      status: 'not_started',
      branchName: getFeatureBranchName(id),
      createdAt: now,
      updatedAt: now,
      description: options?.description,
      attachments: options?.attachments,
      completionAction: options?.completionAction ?? 'manual',
      autoStart: options?.autoStart ?? false
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
      description: options?.description || '',  // Feature description becomes task description
      status: 'needs_analysis',
      locked: false,
      position: { x: 250, y: 100 }  // Centered position
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
   * Saves to pending location for not_started features, manager worktree location otherwise.
   */
  async saveFeature(feature: Feature): Promise<void> {
    let filePath: string;
    let shouldDeletePending = false;

    if (feature.status === 'not_started' || feature.status === 'creating_worktree') {
      // For not_started and creating_worktree, always save to pending location
      // The worktree might not exist yet during creating_worktree status
      filePath = paths.getPendingFeaturePath(this.projectRoot, feature.id);
    } else if (feature.managerWorktreePath) {
      // For other statuses, check if worktree actually exists before saving there
      const worktreeFeaturePath = paths.getFeaturePathInWorktree(feature.managerWorktreePath, feature.id);

      // Check if we can access the worktree directory (means worktree exists)
      let worktreeExists = false;
      try {
        await fs.access(feature.managerWorktreePath);
        worktreeExists = true;
      } catch {
        worktreeExists = false;
      }

      if (worktreeExists) {
        filePath = worktreeFeaturePath;
        shouldDeletePending = true;
      } else {
        // Worktree doesn't exist yet, save to pending location
        console.log(`[FeatureStore] Worktree ${feature.managerWorktreePath} doesn't exist yet, saving ${feature.id} to pending location`);
        filePath = paths.getPendingFeaturePath(this.projectRoot, feature.id);
      }
    } else {
      // Feature is transitioning but managerWorktreePath not set yet
      // Keep in pending location until worktree path is established
      console.warn(`[FeatureStore] Feature ${feature.id} in ${feature.status} status without managerWorktreePath - saving to pending location`);
      filePath = paths.getPendingFeaturePath(this.projectRoot, feature.id);
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await writeJson(filePath, feature);

    // Clean up pending location if we saved to worktree
    // This ensures loadFeature doesn't find stale data in pending location
    if (shouldDeletePending) {
      const pendingFeaturePath = paths.getPendingFeaturePath(this.projectRoot, feature.id);
      try {
        await fs.unlink(pendingFeaturePath);
        console.log(`[FeatureStore] Cleaned up pending feature file for ${feature.id}`);
      } catch (error) {
        // Ignore if file doesn't exist - that's fine
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn(`[FeatureStore] Failed to clean up pending feature file for ${feature.id}:`, error);
        }
      }
    }
  }

  /**
   * Load feature metadata from feature.json.
   * Checks pending location first, then scans manager worktrees.
   * @returns Feature data, or null if not found.
   */
  async loadFeature(featureId: string): Promise<Feature | null> {
    // First check pending location (for not_started features)
    const pendingPath = paths.getPendingFeaturePath(this.projectRoot, featureId);
    if (await exists(pendingPath)) {
      return readJson<Feature>(pendingPath);
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
   * Checks pending location and all manager worktrees.
   * @returns true if deleted, false if feature didn't exist.
   */
  async deleteFeature(featureId: string): Promise<boolean> {
    let deleted = false;

    // Try deleting from pending location (.dagent/features/{featureId}/)
    const pendingDir = paths.getPendingFeatureDir(this.projectRoot, featureId);
    try {
      await fs.rm(pendingDir, { recursive: true });
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

    if (feature?.status === 'not_started') {
      filePath = paths.getPendingDagPath(this.projectRoot, featureId);
    } else if (feature?.managerWorktreePath) {
      filePath = paths.getDagPathInWorktree(feature.managerWorktreePath, featureId);
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
   * Checks pending location first, then manager worktrees.
   * @returns DAG graph, or null if not found.
   */
  async loadDag(featureId: string): Promise<DAGGraph | null> {
    // First check pending location
    const pendingPath = paths.getPendingDagPath(this.projectRoot, featureId);
    if (await exists(pendingPath)) {
      return readJson<DAGGraph>(pendingPath);
    }

    // Load feature to get manager worktree path
    const feature = await this.loadFeature(featureId);
    if (feature?.managerWorktreePath) {
      const worktreePath = paths.getDagPathInWorktree(feature.managerWorktreePath, featureId);
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
    if (feature?.managerWorktreePath) {
      const specPath = paths.getFeatureSpecPathInWorktree(feature.managerWorktreePath, featureId);
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
    if (!feature?.managerWorktreePath) {
      throw new Error(`Feature ${featureId} does not have a worktree path set`);
    }
    const filePath = paths.getChatPathInWorktree(feature.managerWorktreePath, featureId);
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
    if (!feature?.managerWorktreePath) {
      return null;
    }
    const filePath = paths.getChatPathInWorktree(feature.managerWorktreePath, featureId);
    return readJson<ChatHistory>(filePath);
  }

  /**
   * Save harness log for a feature.
   */
  async saveHarnessLog(featureId: string, log: AgentLog): Promise<void> {
    const feature = await this.loadFeature(featureId);
    if (!feature?.managerWorktreePath) {
      throw new Error(`Feature ${featureId} does not have a worktree path set`);
    }
    const filePath = paths.getHarnessLogPathInWorktree(feature.managerWorktreePath, featureId);
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
    if (!feature?.managerWorktreePath) {
      return null;
    }
    const filePath = paths.getHarnessLogPathInWorktree(feature.managerWorktreePath, featureId);
    return readJson<AgentLog>(filePath);
  }

  /**
   * Save node-specific chat history.
   * @deprecated Use SessionManager with task context instead.
   */
  async saveNodeChat(featureId: string, nodeId: string, chat: ChatHistory): Promise<void> {
    console.warn('[DEPRECATED] FeatureStore.saveNodeChat() is deprecated. Use SessionManager with task context instead.');
    const feature = await this.loadFeature(featureId);
    if (!feature?.managerWorktreePath) {
      throw new Error(`Feature ${featureId} does not have a worktree path set`);
    }
    const filePath = paths.getNodeChatPathInWorktree(feature.managerWorktreePath, featureId, nodeId);
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
    if (!feature?.managerWorktreePath) {
      return null;
    }
    const filePath = paths.getNodeChatPathInWorktree(feature.managerWorktreePath, featureId, nodeId);
    return readJson<ChatHistory>(filePath);
  }

  /**
   * Save node-specific agent logs.
   */
  async saveNodeLogs(featureId: string, nodeId: string, log: AgentLog): Promise<void> {
    const feature = await this.loadFeature(featureId);
    if (!feature?.managerWorktreePath) {
      throw new Error(`Feature ${featureId} does not have a worktree path set`);
    }
    const filePath = paths.getNodeLogsPathInWorktree(feature.managerWorktreePath, featureId, nodeId);
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
    if (!feature?.managerWorktreePath) {
      return null;
    }
    const filePath = paths.getNodeLogsPathInWorktree(feature.managerWorktreePath, featureId, nodeId);
    return readJson<AgentLog>(filePath);
  }

  /**
   * Save dev agent session.
   */
  async saveTaskSession(featureId: string, taskId: string, session: DevAgentSession): Promise<void> {
    const feature = await this.loadFeature(featureId);
    if (!feature?.managerWorktreePath) {
      throw new Error(`Feature ${featureId} does not have a worktree path set`);
    }
    const filePath = paths.getTaskSessionPathInWorktree(feature.managerWorktreePath, featureId, taskId);
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
    if (!feature?.managerWorktreePath) {
      return null;
    }
    const filePath = paths.getTaskSessionPathInWorktree(feature.managerWorktreePath, featureId, taskId);
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
   * List task IDs that have session.json files.
   * @returns Array of task IDs with sessions.
   */
  async listTaskSessions(featureId: string): Promise<string[]> {
    const feature = await this.loadFeature(featureId);
    if (!feature?.managerWorktreePath) {
      return [];
    }

    const featureDir = paths.getFeatureDirInWorktree(feature.managerWorktreePath, featureId);
    const nodesDir = path.join(featureDir, 'nodes');

    try {
      const entries = await fs.readdir(nodesDir, { withFileTypes: true });
      const taskIds: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionPath = paths.getTaskSessionPathInWorktree(feature.managerWorktreePath, featureId, entry.name);
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
    if (!feature?.managerWorktreePath) {
      return false;
    }

    const nodeDir = paths.getNodeDirInWorktree(feature.managerWorktreePath, featureId, nodeId);
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
   * List all feature IDs from pending directory and manager worktrees.
   * Only includes directories that have a valid feature.json.
   */
  async listFeatures(): Promise<string[]> {
    const featureIds = new Set<string>();

    // List from pending features directory (.dagent/features/)
    const pendingDir = paths.getPendingFeaturesDir(this.projectRoot);
    try {
      const pendingEntries = await fs.readdir(pendingDir, { withFileTypes: true });
      for (const entry of pendingEntries) {
        if (entry.isDirectory()) {
          const featurePath = paths.getPendingFeaturePath(this.projectRoot, entry.name);
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

    if (feature?.status === 'not_started') {
      attachmentsDir = paths.getPendingAttachmentsDir(this.projectRoot, featureId);
    } else if (feature?.managerWorktreePath) {
      attachmentsDir = paths.getAttachmentsDirInWorktree(feature.managerWorktreePath, featureId);
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

    if (feature?.status === 'not_started') {
      attachmentsDir = paths.getPendingAttachmentsDir(this.projectRoot, featureId);
    } else if (feature?.managerWorktreePath) {
      attachmentsDir = paths.getAttachmentsDirInWorktree(feature.managerWorktreePath, featureId);
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
    if (feature?.status === 'not_started') {
      baseDir = paths.getPendingFeatureDir(this.projectRoot, featureId);
    } else if (feature?.managerWorktreePath) {
      baseDir = paths.getFeatureDirInWorktree(feature.managerWorktreePath, featureId);
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

    // Accept both not_started and creating_worktree statuses
    // creating_worktree is valid because the status may be updated before files are moved
    if (feature.status !== 'not_started' && feature.status !== 'creating_worktree') {
      throw new Error(`Feature ${featureId} is not in not_started or creating_worktree status (current: ${feature.status})`);
    }

    // Store the manager worktree path in the feature
    feature.managerWorktreePath = managerWorktreePath;

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
