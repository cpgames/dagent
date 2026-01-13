import { create } from 'zustand';

/**
 * Available view types for the main application layout.
 */
export type ViewType = 'kanban' | 'dag' | 'context';

interface ViewState {
  activeView: ViewType;

  // Actions
  setView: (view: ViewType) => void;
}

/**
 * Zustand store for managing the active view in the application.
 * Controls which main view (Kanban, DAG, or Context) is currently displayed.
 */
export const useViewStore = create<ViewState>((set) => ({
  activeView: 'kanban',

  setView: (view) => set({ activeView: view }),
}));
