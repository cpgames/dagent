import { ipcMain } from 'electron';
import { FeatureStore } from '../storage/feature-store';
import { initializeLayoutStore } from '../storage/dag-layout-store';
import type { Feature, DAGGraph, ChatHistory, AgentLog } from '@shared/types';

let featureStore: FeatureStore | null = null;
let currentProjectRoot: string | null = null;

/**
 * Initialize the storage layer with a project root.
 * Must be called before any storage handlers can be used.
 */
export function initializeStorage(projectRoot: string): void {
  featureStore = new FeatureStore(projectRoot);
  currentProjectRoot = projectRoot;
  // Initialize layout store alongside feature store
  initializeLayoutStore(projectRoot);
}

/**
 * Get the current feature store instance.
 * Returns null if storage not initialized (for optional use).
 */
export function getFeatureStore(): FeatureStore | null {
  return featureStore;
}

/**
 * Get the current project root.
 * Returns null if storage not initialized.
 */
export function getProjectRoot(): string | null {
  return currentProjectRoot;
}

/**
 * Get the current feature store instance.
 * @throws Error if storage not initialized.
 */
function getStore(): FeatureStore {
  if (!featureStore) {
    throw new Error('Storage not initialized. Call initializeStorage first.');
  }
  return featureStore;
}

/**
 * Register all storage-related IPC handlers.
 * Handles CRUD operations for features, DAGs, chats, and logs.
 */
export function registerStorageHandlers(): void {
  // Feature operations
  ipcMain.handle('storage:saveFeature', async (_event, feature: Feature) => {
    await getStore().saveFeature(feature);
    return true;
  });

  ipcMain.handle('storage:loadFeature', async (_event, featureId: string) => {
    return getStore().loadFeature(featureId);
  });

  ipcMain.handle('storage:deleteFeature', async (_event, featureId: string) => {
    return getStore().deleteFeature(featureId);
  });

  ipcMain.handle('storage:listFeatures', async () => {
    return getStore().listFeatures();
  });

  ipcMain.handle('storage:createFeature', async (_event, name: string) => {
    return getStore().createFeature(name);
  });

  ipcMain.handle('storage:featureExists', async (_event, name: string) => {
    const features = await getStore().listFeatures();
    for (const featureId of features) {
      const feature = await getStore().loadFeature(featureId);
      if (feature && feature.name === name) {
        return true;
      }
    }
    return false;
  });

  // DAG operations
  ipcMain.handle('storage:saveDag', async (_event, featureId: string, dag: DAGGraph) => {
    await getStore().saveDag(featureId, dag);
    return true;
  });

  ipcMain.handle('storage:loadDag', async (_event, featureId: string) => {
    return getStore().loadDag(featureId);
  });

  // Feature-level chat operations
  ipcMain.handle('storage:saveChat', async (_event, featureId: string, chat: ChatHistory) => {
    await getStore().saveChat(featureId, chat);
    return true;
  });

  ipcMain.handle('storage:loadChat', async (_event, featureId: string) => {
    return getStore().loadChat(featureId);
  });

  // Harness log operations
  ipcMain.handle(
    'storage:saveHarnessLog',
    async (_event, featureId: string, log: AgentLog) => {
      await getStore().saveHarnessLog(featureId, log);
      return true;
    }
  );

  ipcMain.handle('storage:loadHarnessLog', async (_event, featureId: string) => {
    return getStore().loadHarnessLog(featureId);
  });

  // Node chat operations
  ipcMain.handle(
    'storage:saveNodeChat',
    async (_event, featureId: string, nodeId: string, chat: ChatHistory) => {
      await getStore().saveNodeChat(featureId, nodeId, chat);
      return true;
    }
  );

  ipcMain.handle(
    'storage:loadNodeChat',
    async (_event, featureId: string, nodeId: string) => {
      return getStore().loadNodeChat(featureId, nodeId);
    }
  );

  // Node logs operations
  ipcMain.handle(
    'storage:saveNodeLogs',
    async (_event, featureId: string, nodeId: string, log: AgentLog) => {
      await getStore().saveNodeLogs(featureId, nodeId, log);
      return true;
    }
  );

  ipcMain.handle(
    'storage:loadNodeLogs',
    async (_event, featureId: string, nodeId: string) => {
      return getStore().loadNodeLogs(featureId, nodeId);
    }
  );

  // Node deletion
  ipcMain.handle(
    'storage:deleteNode',
    async (_event, featureId: string, nodeId: string) => {
      return getStore().deleteNode(featureId, nodeId);
    }
  );

  // Task session operations
  ipcMain.handle(
    'storage:loadTaskSession',
    async (_event, featureId: string, taskId: string) => {
      return getStore().loadTaskSession(featureId, taskId);
    }
  );

  ipcMain.handle('storage:listTaskSessions', async (_event, featureId: string) => {
    return getStore().listTaskSessions(featureId);
  });
}
