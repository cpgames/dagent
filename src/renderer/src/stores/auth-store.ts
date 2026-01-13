import { create } from 'zustand';
import type { AuthState } from '@shared/types';

interface AuthStoreState {
  state: AuthState;
  isLoading: boolean;

  // Actions
  initialize: () => Promise<void>;
  setCredentials: (type: 'oauth' | 'api_key', value: string) => Promise<void>;
  clearCredentials: () => Promise<void>;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  state: {
    authenticated: false,
    credentials: null,
    error: null
  },
  isLoading: true,

  initialize: async () => {
    set({ isLoading: true });
    try {
      const state = await window.electronAPI.auth.initialize();
      set({ state, isLoading: false });
    } catch (error) {
      set({
        state: {
          authenticated: false,
          credentials: null,
          error: String(error)
        },
        isLoading: false
      });
    }
  },

  setCredentials: async (type, value) => {
    set({ isLoading: true });
    try {
      const state = await window.electronAPI.auth.setCredentials(type, value);
      set({ state, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
    }
  },

  clearCredentials: async () => {
    const state = await window.electronAPI.auth.clearCredentials();
    set({ state });
  }
}));
