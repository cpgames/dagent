import { create } from 'zustand';
import type { Feature, FeatureStatus, WorktreeId } from '@shared/types';
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
  createFeature: (name: string, options?: {description?: string, attachments?: string[], autoStart?: boolean, worktreeId?: WorktreeId}) => Promise<Feature | null>;
  deleteFeature: (featureId: string, deleteBranch?: boolean) => Promise<boolean>;
  updateFeatureStatus: (featureId: string, newStatus: FeatureStatus) => Promise<boolean>;
}

// Track the cleanup functions for event listeners
let statusChangeCleanup: (() => void) | null = null;
let managerAssignedCleanup: (() => void) | null = null;
let featureCreatedCleanup: (() => void) | null = null;

/**
 * Subscribe to feature status changes from the orchestrator.
 * Call this when the app initializes to enable real-time Kanban updates.
 */
export function subscribeToFeatureStatusChanges(): void {
  // Avoid duplicate subscriptions
  if (statusChangeCleanup) {
    return;
  }

  statusChangeCleanup = window.electronAPI.feature.onStatusChanged(async (data) => {
    const store = useFeatureStore.getState();
    // Reload the full feature from backend to get all updated fields (branch, worktreePath, etc.)
    const updatedFeature = await window.electronAPI.storage.loadFeature(data.featureId);
    if (updatedFeature) {
      store.updateFeature(data.featureId, updatedFeature);
    } else {
      store.loadFeatures();
    }
  });

  // Subscribe to worktree assignment events to update the worktree badge
  managerAssignedCleanup = window.electronAPI.feature.onManagerAssigned((data) => {
    // Map featureManagerId to worktreeId
    const worktreeIdMap = { 1: 'neon', 2: 'cyber', 3: 'pulse' } as const;
    const worktreeId = worktreeIdMap[data.featureManagerId as 1 | 2 | 3] || undefined;
    const store = useFeatureStore.getState();
    const existingFeature = store.features.find(f => f.id === data.featureId);
    if (existingFeature) {
      store.updateFeature(data.featureId, {
        worktreeId: worktreeId as 'neon' | 'cyber' | 'pulse' | undefined
      });
    } else {
      store.loadFeatures();
    }
  });

  // Subscribe to feature created events (from Project Agent or other sources)
  featureCreatedCleanup = window.electronAPI.feature.onCreated(async (data) => {
    const store = useFeatureStore.getState();
    // Load the newly created feature and add it to the store
    const feature = await window.electronAPI.storage.loadFeature(data.featureId);
    if (feature) {
      // Only add if not already in store (avoid duplicates from UI creation path)
      const existing = store.features.find(f => f.id === data.featureId);
      if (!existing) {
        store.addFeature(feature);
      }
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
  if (featureCreatedCleanup) {
    featureCreatedCleanup();
    featureCreatedCleanup = null;
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

      if (featureIds) {
        for (const id of featureIds) {
          const feature = await window.electronAPI.storage.loadFeature(id);
          if (feature) {
            features.push(feature);
          }
        }
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
