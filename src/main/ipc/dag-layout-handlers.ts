import { ipcMain } from 'electron';
import { getLayoutStore } from '../storage/dag-layout-store';

/**
 * Register DAG layout IPC handlers.
 * Handles saving/loading node positions for layout persistence.
 * Note: Layout store is initialized in storage-handlers.ts when project is loaded.
 */
export function registerDAGLayoutHandlers(): void {
  // Save layout positions
  ipcMain.handle(
    'dag-layout:save',
    async (_event, featureId: string, positions: Record<string, { x: number; y: number }>) => {
      try {
        const store = getLayoutStore();
        await store.saveLayout(featureId, positions);
        return { success: true };
      } catch (error) {
        console.error('[DAG Layout] Save failed:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Load layout positions
  ipcMain.handle('dag-layout:load', async (_event, featureId: string) => {
    try {
      const store = getLayoutStore();
      const layout = await store.loadLayout(featureId);
      return { success: true, layout };
    } catch (error) {
      console.error('[DAG Layout] Load failed:', error);
      return { success: false, layout: null, error: (error as Error).message };
    }
  });

  // Delete layout data
  ipcMain.handle('dag-layout:delete', async (_event, featureId: string) => {
    try {
      const store = getLayoutStore();
      const deleted = await store.deleteLayout(featureId);
      return { success: true, deleted };
    } catch (error) {
      console.error('[DAG Layout] Delete failed:', error);
      return { success: false, deleted: false, error: (error as Error).message };
    }
  });
}
