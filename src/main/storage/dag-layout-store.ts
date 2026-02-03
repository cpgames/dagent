import path from 'path';
import { promises as fs } from 'fs';
import { readJson, writeJson, exists } from './json-store';
import * as paths from './paths';
import type { FeatureStore } from './feature-store';

/**
 * Layout data structure.
 * Stores node positions for a specific feature.
 */
export interface LayoutData {
  featureId: string;
  positions: Record<string, { x: number; y: number }>;
  updatedAt: string;
}

/**
 * Storage service for DAG layout persistence.
 * Layouts are stored inside each feature's directory (layout.json).
 */
export class LayoutStore {
  private projectRoot: string;
  private featureStore: FeatureStore;

  constructor(projectRoot: string, featureStore: FeatureStore) {
    this.projectRoot = projectRoot;
    this.featureStore = featureStore;
  }

  /**
   * Save layout positions for a feature.
   * @param featureId - Feature identifier
   * @param positions - Record of taskId -> {x, y} positions
   */
  async saveLayout(featureId: string, positions: Record<string, { x: number; y: number }>): Promise<void> {
    const layoutData: LayoutData = {
      featureId,
      positions,
      updatedAt: new Date().toISOString()
    };

    const filePath = await this.getLayoutPath(featureId);
    if (filePath) {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await writeJson(filePath, layoutData);
    }
  }

  /**
   * Load layout positions for a feature.
   * @param featureId - Feature identifier
   * @returns Layout data if found, null otherwise
   */
  async loadLayout(featureId: string): Promise<LayoutData | null> {
    const filePath = await this.getLayoutPath(featureId);
    if (filePath && await exists(filePath)) {
      return readJson<LayoutData>(filePath);
    }
    return null;
  }

  /**
   * Delete layout data for a feature.
   * @param featureId - Feature identifier
   * @returns true if deleted, false if not found
   */
  async deleteLayout(featureId: string): Promise<boolean> {
    const filePath = await this.getLayoutPath(featureId);
    if (!filePath) return false;

    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get the file path for a feature's layout based on feature status/location.
   * Returns null if feature not found.
   */
  private async getLayoutPath(featureId: string): Promise<string | null> {
    const feature = await this.featureStore.loadFeature(featureId);
    if (!feature) return null;

    if (feature.status === 'backlog') {
      return path.join(paths.getBacklogFeatureDir(this.projectRoot, featureId), 'layout.json');
    } else if (feature.status === 'archived') {
      return path.join(paths.getArchivedFeatureDir(this.projectRoot, featureId), 'layout.json');
    } else if (feature.worktreePath) {
      return path.join(paths.getFeatureDirInWorktree(feature.worktreePath, featureId), 'layout.json');
    }

    // Fallback to backlog location
    return path.join(paths.getBacklogFeatureDir(this.projectRoot, featureId), 'layout.json');
  }
}

/**
 * Singleton layout store instance.
 * Initialized when project root is set.
 */
let layoutStore: LayoutStore | null = null;

/**
 * Initialize layout store with project root and feature store.
 * Called from storage-handlers when project is loaded.
 */
export function initializeLayoutStore(projectRoot: string, featureStore: FeatureStore): void {
  layoutStore = new LayoutStore(projectRoot, featureStore);
}

/**
 * Get the current layout store instance.
 * @throws Error if not initialized
 */
export function getLayoutStore(): LayoutStore {
  if (!layoutStore) {
    throw new Error('LayoutStore not initialized. Call initializeLayoutStore first.');
  }
  return layoutStore;
}
