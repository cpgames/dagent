import { create } from 'zustand';
import type { Feature, FeatureStatus } from '@shared/types';
import { toast } from './toast-store';

interface FeatureState {
  features: Feature[];
  activeFeatureId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setFeatures: (features: Feature[]) => void;
  setActiveFeature: (featureId: string | null) => void;
  addFeature: (feature: Feature) => void;
  updateFeature: (featureId: string, updates: Partial<Feature>) => void;
  removeFeature: (featureId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Async actions (call IPC)
  loadFeatures: () => Promise<void>;
  saveFeature: (feature: Feature) => Promise<void>;
  createFeature: (name: string) => Promise<Feature | null>;
  deleteFeature: (featureId: string, deleteBranch?: boolean) => Promise<boolean>;
}

// Track the cleanup function for status change listener
let statusChangeCleanup: (() => void) | null = null;

/**
 * Subscribe to feature status changes from the orchestrator.
 * Call this when the app initializes to enable real-time Kanban updates.
 */
export function subscribeToFeatureStatusChanges(): void {
  // Avoid duplicate subscriptions
  if (statusChangeCleanup) {
    return;
  }

  statusChangeCleanup = window.electronAPI.feature.onStatusChanged((data) => {
    const store = useFeatureStore.getState();
    store.updateFeature(data.featureId, { status: data.status as FeatureStatus });
    console.log(`[FeatureStore] Status changed for ${data.featureId}: ${data.status}`);
  });
}

/**
 * Unsubscribe from feature status changes.
 * Call this when cleaning up (e.g., changing projects).
 */
export function unsubscribeFromFeatureStatusChanges(): void {
  if (statusChangeCleanup) {
    statusChangeCleanup();
    statusChangeCleanup = null;
  }
}

export const useFeatureStore = create<FeatureState>((set, get) => ({
  features: [],
  activeFeatureId: null,
  isLoading: false,
  error: null,

  setFeatures: (features) => set({ features }),
  setActiveFeature: (featureId) => set({ activeFeatureId: featureId }),
  addFeature: (feature) => set((state) => ({
    features: [...state.features, feature]
  })),
  updateFeature: (featureId, updates) => set((state) => ({
    features: state.features.map((f) =>
      f.id === featureId ? { ...f, ...updates, updatedAt: new Date().toISOString() } : f
    ),
  })),
  removeFeature: (featureId) => set((state) => ({
    features: state.features.filter((f) => f.id !== featureId),
    activeFeatureId: state.activeFeatureId === featureId ? null : state.activeFeatureId,
  })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  loadFeatures: async () => {
    set({ isLoading: true, error: null });
    try {
      const featureIds = await window.electronAPI.storage.listFeatures();
      const features: Feature[] = [];
      for (const id of featureIds) {
        const feature = await window.electronAPI.storage.loadFeature(id);
        if (feature) features.push(feature);
      }
      set({ features, isLoading: false });
    } catch (error) {
      const message = (error as Error).message;
      set({ error: message, isLoading: false });
      toast.error(`Failed to load features: ${message}`);
      console.error('Failed to load features:', error);
    }
  },

  saveFeature: async (feature) => {
    try {
      await window.electronAPI.storage.saveFeature(feature);
      get().updateFeature(feature.id, feature);
    } catch (error) {
      const message = (error as Error).message;
      set({ error: message });
      toast.error(`Failed to save feature: ${message}`);
      console.error('Failed to save feature:', error);
    }
  },

  createFeature: async (name) => {
    set({ isLoading: true, error: null });
    try {
      // Create feature record in storage
      const feature = await window.electronAPI.storage.createFeature(name);

      // Attempt to create git worktree (non-blocking failure)
      try {
        await window.electronAPI.git.createFeatureWorktree(feature.id);
      } catch (worktreeError) {
        console.warn('Failed to create worktree:', worktreeError);
        toast.warning('Feature created but git worktree setup failed');
      }

      // Add to local state
      get().addFeature(feature);

      // Show success toast
      toast.success(`Feature '${name}' created`);

      set({ isLoading: false });
      return feature;
    } catch (error) {
      const message = (error as Error).message;
      set({ error: message, isLoading: false });
      toast.error(`Failed to create feature: ${message}`);
      console.error('Failed to create feature:', error);
      return null;
    }
  },

  deleteFeature: async (featureId, deleteBranch = true) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.feature.delete(featureId, { deleteBranch });

      if (result.success) {
        // Remove from local state
        get().removeFeature(featureId);

        // Show success toast with details
        const details: string[] = [];
        if (result.deletedWorktrees && result.deletedWorktrees > 0) {
          details.push(`${result.deletedWorktrees} worktree(s)`);
        }
        if (result.deletedBranch) {
          details.push('branch');
        }
        if (result.terminatedAgents && result.terminatedAgents > 0) {
          details.push(`${result.terminatedAgents} agent(s)`);
        }

        const detailsStr = details.length > 0 ? ` (cleaned up ${details.join(', ')})` : '';
        toast.success(`Feature deleted${detailsStr}`);

        set({ isLoading: false });
        return true;
      } else {
        const message = result.error || 'Unknown error';
        set({ error: message, isLoading: false });
        toast.error(`Failed to delete feature: ${message}`);
        console.error('Failed to delete feature:', result.error);
        return false;
      }
    } catch (error) {
      const message = (error as Error).message;
      set({ error: message, isLoading: false });
      toast.error(`Failed to delete feature: ${message}`);
      console.error('Failed to delete feature:', error);
      return false;
    }
  },
}));
