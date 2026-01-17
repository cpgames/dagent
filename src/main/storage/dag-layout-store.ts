import path from 'path';
import { promises as fs } from 'fs';
import { readJson, writeJson } from './json-store';

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
 * Manages saving/loading node positions to avoid auto-layout on every load.
 */
export class LayoutStore {
  private layoutsDir: string;

  constructor(projectRoot: string) {
    // Layouts are stored in {projectRoot}/.dagent/layouts/
    this.layoutsDir = path.join(projectRoot, '.dagent', 'layouts');
  }

  /**
   * Save layout positions for a feature.
   * @param featureId - Feature identifier
   * @param positions - Record of taskId -> {x, y} positions
   */
  async saveLayout(featureId: string, positions: Record<string, { x: number; y: number }>): Promise<void> {
    // Ensure layouts directory exists
    await this.ensureLayoutsDir();

    const layoutData: LayoutData = {
      featureId,
      positions,
      updatedAt: new Date().toISOString()
    };

    const filePath = this.getLayoutPath(featureId);
    await writeJson(filePath, layoutData);
  }

  /**
   * Load layout positions for a feature.
   * @param featureId - Feature identifier
   * @returns Layout data if found, null otherwise
   */
  async loadLayout(featureId: string): Promise<LayoutData | null> {
    const filePath = this.getLayoutPath(featureId);
    return readJson<LayoutData>(filePath);
  }

  /**
   * Delete layout data for a feature.
   * @param featureId - Feature identifier
   * @returns true if deleted, false if not found
   */
  async deleteLayout(featureId: string): Promise<boolean> {
    const filePath = this.getLayoutPath(featureId);
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
   * Get the file path for a feature's layout.
   */
  private getLayoutPath(featureId: string): string {
    return path.join(this.layoutsDir, `${featureId}.json`);
  }

  /**
   * Ensure layouts directory exists.
   */
  private async ensureLayoutsDir(): Promise<void> {
    await fs.mkdir(this.layoutsDir, { recursive: true });
  }
}

/**
 * Singleton layout store instance.
 * Initialized when project root is set.
 */
let layoutStore: LayoutStore | null = null;

/**
 * Initialize layout store with project root.
 * Called from storage-handlers when project is loaded.
 */
export function initializeLayoutStore(projectRoot: string): void {
  layoutStore = new LayoutStore(projectRoot);
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
