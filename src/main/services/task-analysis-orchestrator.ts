import { randomUUID } from 'crypto'
import type { Task } from '@shared/types'
import type { FeatureStore } from '../storage/feature-store'
import { buildAnalysisPrompt, parseAnalysisResponse } from '../agent/pm-analysis-prompt'
import { getAgentService } from '../agent/agent-service'
import { getFeatureSpecStore } from '../agents/feature-spec-store'
import { getProjectRoot } from '../ipc/storage-handlers'
import { setPMToolsFeatureContext } from '../ipc/pm-tools-handlers'
import { getDAGManager } from '../ipc/dag-handlers'

/**
 * Event types emitted during task analysis.
 * Used by subscribers to track analysis progress.
 */
export type AnalysisEvent =
  | { type: 'analyzing'; taskId: string; taskTitle: string }
  | { type: 'kept'; taskId: string; reason: string }
  | { type: 'split'; taskId: string; newTasks: Task[] }
  | { type: 'complete'; featureId: string; analyzedCount: number; splitCount: number }
  | { type: 'error'; taskId?: string; error: string }

/**
 * New task definition for split operations.
 * Includes dependsOnTitles for dependency resolution by title.
 */
export interface NewTaskDef {
  title: string
  spec: string
  status: 'ready'
  locked: false
  /** Dependency titles (resolved to IDs by createSubtasks) */
  dependsOnTitles?: string[]
}

/**
 * Result of analyzing a single task.
 * - keep: Task is appropriately scoped, no changes needed
 * - split: Task is too complex, should be split into multiple tasks
 */
export interface AnalysisResult {
  decision: 'keep' | 'split'
  reason: string
  /** Refined title (for keep decisions) */
  refinedTitle?: string
  /** Refined spec (for keep decisions) */
  refinedSpec?: string
  /** New tasks to create when decision is 'split' */
  newTasks?: NewTaskDef[]
}

/**
 * TaskAnalysisOrchestrator - Manages the analysis loop for created tasks.
 *
 * Responsibilities:
 * - Find all tasks with 'ready' status
 * - Coordinate PM agent analysis of each task
 * - Track analysis progress via streaming events
 * - Update task graph based on analysis decisions
 *
 * Usage:
 * ```typescript
 * const orchestrator = getTaskAnalysisOrchestrator(featureStore)
 * for await (const event of orchestrator.analyzeFeatureTasks(featureId)) {
 *   console.log(event)
 * }
 * ```
 */
export class TaskAnalysisOrchestrator {
  // Public to allow updating when project switches (see getTaskAnalysisOrchestrator)
  featureStore: FeatureStore

  constructor(featureStore: FeatureStore) {
    this.featureStore = featureStore
  }

  /**
   * Get all tasks with 'ready' status for a feature.
   * Uses DAGManager to ensure event broadcasting is set up.
   * @param featureId - Feature ID to scan
   * @returns Array of tasks needing analysis
   */
  async getPendingTasks(featureId: string): Promise<Task[]> {
    const projectRoot = getProjectRoot()
    if (!projectRoot) {
      console.log(`[TaskAnalysisOrchestrator] getPendingTasks: Project root not initialized`)
      return []
    }

    // Use DAGManager to ensure event broadcasting is set up
    const manager = await getDAGManager(featureId, projectRoot)
    const dag = manager.getGraph()

    console.log(`[TaskAnalysisOrchestrator] getPendingTasks: DAG has ${dag.nodes.length} nodes`)
    dag.nodes.forEach((task, i) => {
      console.log(`[TaskAnalysisOrchestrator]   Node ${i}: ${task.id} status=${task.status}`)
    })

    const pending = dag.nodes.filter((task) => task.status === 'ready')
    console.log(`[TaskAnalysisOrchestrator] getPendingTasks: Found ${pending.length} with created`)
    return pending
  }

  /**
   * Check if a feature has any tasks needing analysis.
   * @param featureId - Feature ID to check
   * @returns true if any created tasks exist
   */
  async hasPendingAnalysis(featureId: string): Promise<boolean> {
    const pendingTasks = await this.getPendingTasks(featureId)
    return pendingTasks.length > 0
  }

