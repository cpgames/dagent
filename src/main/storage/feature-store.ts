import type { Feature, DAGGraph, ChatHistory, AgentLog, DevAgentSession, DevAgentMessage, Task, CompletionAction } from '@shared/types';
import { readJson, writeJson, exists } from './json-store';
import * as paths from './paths';
import { promises as fs } from 'fs';
import path from 'path';
import { getFeatureBranchName } from '../git/types';
import { getGitManager } from '../git';

/**
 * Storage service for feature data.
 * Manages reading/writing to .dagent directory structure.
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

    // Create Feature object
    const feature: Feature = {
      id,
      name,
      status: 'planning',
      branchName: getFeatureBranchName(id),
      createdAt: now,
      updatedAt: now,
      description: options?.description,
      attachments: options?.attachments,
      completionAction: options?.completionAction ?? 'manual',
      autoStart: options?.autoStart ?? false
    };

    // IMPORTANT: Create git worktree BEFORE saving feature.json
    // The worktree creation sets up the directory structure, then we write our files into it.
    // If we write files first, git worktree add will fail because the directory exists.
    const gitManager = getGitManager()
    if (gitManager.isInitialized()) {
      const worktreeResult = await gitManager.createFeatureWorktree(id)
      if (!worktreeResult.success) {
        console.warn(`[FeatureStore] Failed to create worktree for ${id}: ${worktreeResult.error}`)
        // Continue without worktree - feature can still be created, just won't have git isolation
      }
    }

    // Persist to storage (now safe because worktree directory exists)
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
   */
  async saveFeature(feature: Feature): Promise<void> {
    const filePath = paths.getFeaturePath(this.projectRoot, feature.id);
    await writeJson(filePath, feature);
  }

  /**
   * Load feature metadata from feature.json.
   * @returns Feature data, or null if not found.
   */
  async loadFeature(featureId: string): Promise<Feature | null> {
    const filePath = paths.getFeaturePath(this.projectRoot, featureId);
    return readJson<Feature>(filePath);
  }

  /**
   * Delete a feature and all its data.
   * @returns true if deleted, false if feature didn't exist.
   */
  async deleteFeature(featureId: string): Promise<boolean> {
    const featureDir = paths.getFeatureDir(this.projectRoot, featureId);
    try {
      await fs.rm(featureDir, { recursive: true });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Save DAG graph to dag.json.
   */
  async saveDag(featureId: string, dag: DAGGraph): Promise<void> {
    const filePath = paths.getDagPath(this.projectRoot, featureId);
    await writeJson(filePath, dag);
  }

  /**
   * Load DAG graph from dag.json.
   * @returns DAG graph, or null if not found.
   */
  async loadDag(featureId: string): Promise<DAGGraph | null> {
    const filePath = paths.getDagPath(this.projectRoot, featureId);
    return readJson<DAGGraph>(filePath);
  }

  /**
   * Check if a feature has a spec file (feature-spec.md).
   * Used to determine if planning was completed.
   * @returns true if spec file exists, false otherwise.
   */
  async hasFeatureSpec(featureId: string): Promise<boolean> {
    const specPath = paths.getFeatureSpecPath(this.projectRoot, featureId);
    return exists(specPath);
  }

  /**
   * Save feature-level chat history.
   * @deprecated Use SessionManager.addMessage() instead. See doc/api-reference.md for migration guide.
   */
  async saveChat(featureId: string, chat: ChatHistory): Promise<void> {
    console.warn('[DEPRECATED] FeatureStore.saveChat() is deprecated. Use SessionManager.addMessage() instead.');
    const filePath = paths.getChatPath(this.projectRoot, featureId);
    await writeJson(filePath, chat);
  }

  /**
   * Load feature-level chat history.
   * @deprecated Use SessionManager.getSession() instead. See doc/api-reference.md for migration guide.
   * @returns Chat history, or null if not found.
   */
  async loadChat(featureId: string): Promise<ChatHistory | null> {
    console.warn('[DEPRECATED] FeatureStore.loadChat() is deprecated. Use SessionManager.getSession() instead.');
    const filePath = paths.getChatPath(this.projectRoot, featureId);
    return readJson<ChatHistory>(filePath);
  }

  /**
   * Save harness log for a feature.
   */
  async saveHarnessLog(featureId: string, log: AgentLog): Promise<void> {
    const filePath = paths.getHarnessLogPath(this.projectRoot, featureId);
    await writeJson(filePath, log);
  }

  /**
   * Load harness log for a feature.
   * @returns Agent log, or null if not found.
   */
  async loadHarnessLog(featureId: string): Promise<AgentLog | null> {
    const filePath = paths.getHarnessLogPath(this.projectRoot, featureId);
    return readJson<AgentLog>(filePath);
  }

  /**
   * Save node-specific chat history.
   * @deprecated Use SessionManager with task context instead.
   */
  async saveNodeChat(featureId: string, nodeId: string, chat: ChatHistory): Promise<void> {
    console.warn('[DEPRECATED] FeatureStore.saveNodeChat() is deprecated. Use SessionManager with task context instead.');
    const filePath = paths.getNodeChatPath(this.projectRoot, featureId, nodeId);
    await writeJson(filePath, chat);
  }

  /**
   * Load node-specific chat history.
   * @deprecated Use SessionManager with task context instead.
   * @returns Chat history, or null if not found.
   */
  async loadNodeChat(featureId: string, nodeId: string): Promise<ChatHistory | null> {
    console.warn('[DEPRECATED] FeatureStore.loadNodeChat() is deprecated. Use SessionManager with task context instead.');
    const filePath = paths.getNodeChatPath(this.projectRoot, featureId, nodeId);
    return readJson<ChatHistory>(filePath);
  }

  /**
   * Save node-specific agent logs.
   */
  async saveNodeLogs(featureId: string, nodeId: string, log: AgentLog): Promise<void> {
    const filePath = paths.getNodeLogsPath(this.projectRoot, featureId, nodeId);
    await writeJson(filePath, log);
  }

  /**
   * Load node-specific agent logs.
   * @returns Agent log, or null if not found.
   */
  async loadNodeLogs(featureId: string, nodeId: string): Promise<AgentLog | null> {
    const filePath = paths.getNodeLogsPath(this.projectRoot, featureId, nodeId);
    return readJson<AgentLog>(filePath);
  }

  /**
   * Save dev agent session.
   */
  async saveTaskSession(featureId: string, taskId: string, session: DevAgentSession): Promise<void> {
    const filePath = paths.getTaskSessionPath(this.projectRoot, featureId, taskId);
    await writeJson(filePath, session);
  }

  /**
   * Load dev agent session.
   * @returns Session, or null if not found.
   */
  async loadTaskSession(featureId: string, taskId: string): Promise<DevAgentSession | null> {
    const filePath = paths.getTaskSessionPath(this.projectRoot, featureId, taskId);
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
    const { sep } = await import('path');
    const nodesDir = paths.getNodeDir(this.projectRoot, featureId, '').replace(/[/\\]$/, '');
    // nodesDir ends with /nodes/{empty}, so go up to /nodes
    const nodesDirPath = nodesDir.substring(0, nodesDir.lastIndexOf(sep));
    try {
      const entries = await fs.readdir(nodesDirPath, { withFileTypes: true });
      const taskIds: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionPath = paths.getTaskSessionPath(this.projectRoot, featureId, entry.name);
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
    const nodeDir = paths.getNodeDir(this.projectRoot, featureId, nodeId);
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
   * List all feature IDs in the worktrees directory.
   * Only includes directories that have a valid feature.json.
   */
  async listFeatures(): Promise<string[]> {
    const worktreesDir = paths.getWorktreesDir(this.projectRoot);
    try {
      const entries = await fs.readdir(worktreesDir, { withFileTypes: true });
      const featureIds: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featurePath = paths.getFeaturePath(this.projectRoot, entry.name);
          if (await exists(featurePath)) {
            featureIds.push(entry.name);
          }
        }
      }
      return featureIds;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Save an attachment file for a feature.
   * Stores in .dagent-worktrees/{featureId}/.dagent/attachments/
   * @param featureId - Feature ID
   * @param fileName - Original file name
   * @param fileBuffer - File data as Buffer
   * @returns Relative path: attachments/{fileName}
   */
  async saveAttachment(featureId: string, fileName: string, fileBuffer: Buffer): Promise<string> {
    const attachmentsDir = path.join(paths.getFeatureDir(this.projectRoot, featureId), 'attachments');
    await fs.mkdir(attachmentsDir, { recursive: true });

    const filePath = path.join(attachmentsDir, fileName);
    await fs.writeFile(filePath, fileBuffer);

    return `attachments/${fileName}`;
  }

  /**
   * List all attachments for a feature.
   * @param featureId - Feature ID
   * @returns Array of attachment relative paths
   */
  async listAttachments(featureId: string): Promise<string[]> {
    const attachmentsDir = path.join(paths.getFeatureDir(this.projectRoot, featureId), 'attachments');
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
   * @param featureId - Feature ID
   * @param attachmentPath - Relative path like "attachments/filename.png"
   */
  async deleteAttachment(featureId: string, attachmentPath: string): Promise<void> {
    const featureDir = paths.getFeatureDir(this.projectRoot, featureId);
    const fullPath = path.join(featureDir, attachmentPath);

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
    const feature = await this.loadFeature(featureId);
    if (feature && feature.attachments) {
      feature.attachments = feature.attachments.filter(a => a !== attachmentPath);
      if (feature.attachments.length === 0) {
        feature.attachments = undefined;
      }
      await this.saveFeature(feature);
    }
  }
}
