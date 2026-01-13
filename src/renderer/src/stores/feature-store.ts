import { create } from 'zustand';
import type { Feature } from '@shared/types';

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
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  saveFeature: async (feature) => {
    try {
      await window.electronAPI.storage.saveFeature(feature);
      get().updateFeature(feature.id, feature);
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },
}));
