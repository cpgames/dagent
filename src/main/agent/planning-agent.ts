import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import type { FeatureStore } from '../storage/feature-store'
import { AgentService } from './agent-service'
import { FeatureStatusManager } from '../services/feature-status-manager'
import { setPMToolsFeatureContext } from '../ipc/pm-tools-handlers'
import { getSessionManager } from '../services/session-manager'
import { getTaskAnalysisOrchestrator } from '../services/task-analysis-orchestrator'
import { getOrchestrator } from '../dag-engine/orchestrator'
import { getFeatureSpecStore } from '../agents/feature-spec-store'
import type { CreateSessionOptions } from '../../shared/types/session'

/**
 * PlanningAgent - Handles task creation from spec.
 *
 * Responsibilities:
 * - Read feature spec (READ-ONLY, never modifies)
 * - Create tasks and DAG structure
 * - Run task analysis after creation
 *
 * Session: planning-feature-{featureId}
 * Phases: planning -> ready
 *
 * CRITICAL: PlanningAgent can ONLY read spec. If it cannot create tasks
 * from the spec alone, that indicates a spec quality problem that should
 * be addressed by re-running investigation.
 */
export class PlanningAgent {
  private featureStore: FeatureStore
  private statusManager: FeatureStatusManager
  private eventEmitter: EventEmitter
  private projectRoot: string

  constructor(
    _agentService: AgentService, // Kept for API compatibility
    featureStore: FeatureStore,
    statusManager: FeatureStatusManager,
    eventEmitter: EventEmitter,
    projectRoot: string
  ) {
    this.featureStore = featureStore
    this.statusManager = statusManager
    this.eventEmitter = eventEmitter
    this.projectRoot = projectRoot
  }

  /**
   * Build the session ID for planning.
   */
  private buildSessionId(featureId: string): string {
    return `planning-feature-${featureId}`
  }

  /**
   * Get the session ID for this feature's planning.
   */
  getSessionId(featureId: string): string {
    return this.buildSessionId(featureId)
  }