  /**
   * Analyze all created tasks for a feature.
   * Loops until no more created tasks remain.
   * Streams events as analysis progresses.
   *
   * @param featureId - Feature ID to analyze
   * @yields AnalysisEvent for each stage of analysis
   */
  async *analyzeFeatureTasks(featureId: string): AsyncGenerator<AnalysisEvent> {
    console.log(`[TaskAnalysisOrchestrator] Starting analysis for feature: ${featureId}`)
    let analyzedCount = 0
    let splitCount = 0

    // Loop until no more created tasks
    while (true) {
      const pendingTasks = await this.getPendingTasks(featureId)
      console.log(`[TaskAnalysisOrchestrator] Found ${pendingTasks.length} pending tasks for ${featureId}`)
      if (pendingTasks.length === 0) {
        console.log(`[TaskAnalysisOrchestrator] No more pending tasks, analysis complete`)
        yield { type: 'complete', featureId, analyzedCount, splitCount }
        return
      }

      // Process first task (new tasks from splits will be picked up in next iteration)
      const task = pendingTasks[0]
      console.log(`[TaskAnalysisOrchestrator] Analyzing task: ${task.id} (${task.title})`)
      yield { type: 'analyzing', taskId: task.id, taskTitle: task.title }

      try {
        console.log(`[TaskAnalysisOrchestrator] Calling analyzeTask for ${task.id}...`)
        const result = await this.analyzeTask(featureId, task.id)
        console.log(`[TaskAnalysisOrchestrator] analyzeTask result for ${task.id}: ${result.decision}`)

        if (result.decision === 'keep') {
          // Transition to ready_for_dev, applying any refined title/spec
          await this.transitionToReady(
            featureId,
            task.id,
            result.refinedTitle,
            result.refinedSpec
          )
          yield { type: 'kept', taskId: task.id, reason: result.reason }
        } else {
          // Create subtasks and remove original
          const newTasks = await this.createSubtasks(featureId, task.id, result.newTasks || [])
          yield { type: 'split', taskId: task.id, newTasks }
          splitCount++
        }
        analyzedCount++
      } catch (error) {
        yield {
          type: 'error',
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error)
        }
        // Continue with next task instead of stopping
      }
    }
  }

  /**
   * Transition a task from created to ready_for_dev or blocked.
   * Sets to 'blocked' if dependencies are not complete, otherwise 'ready_for_dev'.
   * Optionally updates the task's title and spec with refined versions.
   * Uses DAGManager for real-time event broadcasting.
   *
   * @param featureId - Feature ID
   * @param taskId - Task ID to transition
   * @param refinedTitle - Optional refined title from PM analysis
   * @param refinedSpec - Optional refined spec from PM analysis
   */
  async transitionToReady(
    featureId: string,
    taskId: string,
    refinedTitle?: string,
    refinedSpec?: string
  ): Promise<void> {
    const projectRoot = getProjectRoot()
    if (!projectRoot) {
      throw new Error('Project root not initialized')
    }

    // Use DAGManager for real-time event broadcasting
    const manager = await getDAGManager(featureId, projectRoot)
    const dag = manager.getGraph()

    const taskIndex = dag.nodes.findIndex((t) => t.id === taskId)
    if (taskIndex < 0) {
      throw new Error(`Task ${taskId} not found in DAG`)
    }

    // Check if task has incomplete dependencies
    const dependencies = dag.connections
      .filter((c) => c.to === taskId)
      .map((c) => c.from)

    const allDepsArchived = dependencies.every((depId) => {
      const dep = dag.nodes.find((n) => n.id === depId)
      return dep && dep.status === 'done'
    })

    // Set blocked flag based on dependencies
    dag.nodes[taskIndex].blocked = dependencies.length > 0 && !allDepsArchived
    dag.nodes[taskIndex].status = 'analyzing'

    // Apply refined title and spec if provided
    if (refinedTitle) {
      dag.nodes[taskIndex].title = refinedTitle
    }
    if (refinedSpec) {
      dag.nodes[taskIndex].spec = refinedSpec
    }

    // Use resetGraph to update and broadcast events
    console.log(`[TaskAnalysisOrchestrator] Transitioning task ${taskId} to analyzing`)
    await manager.resetGraph(dag)
  }

  /**
   * Create subtasks from analysis result and remove parent task.
   * Tasks inherit parent's incoming connections and split among children.
   * Uses DAGManager for real-time event broadcasting.
   *
   * @param featureId - Feature ID
   * @param parentTaskId - Parent task ID to remove
   * @param taskDefs - New task definitions from analysis
   * @returns Array of created tasks
   */
  async createSubtasks(
    featureId: string,
    parentTaskId: string,
    taskDefs: NewTaskDef[]
  ): Promise<Task[]> {
    const projectRoot = getProjectRoot()
    if (!projectRoot) {
      throw new Error('Project root not initialized')
    }

    // Use DAGManager for real-time event broadcasting
    const manager = await getDAGManager(featureId, projectRoot)
    const dag = manager.getGraph()

    const parentTask = dag.nodes.find((t) => t.id === parentTaskId)
    if (!parentTask) {
      throw new Error(`Parent task ${parentTaskId} not found`)
    }

    console.log(`[TaskAnalysisOrchestrator] Creating ${taskDefs.length} subtasks for parent ${parentTaskId}`)

    const createdTasks: Task[] = []
    const titleToIdMap = new Map<string, string>()

    // Get parent's incoming and outgoing connections
    const parentIncoming = dag.connections.filter((c) => c.to === parentTaskId)
    const parentOutgoing = dag.connections.filter((c) => c.from === parentTaskId)

    // First pass: create all tasks with UUID and calculate positions
    const baseX = parentTask.position.x
    const baseY = parentTask.position.y
    const spacing = 120 // Vertical spacing between subtasks

    for (let i = 0; i < taskDefs.length; i++) {
      const def = taskDefs[i]
      const taskId = randomUUID()
      const newTask: Task = {
        id: taskId,
        title: def.title,
        spec: def.spec,
        status: 'ready',
        blocked: false,
        position: {
          x: baseX + (i % 2 === 0 ? 0 : 200), // Stagger horizontal position
          y: baseY + Math.floor(i / 2) * spacing
        },
        dependencies: []
      }
      dag.nodes.push(newTask)
      createdTasks.push(newTask)
      titleToIdMap.set(def.title, taskId)
    }

    // Second pass: add internal dependencies between subtasks
    for (const def of taskDefs) {
      if (def.dependsOnTitles && def.dependsOnTitles.length > 0) {
        const taskId = titleToIdMap.get(def.title)
        if (!taskId) continue

        for (const depTitle of def.dependsOnTitles) {
          const depId = titleToIdMap.get(depTitle)
          if (depId) {
            dag.connections.push({ from: depId, to: taskId })
          }
        }
      }
    }

    // Third pass: connect parent's incoming connections to subtasks without dependencies
    const subtasksWithoutDeps = taskDefs
      .filter((def) => !def.dependsOnTitles || def.dependsOnTitles.length === 0)
      .map((def) => titleToIdMap.get(def.title)!)
      .filter((id) => id !== undefined)

    for (const incoming of parentIncoming) {
      for (const subtaskId of subtasksWithoutDeps) {
        dag.connections.push({ from: incoming.from, to: subtaskId })
      }
    }

    // Fourth pass: connect subtasks to parent's outgoing targets
    // Find subtasks that nothing depends on (leaf subtasks)
    const dependedOn = new Set<string>()
    for (const def of taskDefs) {
      for (const depTitle of def.dependsOnTitles || []) {
        const depId = titleToIdMap.get(depTitle)
        if (depId) dependedOn.add(depId)
      }
    }
    const leafSubtasks = createdTasks
      .map((t) => t.id)
      .filter((id) => !dependedOn.has(id))

    for (const outgoing of parentOutgoing) {
      for (const leafId of leafSubtasks) {
        dag.connections.push({ from: leafId, to: outgoing.to })
      }
    }

    // Remove parent task and its connections
    dag.nodes = dag.nodes.filter((t) => t.id !== parentTaskId)
    dag.connections = dag.connections.filter(
      (c) => c.from !== parentTaskId && c.to !== parentTaskId
    )

    // Use resetGraph to update and broadcast events (includes auto-layout)
    console.log(`[TaskAnalysisOrchestrator] Resetting graph with ${dag.nodes.length} nodes after split`)
    await manager.resetGraph(dag)
    await manager.applyAutoLayout()

    return createdTasks
  }

  /**
   * Analyze a single task to determine if it should be kept or split.
   * Uses DAGManager to ensure event broadcasting is set up.
   *
   * @param featureId - Feature ID
   * @param taskId - Task ID to analyze
   * @returns Analysis result with decision and optional new tasks
   */
  async analyzeTask(featureId: string, taskId: string): Promise<AnalysisResult> {
    console.log(`[TaskAnalysisOrchestrator] analyzeTask called for ${taskId} in feature ${featureId}`)
    try {
      // 1. Get project root
      const projectRoot = getProjectRoot()
      if (!projectRoot) {
        return {
          decision: 'keep',
          reason: 'Error: Project root not initialized'
        }
      }

      // 2. Load task from DAG via DAGManager
      const manager = await getDAGManager(featureId, projectRoot)
      const dag = manager.getGraph()

      const task = dag.nodes.find((t) => t.id === taskId)
      if (!task) {
        return {
          decision: 'keep',
          reason: 'Error: Task not found'
        }
      }

      const specStore = getFeatureSpecStore(projectRoot)
      const spec = await specStore.loadSpec(featureId)
      const featureSpecContent = spec
        ? `Goals:\n${spec.goals.map((g) => `- ${g}`).join('\n')}\n\nRequirements:\n${spec.requirements.map((r) => `- ${r.description}`).join('\n')}\n\nConstraints:\n${spec.constraints.map((c) => `- ${c}`).join('\n')}`
        : ''

      // 3. Build analysis prompt
      const prompt = buildAnalysisPrompt(task, featureSpecContent)

      // 4. Execute PM query via AgentService with timeout
      // Set PM tools context so MCP tools know which feature to operate on
      setPMToolsFeatureContext(featureId)
      console.log(`[TaskAnalysisOrchestrator] Starting PM query for task ${taskId}`)
      const agentService = getAgentService()
      let responseText = ''

      // Wrap stream in timeout to prevent hanging
      const ANALYSIS_TIMEOUT_MS = 120000 // 2 minutes per task
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Analysis timeout - PM query took too long')), ANALYSIS_TIMEOUT_MS)
      })

      try {
        const streamPromise = (async () => {
          for await (const event of agentService.streamQuery({
            prompt,
            cwd: projectRoot,
            toolPreset: 'featureAgent',
            agentType: 'feature',
            featureId,
            permissionMode: 'default'
          })) {
            if (event.type === 'message' && event.message?.content) {
              responseText += event.message.content
            } else if (event.type === 'error') {
              console.error(`[TaskAnalysisOrchestrator] PM query error for ${taskId}: ${event.error}`)
              throw new Error(`PM query error: ${event.error}`)
            }
          }
        })()

        await Promise.race([streamPromise, timeoutPromise])
      } catch (timeoutError) {
        console.error(`[TaskAnalysisOrchestrator] PM query timeout/error for ${taskId}:`, timeoutError)
        return {
          decision: 'keep',
          reason: `Analysis timeout: ${timeoutError instanceof Error ? timeoutError.message : 'Unknown error'}`
        }
      }
      console.log(`[TaskAnalysisOrchestrator] PM query complete for ${taskId}, response length: ${responseText.length}`)

      // 5. Parse response
      console.log(`[TaskAnalysisOrchestrator] Raw response for ${taskId}:`, responseText.slice(0, 500))
      const parsed = parseAnalysisResponse(responseText)
      console.log(`[TaskAnalysisOrchestrator] Parsed response for ${taskId}:`, JSON.stringify(parsed, null, 2))

      if (parsed.error) {
        console.warn(`[TaskAnalysisOrchestrator] Parse warning: ${parsed.error}`)
      }

      if (parsed.decision === 'keep') {
        return {
          decision: 'keep',
          reason: parsed.error || 'Task is appropriately scoped',
          refinedTitle: parsed.refinedTitle,
          refinedSpec: parsed.refinedSpec
        }
      }

      // 6. Convert parsed tasks to AnalysisResult format
      return {
        decision: 'split',
        reason: 'Task split into subtasks',
        newTasks: parsed.tasks?.map((t) => ({
          title: t.title,
          spec: t.spec,
          status: 'ready' as const,
          locked: false,
          // Store dependsOn temporarily - will be resolved to IDs by createSubtasks
          dependsOnTitles: t.dependsOn
        }))
      }
    } catch (error) {
      console.error('[TaskAnalysisOrchestrator] analyzeTask error:', error)
      return {
        decision: 'keep',
        reason: `Error: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
}

// Singleton instance for global access
let orchestratorInstance: TaskAnalysisOrchestrator | null = null

/**
 * Get the singleton TaskAnalysisOrchestrator instance.
 * Creates a new instance if one doesn't exist.
 * IMPORTANT: Always updates the featureStore to ensure we use the current project's store.
 *
 * @param featureStore - FeatureStore for loading DAGs
 * @returns TaskAnalysisOrchestrator instance
 */
export function getTaskAnalysisOrchestrator(featureStore: FeatureStore): TaskAnalysisOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new TaskAnalysisOrchestrator(featureStore)
  } else {
    // Always update the featureStore to handle project switches
    orchestratorInstance.featureStore = featureStore
  }
  return orchestratorInstance
}

/**
 * Reset the singleton instance.
 * Used for testing or when switching projects.
 */
export function resetTaskAnalysisOrchestrator(): void {
  orchestratorInstance = null
}
