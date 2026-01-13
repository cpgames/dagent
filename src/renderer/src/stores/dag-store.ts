import { create } from 'zustand';
import type { DAGGraph, Task, Connection } from '@shared/types';

interface DAGState {
  // Current DAG (for active feature)
  dag: DAGGraph | null;
  isLoading: boolean;
  error: string | null;

  // Selection state
  selectedNodeId: string | null;

  // Actions
  setDag: (dag: DAGGraph | null) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Node operations
  addNode: (node: Task) => void;
  updateNode: (nodeId: string, updates: Partial<Task>) => void;
  removeNode: (nodeId: string) => void;

  // Connection operations
  addConnection: (connection: Connection) => void;
  removeConnection: (from: string, to: string) => void;

  // Async actions
  loadDag: (featureId: string) => Promise<void>;
  saveDag: (featureId: string) => Promise<void>;
}

export const useDAGStore = create<DAGState>((set, get) => ({
  dag: null,
  isLoading: false,
  error: null,
  selectedNodeId: null,

  setDag: (dag) => set({ dag }),
  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  addNode: (node) => set((state) => {
    if (!state.dag) return state;
    return {
      dag: {
        ...state.dag,
        nodes: [...state.dag.nodes, node],
      },
    };
  }),

  updateNode: (nodeId, updates) => set((state) => {
    if (!state.dag) return state;
    return {
      dag: {
        ...state.dag,
        nodes: state.dag.nodes.map((n) =>
          n.id === nodeId ? { ...n, ...updates } : n
        ),
      },
    };
  }),

  removeNode: (nodeId) => set((state) => {
    if (!state.dag) return state;
    return {
      dag: {
        nodes: state.dag.nodes.filter((n) => n.id !== nodeId),
        connections: state.dag.connections.filter(
          (c) => c.from !== nodeId && c.to !== nodeId
        ),
      },
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
    };
  }),

  addConnection: (connection) => set((state) => {
    if (!state.dag) return state;
    // Check if connection already exists
    const exists = state.dag.connections.some(
      (c) => c.from === connection.from && c.to === connection.to
    );
    if (exists) return state;
    return {
      dag: {
        ...state.dag,
        connections: [...state.dag.connections, connection],
      },
    };
  }),

  removeConnection: (from, to) => set((state) => {
    if (!state.dag) return state;
    return {
      dag: {
        ...state.dag,
        connections: state.dag.connections.filter(
          (c) => !(c.from === from && c.to === to)
        ),
      },
    };
  }),

  loadDag: async (featureId) => {
    set({ isLoading: true, error: null });
    try {
      const dag = await window.electronAPI.storage.loadDag(featureId);
      set({ dag: dag || { nodes: [], connections: [] }, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  saveDag: async (featureId) => {
    const { dag } = get();
    if (!dag) return;
    try {
      await window.electronAPI.storage.saveDag(featureId, dag);
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },
}));
