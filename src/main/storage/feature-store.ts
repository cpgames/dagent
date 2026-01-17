import type { Feature, DAGGraph, ChatHistory, AgentLog, DevAgentSession, DevAgentMessage } from '@shared/types';
import { readJson, writeJson, exists } from './json-store';
import * as paths from './paths';
import { promises as fs } from 'fs';
import path from 'path';
import { getFeatureBranchName } from '../git/types';

/**
 * Storage service for feature data.
 * Manages reading/writing to .dagent directory structure.
 */
export class FeatureStore {
  constructor(private projectRoot: string) {}

  /**
   * Create a new feature with generated ID and branch name.
   * @param name - Human-readable feature name (e.g., "My Feature")
   * @returns Created Feature object
   */
  async createFeature(name: string): Promise<Feature> {
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
      updatedAt: now
    };

    // Persist to storage
    await this.saveFeature(feature);

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
   * Save feature-level chat history.
   */
  async saveChat(featureId: string, chat: ChatHistory): Promise<void> {
    const filePath = paths.getChatPath(this.projectRoot, featureId);
    await writeJson(filePath, chat);
  }

  /**
   * Load feature-level chat history.
   * @returns Chat history, or null if not found.
   */
  async loadChat(featureId: string): Promise<ChatHistory | null> {
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
   */
  async saveNodeChat(featureId: string, nodeId: string, chat: ChatHistory): Promise<void> {
    const filePath = paths.getNodeChatPath(this.projectRoot, featureId, nodeId);
    await writeJson(filePath, chat);
  }

  /**
   * Load node-specific chat history.
   * @returns Chat history, or null if not found.
   */
  async loadNodeChat(featureId: string, nodeId: string): Promise<ChatHistory | null> {
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
}
