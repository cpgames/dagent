import { EventEmitter } from 'events';
import type { Task, TaskPosition } from '@shared/types/task';
import type { DAGGraph } from '@shared/types/dag';
import type { Connection } from '@shared/types/connection';
import { FeatureStore } from '../storage/feature-store';
import { validateConnection } from './dag-validation';
import type { DAGManagerConfig, DAGEvent } from './dag-api-types';
import { randomUUID } from 'crypto';
import { computeAutoLayout } from './dag-auto-layout';
import { getTaskDependencies } from './topological-sort';
import { getLayoutStore } from '../storage/dag-layout-store';

/**
 * Centralized DAG operations manager.
 * Provides single source of truth for all graph mutations with validation and event emission.
 */
export class DAGManager extends EventEmitter {
  private graph: DAGGraph;
  private featureStore: FeatureStore;
  private config: DAGManagerConfig;

  constructor(config: DAGManagerConfig, initialGraph?: DAGGraph) {
    super();
    this.config = config;
    this.featureStore = new FeatureStore(config.projectRoot);
    this.graph = initialGraph || { nodes: [], connections: [] };
  }

  /**
   * Initialize DAGManager by loading graph from storage.
   * @returns DAGManager instance
   */
  static async create(config: DAGManagerConfig): Promise<DAGManager> {
    const store = new FeatureStore(config.projectRoot);
    const graph = await store.loadDag(config.featureId);
    return new DAGManager(config, graph || undefined);
  }

  /**
   * Add a new node to the graph.
   * Generates ID if not provided, sets default position.
   *
   * @param task - Partial task data (id is optional)
   * @returns Created task
   */
  async addNode(task: Partial<Task>): Promise<Task> {
    const newTask: Task = {
      id: task.id || `task-${randomUUID()}`,
      title: task.title || 'New Task',
      spec: task.spec || '',
      status: task.status || 'ready',
      blocked: task.blocked ?? false,
      position: task.position || { x: 0, y: 0 },
      dependencies: task.dependencies || [],
      qaFeedback: task.qaFeedback,
      assignedAgentId: task.assignedAgentId
    };

    this.graph.nodes.push(newTask);
    console.log(`[DAGManager.addNode] Emitting node-added for ${newTask.id} (${newTask.title})`);
    this.emit('node-added', { type: 'node-added', node: newTask } as DAGEvent);

    if (this.config.autoSave) {
      await this.save();
    }

    return newTask;
  }

  /**
   * Remove a node from the graph.
   * Also removes all connections involving this node.
   *
   * @param nodeId - Node ID to remove
   */
  async removeNode(nodeId: string): Promise<void> {
    // Check if node exists
    const nodeIndex = this.graph.nodes.findIndex((n) => n.id === nodeId);
    if (nodeIndex === -1) {
      console.warn(`DAGManager: Cannot remove node "${nodeId}" - not found`);
      return;
    }

    // Remove the node
    this.graph.nodes.splice(nodeIndex, 1);

    // Remove all connections involving this node
    const removedConnections = this.graph.connections.filter(
      (c) => c.from === nodeId || c.to === nodeId
    );
    this.graph.connections = this.graph.connections.filter(
      (c) => c.from !== nodeId && c.to !== nodeId
    );

    // Emit events
    this.emit('node-removed', { type: 'node-removed', nodeId } as DAGEvent);

    // Emit connection-removed events for each removed connection
    for (const conn of removedConnections) {
      const connectionId = `${conn.from}->${conn.to}`;
      this.emit('connection-removed', {
        type: 'connection-removed',
        connectionId
      } as DAGEvent);
    }

    if (this.config.autoSave) {
      await this.save();
    }
  }

