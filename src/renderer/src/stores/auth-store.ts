import { create } from 'zustand';
import type { AuthState } from '@shared/types';

/**
 * SDK availability status for Claude Agent SDK.
 */
export interface SDKStatus {
  available: boolean;
  claudeCodeInstalled: boolean;
  hasCredentials: boolean;
  message: string;
}

interface AuthStoreState {
  state: AuthState;
  sdkStatus: SDKStatus | null;
  isLoading: boolean;

  // Actions
  initialize: () => Promise<void>;
  checkSDK: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  setCredentials: (type: 'oauth' | 'api_key', value: string) => Promise<void>;
  clearCredentials: () => Promise<void>;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  state: {
    authenticated: false,
    credentials: null,
    error: null
  },
  sdkStatus: null,
  isLoading: true,

  initialize: async () => {
    set({ isLoading: true });
    try {
      // Check SDK first
      const sdkStatus = await window.electronAPI.auth.getSDKStatus();
      set({ sdkStatus });

      // If SDK available, we're effectively authenticated
      if (sdkStatus.available) {
        set({
          state: {
            authenticated: true,
            credentials: { type: 'sdk', value: '', source: 'Claude Agent SDK' },
            error: null
          },
          isLoading: false
        });
      } else {
        // Fall back to manual auth check
        const state = await window.electronAPI.auth.initialize();
        set({ state, isLoading: false });
      }
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

  checkSDK: async () => {
    const sdkStatus = await window.electronAPI.auth.getSDKStatus();
    set({ sdkStatus });

    // Update auth state based on SDK status
    if (sdkStatus.available) {
      set({
        state: {
          authenticated: true,
          credentials: { type: 'sdk', value: '', source: 'Claude Agent SDK' },
          error: null
        }
      });
    }
  },

  refreshAuth: async () => {
    set({ isLoading: true });
    try {
      // Also refresh SDK status
      const sdkStatus = await window.electronAPI.auth.getSDKStatus();
      set({ sdkStatus });

      if (sdkStatus.available) {
        set({
          state: {
            authenticated: true,
            credentials: { type: 'sdk', value: '', source: 'Claude Agent SDK' },
            error: null
          },
          isLoading: false
        });
      } else {
        const state = await window.electronAPI.auth.initialize();
        set({ state, isLoading: false });
      }
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

  clearCredentials: async () => {
    set({ isLoading: true });
    try {
      const state = await window.electronAPI.auth.clearCredentials();
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
  }
}));