  /**
   * Create tasks for a feature from its spec.
   * Called when user clicks "Plan" from ready_for_planning state.
   *
   * Flow:
   * 1. Check for existing tasks
   * 2. If no tasks, auto-create one task per spec requirement
   * 3. Run task analysis orchestrator to decompose tasks if needed
   *
   * @param featureId - Feature ID
   * @throws Error if spec is missing or insufficient
   */
  async createTasksFromSpec(featureId: string): Promise<void> {
    console.log(`[PlanningAgent] Starting planning for feature: ${featureId}`)

    try {
      // Set PM tools feature context
      setPMToolsFeatureContext(featureId)

      // Load feature
      const feature = await this.featureStore.loadFeature(featureId)
      if (!feature) {
        throw new Error(`Feature not found: ${featureId}`)
      }

      // Update status to planning
      feature.status = 'planning'
      feature.updatedAt = new Date().toISOString()
      await this.featureStore.saveFeature(feature)

      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('feature:status-changed', { featureId, status: 'planning' })
        }
      })

      // Load spec
      const specStore = getFeatureSpecStore(this.projectRoot)
      const spec = await specStore.loadSpec(featureId)
      if (!spec) {
        throw new Error('No spec found - investigation phase may not have completed')
      }

      // Get or create planning session for logging
      const sessionManager = getSessionManager(this.projectRoot)
      const sessionOptions: CreateSessionOptions = {
        type: 'feature',
        agentType: 'planning',
        featureId
      }
      const session = await sessionManager.getOrCreateSession(sessionOptions)
      const sessionId = session.id

      // Step 1: Check existing tasks
      const dag = await this.featureStore.loadDag(featureId)
      const existingTasks = dag?.nodes || []
      console.log(`[PlanningAgent] Found ${existingTasks.length} existing tasks`)

      // Step 2: If no tasks, create from spec requirements
      if (existingTasks.length === 0) {
        await sessionManager.addMessage(sessionId, featureId, {
          role: 'assistant',
          content: 'Creating tasks from spec requirements...'
        })

        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('chat:updated', { featureId })
          }
        })

        await this.createTasksFromRequirements(featureId, spec)
      } else {
        await sessionManager.addMessage(sessionId, featureId, {
          role: 'assistant',
          content: `Found ${existingTasks.length} existing tasks. Analyzing for decomposition...`
        })

        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('chat:updated', { featureId })
          }
        })
      }

      // Step 3: Run task analysis to decompose if needed
      console.log(`[PlanningAgent] Running task analysis for ${featureId}`)
      await this.runTaskAnalysis(featureId)

      // Verify tasks exist after analysis
      const finalDag = await this.featureStore.loadDag(featureId)
      if (!finalDag || finalDag.nodes.length === 0) {
        throw new Error('No tasks after analysis')
      }

      console.log(`[PlanningAgent] Planning complete for ${featureId}, ${finalDag.nodes.length} tasks`)

      // Log completion
      await sessionManager.addMessage(sessionId, featureId, {
        role: 'assistant',
        content: `Planning complete. ${finalDag.nodes.length} task(s) ready for execution.`
      })

      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('chat:updated', { featureId })
        }
      })

      // Move to ready
      await this.statusManager.updateFeatureStatus(featureId, 'ready')

      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('feature:status-changed', { featureId, status: 'ready' })
          win.webContents.send('dag:updated', { featureId, graph: finalDag })
        }
      })

      // Check for auto-start
      const updatedFeature = await this.featureStore.loadFeature(featureId)
      if (updatedFeature?.autoStart) {
        console.log(`[PlanningAgent] Auto-start enabled for ${featureId}`)
        try {
          const executionOrchestrator = getOrchestrator()
          await executionOrchestrator.initialize(featureId, finalDag)
          const startResult = await executionOrchestrator.start()
          if (startResult.success) {
            BrowserWindow.getAllWindows().forEach((win) => {
              if (!win.isDestroyed()) {
                win.webContents.send('execution:auto-started', { featureId })
              }
            })
          }
        } catch (autoStartError) {
          console.error(`[PlanningAgent] Auto-start error:`, autoStartError)
        }
      }

      this.eventEmitter.emit('planning-complete', {
        featureId,
        success: true,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error(`[PlanningAgent] Planning failed for ${featureId}:`, error)

      try {
        await this.statusManager.updateFeatureStatus(featureId, 'ready_for_planning')

        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('feature:status-changed', { featureId, status: 'ready_for_planning' })
          }
        })
      } catch (statusError) {
        console.error(`[PlanningAgent] Failed to update status:`, statusError)
      }

      this.eventEmitter.emit('planning-failed', {
        featureId,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Create initial tasks from spec requirements.
   * One task per requirement, with needs_analysis status.
   */
  private async createTasksFromRequirements(
    featureId: string,
    spec: {
      featureName: string
      goals: string[]
      requirements: { description: string }[]
      constraints: string[]
      acceptanceCriteria: { description: string }[]
    }
  ): Promise<void> {
    const { getDAGManager } = await import('../ipc/dag-handlers')
    const manager = await getDAGManager(featureId, this.projectRoot)

    // If there are requirements, create one task per requirement
    // If no requirements but there are goals, create one task per goal
    const items = spec.requirements.length > 0
      ? spec.requirements.map(r => r.description)
      : spec.goals

    if (items.length === 0) {
      // Fallback: create single task for the whole feature
      console.log(`[PlanningAgent] No requirements/goals, creating single task for feature`)
      await manager.addNode({
        title: spec.featureName,
        description: `Implement: ${spec.featureName}`,
        status: 'needs_analysis',
        locked: false
      })
      return
    }

    console.log(`[PlanningAgent] Creating ${items.length} tasks from spec`)

    for (const item of items) {
      // Create task title from requirement (first 60 chars)
      const title = item.length > 60 ? item.slice(0, 57) + '...' : item

      await manager.addNode({
        title,
        description: item,
        status: 'needs_analysis',
        locked: false
      })
    }

    // Broadcast DAG update
    const dag = manager.getGraph()
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('dag:updated', { featureId, graph: dag })
      }
    })
  }

  /**
   * Run task analysis with timeout.
   */
  private async runTaskAnalysis(featureId: string): Promise<void> {
    const analysisOrchestrator = getTaskAnalysisOrchestrator(this.featureStore)
    const ANALYSIS_OVERALL_TIMEOUT_MS = 600000 // 10 minutes max

    try {
      const analysisPromise = (async () => {
        for await (const event of analysisOrchestrator.analyzeFeatureTasks(featureId)) {
          console.log(`[PlanningAgent] Analysis event: ${event.type}`)

          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('analysis:event', { featureId, event })
            }
          })

          if (event.type === 'complete') {
            console.log(`[PlanningAgent] Analysis complete for ${featureId}`)
            break
          }
          if (event.type === 'error') {
            console.error(`[PlanningAgent] Analysis error: ${event.error}`)
          }
        }
      })()

      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          console.warn(`[PlanningAgent] Analysis timeout for ${featureId} - proceeding to ready`)
          resolve()
        }, ANALYSIS_OVERALL_TIMEOUT_MS)
      })

      await Promise.race([analysisPromise, timeoutPromise])
    } catch (error) {
      console.error(`[PlanningAgent] Analysis failed:`, error)
    }
  }
}

/**
 * Factory function for creating PlanningAgent instance.
 */
export function createPlanningAgent(
  agentService: AgentService,
  featureStore: FeatureStore,
  statusManager: FeatureStatusManager,
  eventEmitter: EventEmitter,
  projectRoot: string
): PlanningAgent {
  return new PlanningAgent(agentService, featureStore, statusManager, eventEmitter, projectRoot)
}