  /**
   * Add a connection to the graph.
   * Validates before adding to prevent cycles and invalid connections.
   *
   * @param sourceId - Source node ID
   * @param targetId - Target node ID
   * @returns Created connection, or null if validation failed
   */
  async addConnection(sourceId: string, targetId: string): Promise<Connection | null> {
    // Validate connection
    const validation = validateConnection(this.graph, sourceId, targetId);
    if (!validation.valid) {
      console.warn(`DAGManager: Cannot add connection - ${validation.reason}`);
      return null;
    }

    const connection: Connection = {
      from: sourceId,
      to: targetId
    };

    this.graph.connections.push(connection);
    this.emit('connection-added', {
      type: 'connection-added',
      connection
    } as DAGEvent);

    // Update target task's blocked status based on new dependency
    const targetTask = this.graph.nodes.find(n => n.id === targetId);
    console.log(`[DAGManager.addConnection] Checking blocked for target "${targetId}", found task: ${!!targetTask}`);
    if (targetTask) {
      // Get all dependencies for the target task (including the new one)
      const dependencies = getTaskDependencies(targetId, this.graph.connections);
      console.log(`[DAGManager.addConnection] Target "${targetId}" dependencies: [${dependencies.join(', ')}]`);

      // Check if all dependencies are completed (archived)
      const allMet = dependencies.every(depId => {
        const depTask = this.graph.nodes.find(n => n.id === depId);
        console.log(`[DAGManager.addConnection] Dep "${depId}" status: ${depTask?.status}`);
        return depTask?.status === 'done';
      });

      console.log(`[DAGManager.addConnection] allMet=${allMet}, currentBlocked=${targetTask.blocked}`);

      // If not all dependencies are met, task should be blocked
      if (!allMet && !targetTask.blocked) {
        console.log(`[DAGManager.addConnection] Setting "${targetId}" blocked=true and emitting node-updated`);
        targetTask.blocked = true;
        this.emit('node-updated', {
          type: 'node-updated',
          node: { ...targetTask }
        } as DAGEvent);
      }
    }

    if (this.config.autoSave) {
      await this.save();
    }

    return connection;
  }

  /**
   * Remove a connection from the graph.
   *
   * @param connectionId - Connection ID in format "sourceId->targetId"
   */
  async removeConnection(connectionId: string): Promise<void> {
    // Parse connection ID
    const parts = connectionId.split('->');
    if (parts.length !== 2) {
      console.warn(
        `DAGManager: Invalid connection ID format "${connectionId}" - expected "sourceId->targetId"`
      );
      return;
    }

    const [sourceId, targetId] = parts;

    // Find and remove connection
    const connectionIndex = this.graph.connections.findIndex(
      (c) => c.from === sourceId && c.to === targetId
    );

    if (connectionIndex === -1) {
      console.warn(
        `DAGManager: Cannot remove connection "${connectionId}" - not found`
      );
      return;
    }

    this.graph.connections.splice(connectionIndex, 1);
    this.emit('connection-removed', {
      type: 'connection-removed',
      connectionId
    } as DAGEvent);

    // Update target task's blocked status - may become unblocked
    const targetTask = this.graph.nodes.find(n => n.id === targetId);
    if (targetTask && targetTask.blocked) {
      // Get remaining dependencies for the target task
      const dependencies = getTaskDependencies(targetId, this.graph.connections);

      // Check if all remaining dependencies are completed (archived)
      const allMet = dependencies.length === 0 || dependencies.every(depId => {
        const depTask = this.graph.nodes.find(n => n.id === depId);
        return depTask?.status === 'done';
      });

      // If all dependencies are met, task should be unblocked
      if (allMet) {
        targetTask.blocked = false;
        this.emit('node-updated', {
          type: 'node-updated',
          node: { ...targetTask }
        } as DAGEvent);
      }
    }

    if (this.config.autoSave) {
      await this.save();
    }
  }

  /**
   * Update a node's properties.
   * Only updates provided fields, leaves others unchanged.
   *
   * @param nodeId - Node ID to update
   * @param updates - Partial task properties to update
   * @returns Updated task, or null if not found
   */
  async updateNode(nodeId: string, updates: Partial<Omit<Task, 'id'>>): Promise<Task | null> {
    const node = this.graph.nodes.find((n) => n.id === nodeId);
    if (!node) {
      console.warn(`DAGManager: Cannot update node "${nodeId}" - not found`);
      return null;
    }

    // Apply updates
    if (updates.title !== undefined) node.title = updates.title;
    if (updates.spec !== undefined) node.spec = updates.spec;
    if (updates.status !== undefined) node.status = updates.status;
    if (updates.blocked !== undefined) node.blocked = updates.blocked;
    if (updates.position !== undefined) node.position = updates.position;
    if (updates.dependencies !== undefined) node.dependencies = updates.dependencies;
    if (updates.qaFeedback !== undefined) node.qaFeedback = updates.qaFeedback;
    if (updates.assignedAgentId !== undefined) node.assignedAgentId = updates.assignedAgentId;

    console.log(`[DAGManager.updateNode] Emitting node-updated for ${nodeId}`);
    this.emit('node-updated', { type: 'node-updated', node: { ...node } } as DAGEvent);

    if (this.config.autoSave) {
      await this.save();
    }

    return { ...node };
  }

