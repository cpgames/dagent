import { create } from 'zustand';

/**
 * Available view types for the main application layout.
 */
export type ViewType = 'kanban' | 'dag' | 'context' | 'agents' | 'worktrees';

/**
 * Callback type for confirming discard of unsaved changes.
 * Returns a promise that resolves to true if discard is confirmed.
 */
export type ConfirmDiscardCallback = () => Promise<boolean>;

interface ViewState {
  activeView: ViewType;
  /** Tracks whether the context view has unsaved changes */
  contextViewDirty: boolean;
  /** Optional callback to confirm discarding changes before view switch */
  confirmDiscardCallback: ConfirmDiscardCallback | null;

  // Actions
  setView: (view: ViewType) => void;
  setContextViewDirty: (dirty: boolean) => void;
  setConfirmDiscardCallback: (callback: ConfirmDiscardCallback | null) => void;
  /** Attempt to switch view, checking for unsaved changes first */
  requestViewChange: (view: ViewType) => Promise<void>;
}

/**
 * Zustand store for managing the active view in the application.
 * Controls which main view (Kanban, DAG, Context, or Agents) is currently displayed.
 * Also tracks dirty state for context view to warn before losing changes.
 */
export const useViewStore = create<ViewState>((set, get) => ({
  activeView: 'kanban',
  contextViewDirty: false,
  confirmDiscardCallback: null,

  setView: (view) => set({ activeView: view }),

  setContextViewDirty: (dirty) => set({ contextViewDirty: dirty }),

  setConfirmDiscardCallback: (callback) => set({ confirmDiscardCallback: callback }),

  requestViewChange: async (view) => {
    const { activeView, contextViewDirty, confirmDiscardCallback } = get();

    // Only check dirty state when leaving context view
    if (activeView === 'context' && contextViewDirty && confirmDiscardCallback) {
      const confirmed = await confirmDiscardCallback();
      if (!confirmed) {
        return; // User cancelled, don't switch
      }
    }

    set({ activeView: view });
  },
}));
