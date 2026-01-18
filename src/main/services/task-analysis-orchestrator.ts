import type { Task } from '@shared/types'
import type { FeatureStore } from '../storage/feature-store'
import { buildAnalysisPrompt, parseAnalysisResponse } from '../agent/pm-analysis-prompt'
import { getAgentService } from '../agent/agent-service'
import { getFeatureSpecStore } from '../agents/feature-spec-store'
import { getProjectRoot } from '../ipc/storage-handlers'

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
  description: string
  status: 'needs_analysis'
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
  /** New tasks to create when decision is 'split' */
  newTasks?: NewTaskDef[]
}

/**
 * TaskAnalysisOrchestrator - Manages the analysis loop for needs_analysis tasks.
 *
 * Responsibilities:
 * - Find all tasks with 'needs_analysis' status
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
  private featureStore: FeatureStore

  constructor(featureStore: FeatureStore) {
    this.featureStore = featureStore
  }

  /**
   * Get all tasks with 'needs_analysis' status for a feature.
   * @param featureId - Feature ID to scan
   * @returns Array of tasks needing analysis
   */
  async getPendingTasks(featureId: string): Promise<Task[]> {
    const dag = await this.featureStore.loadDag(featureId)
    if (!dag) {
      return []
    }

    return dag.nodes.filter((task) => task.status === 'needs_analysis')
  }

  /**
   * Check if a feature has any tasks needing analysis.
   * @param featureId - Feature ID to check
   * @returns true if any needs_analysis tasks exist
   */
  async hasPendingAnalysis(featureId: string): Promise<boolean> {
    const pendingTasks = await this.getPendingTasks(featureId)
    return pendingTasks.length > 0
  }

  /**
   * Analyze all needs_analysis tasks for a feature.
   * Loops until no more needs_analysis tasks remain.
   * Streams events as analysis progresses.
   *
   * @param featureId - Feature ID to analyze
   * @yields AnalysisEvent for each stage of analysis
   */
  async *analyzeFeatureTasks(featureId: string): AsyncGenerator<AnalysisEvent> {
    let analyzedCount = 0
    let splitCount = 0

    // Loop until no more needs_analysis tasks
    while (true) {
      const pendingTasks = await this.getPendingTasks(featureId)
      if (pendingTasks.length === 0) {
        yield { type: 'complete', featureId, analyzedCount, splitCount }
        return
      }

      // Process first task (new tasks from splits will be picked up in next iteration)
      const task = pendingTasks[0]
      yield { type: 'analyzing', taskId: task.id, taskTitle: task.title }

      try {
        const result = await this.analyzeTask(featureId, task.id)

        if (result.decision === 'keep') {
          // Transition to ready_for_dev
          await this.transitionToReady(featureId, task.id)
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
   * Transition a task from needs_analysis to ready_for_dev.
   *
   * @param featureId - Feature ID
   * @param taskId - Task ID to transition
   */
  async transitionToReady(featureId: string, taskId: string): Promise<void> {
    // Placeholder - will be implemented in Task 3
    const dag = await this.featureStore.loadDag(featureId)
    if (!dag) {
      throw new Error(`DAG not found for feature ${featureId}`)
    }

    const taskIndex = dag.nodes.findIndex((t) => t.id === taskId)
    if (taskIndex < 0) {
      throw new Error(`Task ${taskId} not found in DAG`)
    }

    dag.nodes[taskIndex].status = 'ready_for_dev'
    await this.featureStore.saveDag(featureId, dag)
  }

  /**
   * Create subtasks from analysis result and remove parent task.
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
    // Placeholder - will be fully implemented in Task 3
    const dag = await this.featureStore.loadDag(featureId)
    if (!dag) {
      throw new Error(`DAG not found for feature ${featureId}`)
    }

    const parentTask = dag.nodes.find((t) => t.id === parentTaskId)
    if (!parentTask) {
      throw new Error(`Parent task ${parentTaskId} not found`)
    }

    // Simple placeholder: create tasks without proper positioning
    const createdTasks: Task[] = []
    const titleToIdMap = new Map<string, string>()

    // First pass: create all tasks
    for (let i = 0; i < taskDefs.length; i++) {
      const def = taskDefs[i]
      const taskId = `${parentTaskId}-${i + 1}-${Date.now()}`
      const newTask: Task = {
        id: taskId,
        title: def.title,
        description: def.description,
        status: 'needs_analysis',
        locked: false,
        position: {
          x: parentTask.position.x,
          y: parentTask.position.y + (i + 1) * 100
        }
      }
      dag.nodes.push(newTask)
      createdTasks.push(newTask)
      titleToIdMap.set(def.title, taskId)
    }

    // Second pass: add dependencies
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

    // Remove parent task and its connections
    dag.nodes = dag.nodes.filter((t) => t.id !== parentTaskId)
    dag.connections = dag.connections.filter(
      (c) => c.from !== parentTaskId && c.to !== parentTaskId
    )

    await this.featureStore.saveDag(featureId, dag)
    return createdTasks
  }

  /**
   * Analyze a single task to determine if it should be kept or split.
   *
   * @param featureId - Feature ID
   * @param taskId - Task ID to analyze
   * @returns Analysis result with decision and optional new tasks
   */
  async analyzeTask(featureId: string, taskId: string): Promise<AnalysisResult> {
    try {
      // 1. Load task from DAG
      const dag = await this.featureStore.loadDag(featureId)
      if (!dag) {
        return {
          decision: 'keep',
          reason: 'Error: DAG not found'
        }
      }

      const task = dag.nodes.find((t) => t.id === taskId)
      if (!task) {
        return {
          decision: 'keep',
          reason: 'Error: Task not found'
        }
      }

      // 2. Load feature spec
      const projectRoot = getProjectRoot()
      if (!projectRoot) {
        return {
          decision: 'keep',
          reason: 'Error: Project root not initialized'
        }
      }

      const specStore = getFeatureSpecStore(projectRoot)
      const spec = await specStore.loadSpec(featureId)
      const featureSpecContent = spec
        ? `Goals:\n${spec.goals.map((g) => `- ${g}`).join('\n')}\n\nRequirements:\n${spec.requirements.map((r) => `- ${r.description}`).join('\n')}\n\nConstraints:\n${spec.constraints.map((c) => `- ${c}`).join('\n')}`
        : ''

      // 3. Build analysis prompt
      const prompt = buildAnalysisPrompt(task, featureSpecContent)

      // 4. Execute PM query via AgentService
      const agentService = getAgentService()
      let responseText = ''

      for await (const event of agentService.streamQuery({
        prompt,
        cwd: projectRoot,
        toolPreset: 'pmAgent',
        agentType: 'pm',
        featureId,
        permissionMode: 'default'
      })) {
        if (event.type === 'message' && event.message?.content) {
          responseText += event.message.content
        } else if (event.type === 'error') {
          return {
            decision: 'keep',
            reason: `Error during analysis: ${event.error}`
          }
        }
      }

      // 5. Parse response
      const parsed = parseAnalysisResponse(responseText)

      if (parsed.error) {
        console.warn(`[TaskAnalysisOrchestrator] Parse warning: ${parsed.error}`)
      }

      if (parsed.decision === 'keep') {
        return {
          decision: 'keep',
          reason: parsed.error || 'Task is appropriately scoped'
        }
      }

      // 6. Convert parsed tasks to AnalysisResult format
      return {
        decision: 'split',
        reason: 'Task split into subtasks',
        newTasks: parsed.tasks?.map((t) => ({
          title: t.title,
          description: t.description,
          status: 'needs_analysis' as const,
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
 *
 * @param featureStore - FeatureStore for loading DAGs
 * @returns TaskAnalysisOrchestrator instance
 */
export function getTaskAnalysisOrchestrator(featureStore: FeatureStore): TaskAnalysisOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new TaskAnalysisOrchestrator(featureStore)
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
