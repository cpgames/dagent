import { create } from 'zustand';
import type { Feature, FeatureStatus, CompletionAction } from '@shared/types';
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
  createFeature: (name: string, options?: {description?: string, attachments?: string[], completionAction?: CompletionAction, autoStart?: boolean}) => Promise<Feature | null>;
  deleteFeature: (featureId: string, deleteBranch?: boolean) => Promise<boolean>;
  updateFeatureStatus: (featureId: string, newStatus: FeatureStatus) => Promise<boolean>;
}

// Track the cleanup functions for event listeners
let statusChangeCleanup: (() => void) | null = null;
let managerAssignedCleanup: (() => void) | null = null;

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
    console.log(`[FeatureStore] Received status change event: ${data.featureId} -> ${data.status}`);
    const store = useFeatureStore.getState();
    const existingFeature = store.features.find(f => f.id === data.featureId);
    if (existingFeature) {
      store.updateFeature(data.featureId, { status: data.status as FeatureStatus });
      console.log(`[FeatureStore] Updated feature ${data.featureId}: ${existingFeature.status} -> ${data.status}`);
    } else {
      console.log(`[FeatureStore] Feature ${data.featureId} not found in store, reloading features...`);
      store.loadFeatures();
    }
  });

  // Subscribe to manager assignment events to update the manager badge
  managerAssignedCleanup = window.electronAPI.feature.onManagerAssigned((data) => {
    console.log(`[FeatureStore] Received manager assigned event: ${data.featureId} -> manager ${data.featureManagerId} (queue ${data.queuePosition})`);
    const store = useFeatureStore.getState();
    const existingFeature = store.features.find(f => f.id === data.featureId);
    if (existingFeature) {
      store.updateFeature(data.featureId, {
        featureManagerId: data.featureManagerId,
        queuePosition: data.queuePosition
      });
      console.log(`[FeatureStore] Updated feature ${data.featureId} with manager ${data.featureManagerId}`);
    } else {
      console.log(`[FeatureStore] Feature ${data.featureId} not found in store, reloading features...`);
      store.loadFeatures();
    }
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
  if (managerAssignedCleanup) {
    managerAssignedCleanup();
    managerAssignedCleanup = null;
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
    console.log('[FeatureStore] loadFeatures called');
    set({ isLoading: true, error: null });
    try {
      console.log('[FeatureStore] Calling listFeatures...');
      const featureIds = await window.electronAPI.storage.listFeatures();
      console.log('[FeatureStore] listFeatures returned:', featureIds, 'type:', typeof featureIds);

      const features: Feature[] = [];
      console.log('[FeatureStore] features array initialized:', Array.isArray(features));

      // Guard against undefined/null featureIds
      if (featureIds) {
        console.log('[FeatureStore] featureIds is truthy, iterating...');
        for (const id of featureIds) {
          console.log('[FeatureStore] Loading feature:', id);
          const feature = await window.electronAPI.storage.loadFeature(id);
          console.log('[FeatureStore] Loaded feature:', feature);
          if (feature) {
            console.log('[FeatureStore] Pushing feature to array...');
            features.push(feature);
            console.log('[FeatureStore] features.length after push:', features.length);
          }
        }
      } else {
        console.log('[FeatureStore] featureIds is falsy, skipping iteration');
      }

      console.log('[FeatureStore] Setting features state with:', features);
      set({ features, isLoading: false });
      console.log('[FeatureStore] loadFeatures completed successfully');
    } catch (error) {
      console.error('[FeatureStore] loadFeatures error:', error);
      console.error('[FeatureStore] Error stack:', (error as Error).stack);
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

  createFeature: async (name, options) => {
    set({ isLoading: true, error: null });
    try {
      // Create feature record in storage
      // Note: This now also creates the git worktree internally (in correct order)
      const feature = await window.electronAPI.storage.createFeature(name, options);

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
    // Don't set isLoading - we just remove the feature from local state
    // Setting isLoading causes full Kanban re-render and scroll reset
    set({ error: null });
    try {
      const result = await window.electronAPI.feature.delete(featureId, { deleteBranch });

      if (result.success) {
        // Remove from local state - this smoothly removes the card
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

        return true;
      } else {
        const message = result.error || 'Unknown error';
        set({ error: message });
        toast.error(`Failed to delete feature: ${message}`);
        console.error('Failed to delete feature:', result.error);
        return false;
      }
    } catch (error) {
      const message = (error as Error).message;
      set({ error: message });
      toast.error(`Failed to delete feature: ${message}`);
      console.error('Failed to delete feature:', error);
      return false;
    }
  },

  updateFeatureStatus: async (featureId, newStatus) => {
    try {
      const result = await window.electronAPI.feature.updateStatus(featureId, newStatus);

      if (result.success) {
        // Update local state
        get().updateFeature(featureId, { status: newStatus });
        toast.success(`Feature status updated to ${newStatus}`);
        return true;
      } else {
        const message = result.error || 'Unknown error';
        set({ error: message });
        toast.error(`Failed to update status: ${message}`);
        console.error('Failed to update feature status:', result.error);
        return false;
      }
    } catch (error) {
      const message = (error as Error).message;
      set({ error: message });
      toast.error(`Failed to update status: ${message}`);
      console.error('Failed to update feature status:', error);
      return false;
    }
  },
}));