  /**
   * Move a node to a new position.
   *
   * @param nodeId - Node ID to move
   * @param position - New position coordinates
   */
  async moveNode(nodeId: string, position: TaskPosition): Promise<void> {
    const node = this.graph.nodes.find((n) => n.id === nodeId);
    if (!node) {
      console.warn(`DAGManager: Cannot move node "${nodeId}" - not found`);
      return;
    }

    node.position = position;
    this.emit('node-moved', { type: 'node-moved', nodeId, position } as DAGEvent);

    if (this.config.autoSave) {
      await this.save();
    }
  }

  /**
   * Get a copy of the current graph.
   * Returns a deep copy to prevent external mutations.
   *
   * @returns Copy of current DAG graph
   */
  getGraph(): DAGGraph {
    return {
      nodes: this.graph.nodes.map((n) => ({ ...n, position: { ...n.position } })),
      connections: this.graph.connections.map((c) => ({ ...c }))
    };
  }

  /**
   * Replace the entire graph.
   * Use with caution - this discards all existing nodes and connections.
   *
   * @param graph - New graph to set
   */
  async resetGraph(graph: DAGGraph): Promise<void> {
    console.log(`[DAGManager.resetGraph] Resetting graph with ${graph.nodes.length} nodes`);
    this.graph = {
      nodes: graph.nodes.map((n) => ({ ...n, position: { ...n.position } })),
      connections: graph.connections.map((c) => ({ ...c }))
    };

    console.log(`[DAGManager.resetGraph] Emitting graph-reset event`);
    this.emit('graph-reset', { type: 'graph-reset', graph: this.getGraph() } as DAGEvent);

    if (this.config.autoSave) {
      await this.save();
    }
  }

  /**
   * Persist current graph to storage.
   */
  async save(): Promise<void> {
    await this.featureStore.saveDag(this.config.featureId, this.graph);
  }

  /**
   * Reload graph from storage.
   */
  async reload(): Promise<void> {
    const graph = await this.featureStore.loadDag(this.config.featureId);
    if (graph) {
      this.graph = graph;
      this.emit('graph-reset', {
        type: 'graph-reset',
        graph: this.getGraph()
      } as DAGEvent);
    }
  }

  /**
   * Apply automatic layout to all nodes based on their dependencies.
   * Arranges nodes in a hierarchical tree structure.
   * Preserves user's relative horizontal ordering from saved layout positions.
   */
  async applyAutoLayout(): Promise<void> {
    console.log(`[DAGManager.applyAutoLayout] Computing layout for ${this.graph.nodes.length} nodes`);

    // Load saved layout positions (from user's manual dragging)
    // These positions are used to preserve relative horizontal ordering
    try {
      const layoutStore = getLayoutStore();
      const savedLayout = await layoutStore.loadLayout(this.config.featureId);
      if (savedLayout && savedLayout.positions) {
        // Apply saved positions to graph nodes before computing auto-layout
        // This ensures computeAutoLayout sees the user's current positions
        for (const node of this.graph.nodes) {
          const savedPos = savedLayout.positions[node.id];
          if (savedPos) {
            node.position = savedPos;
          }
        }
        console.log(`[DAGManager.applyAutoLayout] Applied ${Object.keys(savedLayout.positions).length} saved positions`);
      }
    } catch (error) {
      // Layout store may not be initialized yet, continue with graph positions
      console.log(`[DAGManager.applyAutoLayout] Could not load saved layout: ${error}`);
    }

    const positions = computeAutoLayout(this.graph);

    // Update all node positions
    for (const node of this.graph.nodes) {
      const newPos = positions.get(node.id);
      if (newPos) {
        node.position = newPos;
      }
    }

    // Emit graph-reset to notify all listeners of the position changes
    console.log(`[DAGManager.applyAutoLayout] Emitting graph-reset event`);
    this.emit('graph-reset', { type: 'graph-reset', graph: this.getGraph() } as DAGEvent);

    if (this.config.autoSave) {
      await this.save();
    }
    console.log(`[DAGManager.applyAutoLayout] Done`);
  }
}
