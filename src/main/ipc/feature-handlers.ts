import { ipcMain, BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { getGitManager } from '../git/git-manager'
import { getAgentPool } from '../agents/agent-pool'
import { getFeatureStore, getProjectRoot } from './storage-handlers'
import { getFeatureBranchName } from '../git/types'
import { FeatureStatusManager } from '../services/feature-status-manager'
import { getFeatureSpecStore } from '../agents/feature-spec-store'
import { getFeatureManagerPool } from '../git/worktree-pool-manager'
import { getOrchestrator } from '../dag-engine/orchestrator'
import { getAgentService } from '../agent/agent-service'
import type { FeatureStatus } from '@shared/types/feature'
import type { Task } from '@shared/types/task'
import type { AgentStreamEvent } from '../agent/types'
import * as path from 'path'
import * as fs from 'fs/promises'

export interface FeatureDeleteOptions {
  deleteBranch?: boolean
  force?: boolean
}

export interface FeatureDeleteResult {
  success: boolean
  deletedBranch?: boolean
  deletedWorktrees?: number
  terminatedAgents?: number
  error?: string
}

// Singleton instance of FeatureStatusManager
let statusManager: FeatureStatusManager | null = null

/**
 * Get or create the FeatureStatusManager singleton.
 * Requires FeatureStore to be initialized.
 */
function getStatusManager(): FeatureStatusManager {
  if (!statusManager) {
    const featureStore = getFeatureStore()
    if (!featureStore) {
      throw new Error('FeatureStore not initialized. Call initializeStorage first.')
    }
    // Create a dedicated EventEmitter for status changes
    const eventEmitter = new EventEmitter()
    statusManager = new FeatureStatusManager(featureStore, eventEmitter)
  }
  return statusManager
}

/**
 * Export as getFeatureStatusManager for use in other modules.
 * Alias for getStatusManager().
 */
export function getFeatureStatusManager(): FeatureStatusManager {
  return getStatusManager()
}

/**
 * Register feature-level IPC handlers.
 * Handles feature lifecycle operations like deletion with full cleanup.
 */
export function registerFeatureHandlers(): void {
  /**
   * Delete a feature with comprehensive cleanup:
   * 1. Terminate agents working on this feature's tasks
   * 2. Remove any legacy task worktrees for the feature (pool architecture doesn't use these)
   * 3. Delete the feature branch (if option is true)
   * 4. Delete feature storage (pending or in manager worktree)
   */
  ipcMain.handle(
    'feature:delete',
    async (
      _event,
      featureId: string,
      options: FeatureDeleteOptions = {}
    ): Promise<FeatureDeleteResult> => {
      const { deleteBranch = true } = options
      const errors: string[] = []
      let deletedWorktrees = 0
      let terminatedAgents = 0
      let deletedBranchSuccess = false

      try {
        const gitManager = getGitManager()
        const agentPool = getAgentPool()
        const featureStore = getFeatureStore()

        // Get branch name for this feature
        const featureBranchName = getFeatureBranchName(featureId)

        // Step 1: Terminate any agents working on this feature's tasks
        const agents = agentPool.getAgents()
        for (const agent of agents) {
          if (agent.featureId === featureId && agent.status !== 'terminated') {
            const terminated = agentPool.terminateAgent(agent.id)
            if (terminated) {
              terminatedAgents++
            }
          }
        }

        // Step 1b: Stop orchestrator if it's running this feature
        const orchestrator = getOrchestrator()
        const orchestratorState = orchestrator.getState()
        if (orchestratorState.featureId === featureId && orchestratorState.status === 'running') {
          console.log(`[FeatureDelete] Stopping orchestrator for feature ${featureId}`)
          orchestrator.stop()
        }

        // Step 2: List and remove all task worktrees for the feature
        if (gitManager.isInitialized()) {
          const worktrees = await gitManager.listWorktrees()
          const config = gitManager.getConfig()

          // Find task worktrees for this feature (pattern: featureId--task-*)
          const featureWorktreePrefix = `${featureId}--task-`
          for (const worktree of worktrees) {
            const worktreeDirName = path.basename(worktree.path)
            if (worktreeDirName.startsWith(featureWorktreePrefix)) {
              try {
                // Remove task worktree and its branch
                const result = await gitManager.removeWorktree(worktree.path, true)
                if (result.success) {
                  deletedWorktrees++
                } else if (result.error) {
                  errors.push(`Task worktree ${worktreeDirName}: ${result.error}`)
                }
              } catch (err) {
                errors.push(`Task worktree ${worktreeDirName}: ${(err as Error).message}`)
              }
            }
          }

          // Step 3: Prune worktrees to clean up stale references before branch deletion
          // This ensures git no longer tracks the removed worktrees
          try {
            await gitManager.pruneWorktrees()
            console.log(`[FeatureDelete] Pruned worktree references for ${featureId}`)
          } catch (err) {
            console.warn(`[FeatureDelete] Failed to prune worktrees:`, err)
            // Non-fatal, continue with branch deletion
          }

          // Step 4: Delete the feature branch (if option is true)
          // Always force delete since user explicitly chose to delete the feature
          if (deleteBranch) {
            try {
              const branchExists = await gitManager.branchExists(featureBranchName)
              if (branchExists) {
                const result = await gitManager.deleteBranch(featureBranchName, true)
                if (result.success) {
                  deletedBranchSuccess = true
                } else if (result.error) {
                  errors.push(`Branch deletion: ${result.error}`)
                }
              } else {
                deletedBranchSuccess = true // Branch didn't exist, consider it "deleted"
              }
            } catch (err) {
              errors.push(`Branch deletion: ${(err as Error).message}`)
            }
          }

          // Step 4b: Clean up any remaining legacy task worktree directories on disk
          // (handles cases where git worktree remove left empty folders or worktrees weren't registered)
          // Note: In pool architecture, tasks don't have their own worktrees, but this cleans up legacy dirs
          try {
            const worktreesDir = config.worktreesDir
            const dirEntries = await fs.readdir(worktreesDir, { withFileTypes: true })
            for (const entry of dirEntries) {
              if (entry.isDirectory()) {
                // Check if directory is a legacy task worktree for this feature (featureId--task-*)
                if (entry.name.startsWith(`${featureId}--`)) {
                  const dirPath = path.join(worktreesDir, entry.name)
                  try {
                    await fs.rm(dirPath, { recursive: true, force: true })
                    console.log(`[FeatureDelete] Cleaned up leftover legacy task directory: ${dirPath}`)
                  } catch {
                    // Ignore cleanup errors
                  }
                }
              }
            }
          } catch {
            // Ignore errors reading worktrees directory
          }
        }

        // Step 5: Delete the feature storage
        try {
          if (featureStore) {
            await featureStore.deleteFeature(featureId)
          }
        } catch (err) {
          errors.push(`Storage deletion: ${(err as Error).message}`)
        }

        // Return result
        if (errors.length > 0) {
          return {
            success: false,
            deletedBranch: deletedBranchSuccess,
            deletedWorktrees,
            terminatedAgents,
            error: errors.join('; ')
          }
        }

        return {
          success: true,
          deletedBranch: deleteBranch ? deletedBranchSuccess : undefined,
          deletedWorktrees,
          terminatedAgents
        }
      } catch (error) {
        return {
          success: false,
          deletedBranch: deletedBranchSuccess,
          deletedWorktrees,
          terminatedAgents,
          error: (error as Error).message
        }
      }
    }
  )

  /**
   * Update feature status with validation.
   * Uses FeatureStatusManager to ensure valid transitions.
   */
  ipcMain.handle(
    'feature:updateStatus',
    async (
      _event,
      featureId: string,
      newStatus: FeatureStatus
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const manager = getStatusManager()
        await manager.updateFeatureStatus(featureId, newStatus)
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message
        }
      }
    }
  )

  /**
   * Start a feature using the pool worktree architecture.
   *
   * This is called when the user clicks "Start" on a backlog feature.
   * The feature is assigned to a pool worktree (creating one on demand if needed).
   *
   * Pool-based flow:
   * 1. Validate feature is in 'backlog' status
   * 2. Get target branch (current branch) for later merge
   * 3. Assign feature to pool (creates pool worktree on demand)
   * 4. Store pool assignment in feature (worktreeId, worktreePath, targetBranch)
   * 5. Transition feature to 'active' status
   * 6. PM agent can now chat with user for planning
   */
  ipcMain.handle(
    'feature:startWorktreeCreation',
    async (
      _event,
      featureId: string
    ): Promise<{ success: boolean; featureId?: string; error?: string }> => {
      try {
        const featureStore = getFeatureStore()
        if (!featureStore) {
          throw new Error('FeatureStore not initialized. Call initializeStorage first.')
        }

        const projectRoot = getProjectRoot()
        if (!projectRoot) {
          throw new Error('Project root not set. Call project:set-project first.')
        }

        // Load feature and validate status
        const feature = await featureStore.loadFeature(featureId)
        if (!feature) {
          return { success: false, error: `Feature ${featureId} not found` }
        }

        if (feature.status !== 'backlog') {
          return {
            success: false,
            error: `Feature ${featureId} is not in backlog status (current: ${feature.status})`
          }
        }

        // Initialize pool manager if needed
        const poolManager = getFeatureManagerPool()
        if (!poolManager.isInitialized()) {
          await poolManager.initialize(projectRoot)
        }

        // Step 1: Reserve a manager slot (sync - no worktree creation yet)
        console.log(`[FeatureHandlers] Reserving manager for feature ${featureId}`)
        const reservation = poolManager.reserveManager(featureId)
        console.log(`[FeatureHandlers] Feature ${featureId} reserved manager ${reservation.featureManagerId}`)

        // Map featureManagerId to worktreeId ('neon' | 'cyber' | 'pulse')
        const worktreeNames = ['neon', 'cyber', 'pulse'] as const
        const worktreeId = worktreeNames[reservation.featureManagerId - 1] || 'neon'

        // Step 2: Update status to creating_worktree and broadcast to UI immediately
        feature.status = 'creating_worktree' as FeatureStatus
        feature.worktreeId = worktreeId
        feature.branch = `dagent/${worktreeId}` // Branch name for this worktree
        feature.updatedAt = new Date().toISOString()
        await featureStore.saveFeature(feature)
        console.log(`[FeatureHandlers] Feature ${featureId} status set to creating_worktree, assigned to ${worktreeId}, branch=dagent/${worktreeId}`)

        // Broadcast status change to UI immediately
        const allWindows = BrowserWindow.getAllWindows()
        for (const win of allWindows) {
          if (!win.isDestroyed()) {
            win.webContents.send('feature:status-changed', {
              featureId,
              status: 'creating_worktree'
            })
          }
        }
        console.log(`[FeatureHandlers] Broadcasted creating_worktree status to UI`)

        // Step 3: Return success immediately - worktree creation happens async
        // This allows the UI to show "creating worktree" status right away

        // Step 4: Create worktree and complete setup asynchronously (fire-and-forget)
        const featureManagerId = reservation.featureManagerId
        ;(async () => {
          try {
            // Create the worktree (this is the slow part)
            console.log(`[FeatureHandlers] Creating worktree for manager ${featureManagerId}...`)
            const worktreePath = await poolManager.ensureWorktree(featureManagerId)
            console.log(`[FeatureHandlers] Worktree created at: ${worktreePath}`)

            // Update feature with worktree path
            const updatedFeature = await featureStore.loadFeature(featureId)
            if (!updatedFeature) {
              throw new Error(`Feature ${featureId} not found after worktree creation`)
            }
            updatedFeature.worktreePath = worktreePath
            updatedFeature.updatedAt = new Date().toISOString()
            await featureStore.saveFeature(updatedFeature)
            console.log(`[FeatureHandlers] Saved feature ${featureId} with worktreePath=${worktreePath}`)

            // Move feature files from backlog to worktree
            await featureStore.moveFeatureToWorktree(featureId, worktreePath)
            console.log(`[FeatureHandlers] Moved feature ${featureId} to worktree storage`)

            // Transition to active status now that worktree is ready
            const statusMgr = getStatusManager()
            await statusMgr.updateFeatureStatus(featureId, 'active')
            console.log(`[FeatureHandlers] Feature ${featureId} moved to active`)

            // Broadcast active status to UI
            const windows = BrowserWindow.getAllWindows()
            for (const win of windows) {
              if (!win.isDestroyed()) {
                win.webContents.send('feature:status-changed', { featureId, status: 'active' })
              }
            }

            // Automatically start investigation
            console.log(`[FeatureHandlers] Starting automatic investigation for ${featureId}`)
            await startInvestigationForFeature(featureId, featureStore, projectRoot, worktreePath)
          } catch (err) {
            console.error(`[FeatureHandlers] Failed during worktree creation/activation for ${featureId}:`, err)
            // On error, transition back to backlog so user can retry
            try {
              const currentFeature = await featureStore.loadFeature(featureId)
              if (currentFeature && currentFeature.status !== 'backlog') {
                currentFeature.status = 'backlog'
                currentFeature.worktreeId = undefined
                currentFeature.worktreePath = undefined
                currentFeature.updatedAt = new Date().toISOString()
                await featureStore.saveFeature(currentFeature)

                // Remove from manager queue
                poolManager.removeFeatureFromQueue(featureId)

                const windows = BrowserWindow.getAllWindows()
                for (const win of windows) {
                  if (!win.isDestroyed()) {
                    win.webContents.send('feature:status-changed', { featureId, status: 'backlog' })
                  }
                }
              }
            } catch (revertErr) {
              console.error(`[FeatureHandlers] Failed to revert status for ${featureId}:`, revertErr)
            }
          }
        })()

        return { success: true, featureId }
      } catch (error) {
        console.error(`[FeatureHandlers] Failed to start feature:`, error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    }
  )

  /**
   * Save an attachment file for a feature.
   * For active features: .dagent-worktrees/{managerName}/.dagent/features/{featureId}/attachments/
   * For backlog features: .dagent/features/{featureId}/attachments/
   */
  ipcMain.handle(
    'feature:saveAttachment',
    async (
      _event,
      featureId: string,
      fileName: string,
      fileBuffer: ArrayBuffer
    ): Promise<string> => {
      const featureStore = getFeatureStore()
      if (!featureStore) {
        throw new Error('FeatureStore not initialized. Call initializeStorage first.')
      }
      const buffer = Buffer.from(fileBuffer)
      return await featureStore.saveAttachment(featureId, fileName, buffer)
    }
  )

  /**
   * List all attachments for a feature.
   */
  ipcMain.handle(
    'feature:listAttachments',
    async (_event, featureId: string): Promise<string[]> => {
      const featureStore = getFeatureStore()
      if (!featureStore) {
        throw new Error('FeatureStore not initialized. Call initializeStorage first.')
      }
      return await featureStore.listAttachments(featureId)
    }
  )

  /**
   * Upload multiple attachment files for a feature.
   * Returns array of relative paths where files were saved.
   * Also updates the feature's attachments array in the feature.json.
   */
  ipcMain.handle(
    'feature:uploadAttachments',
    async (
      _event,
      featureId: string,
      files: Array<{ name: string; buffer: ArrayBuffer }>
    ): Promise<string[]> => {
      const featureStore = getFeatureStore()
      if (!featureStore) {
        throw new Error('FeatureStore not initialized. Call initializeStorage first.')
      }

      const savedPaths: string[] = []
      for (const file of files) {
        const buffer = Buffer.from(file.buffer)
        const savedPath = await featureStore.saveAttachment(featureId, file.name, buffer)
        savedPaths.push(savedPath)
      }

      // Update the feature's attachments array in storage
      const feature = await featureStore.loadFeature(featureId)
      if (feature) {
        const existingAttachments = feature.attachments || []
        feature.attachments = [...existingAttachments, ...savedPaths]
        await featureStore.saveFeature(feature)
      }

      return savedPaths
    }
  )

  /**
   * Delete an attachment file from a feature.
   * Removes both the file and the reference in feature.json.
   */
  ipcMain.handle(
    'feature:deleteAttachment',
    async (_event, featureId: string, attachmentPath: string): Promise<void> => {
      const featureStore = getFeatureStore()
      if (!featureStore) {
        throw new Error('FeatureStore not initialized. Call initializeStorage first.')
      }

      await featureStore.deleteAttachment(featureId, attachmentPath)
    }
  )

  /**
   * Start PM agent planning for a feature (full parameters version).
   * In the new task-centric architecture, planning is triggered via PM agent chat.
   * This handler is deprecated - use the PM chat interface instead.
   */
  ipcMain.handle(
    'feature:startPlanningFull',
    async (
      _event,
      featureId: string,
      _featureName: string,
      _description?: string,
      _attachments?: string[]
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const featureStore = getFeatureStore()
        const projectRoot = getProjectRoot()

        if (!featureStore || !projectRoot) {
          throw new Error('FeatureStore not initialized. Call initializeStorage first.')
        }

        // Initialize DAGManager with event broadcasting
        const { getDAGManager } = await import('./dag-handlers')
        await getDAGManager(featureId, projectRoot)
        console.log(`[FeatureHandlers] DAGManager initialized for ${featureId}`)

        // In the new architecture, PM agent interaction happens through chat
        // This handler just ensures the feature is ready for PM interaction
        console.log(`[FeatureHandlers] feature:startPlanningFull called for ${featureId} - delegating to PM chat`)

        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message
        }
      }
    }
  )

  /**
   * Continue PM agent conversation with user's response.
   * In the new task-centric architecture, this is handled through the main PM chat interface.
   * This handler is deprecated - kept for backwards compatibility.
   */
  ipcMain.handle(
    'feature:respondToPM',
    async (
      _event,
      featureId: string,
      _userResponse: string
    ): Promise<{ success: boolean; canProceed: boolean; uncertainties?: string[]; error?: string }> => {
      try {
        const featureStore = getFeatureStore()
        const projectRoot = getProjectRoot()

        if (!featureStore || !projectRoot) {
          return { success: false, canProceed: false, error: 'Storage not initialized' }
        }

        // In the new architecture, PM interaction happens through the unified chat interface
        // This handler now just returns success to maintain backwards compatibility
        console.log(`[FeatureHandlers] feature:respondToPM called for ${featureId} - use PM chat instead`)

        return {
          success: true,
          canProceed: true, // Always allow proceeding - actual planning is done through chat
          uncertainties: []
        }
      } catch (error) {
        return {
          success: false,
          canProceed: false,
          error: (error as Error).message
        }
      }
    }
  )

  /**
   * Start planning for a feature that is in 'ready_for_planning' status.
   * Called when user clicks the Plan button after PM has gathered enough info.
   */
  ipcMain.handle(
    'feature:startPlanning',
    async (
      _event,
      featureId: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const featureStore = getFeatureStore()
        const projectRoot = getProjectRoot()

        if (!featureStore || !projectRoot) {
          return { success: false, error: 'Storage not initialized' }
        }

        // Load and verify feature status
        const feature = await featureStore.loadFeature(featureId)
        if (!feature) {
          return { success: false, error: 'Feature not found' }
        }

        // In the new task-centric architecture, planning is triggered via PM agent chat
        // This handler is deprecated - use the PM chat interface to request task creation
        if (feature.status !== 'active') {
          return { success: false, error: `Cannot start planning for feature in '${feature.status}' status. Feature must be active.` }
        }

        // For now, just return success - planning is now done through PM agent chat
        console.log(`[FeatureHandlers] feature:startPlanning called for ${featureId} - delegating to PM agent chat`)
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message
        }
      }
    }
  )

  /**
   * Replan a feature - delete all tasks and spec, reset to initial state.
   * Only allowed when feature is in 'active' status.
   */
  ipcMain.handle(
    'feature:replan',
    async (
      _event,
      featureId: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const featureStore = getFeatureStore()
        const projectRoot = getProjectRoot()

        if (!featureStore || !projectRoot) {
          return { success: false, error: 'Storage not initialized' }
        }

        // Load and verify feature status
        const feature = await featureStore.loadFeature(featureId)
        if (!feature) {
          return { success: false, error: 'Feature not found' }
        }

        if (feature.status !== 'active') {
          return { success: false, error: `Cannot replan feature in '${feature.status}' status. Feature must be active.` }
        }

        // Delete spec
        const specStore = getFeatureSpecStore(projectRoot)
        await specStore.deleteSpec(featureId)

        // Create initial task for the feature (same as feature creation)
        // Extract slug from featureId (e.g., "feature-my-feature" -> "my-feature")
        const slug = featureId.replace(/^feature-/, '')
        const initialTask: Task = {
          id: `task-${slug}-initial`,
          title: feature.name,
          spec: feature.description || '',
          status: 'ready',
          blocked: false,
          position: { x: 250, y: 100 },
          dependencies: []
        }

        // Reset DAG via DAGManager to emit events for real-time UI updates
        const { getDAGManager } = await import('./dag-handlers')
        const manager = await getDAGManager(featureId, projectRoot)
        await manager.resetGraph({ nodes: [initialTask], connections: [] })
        console.log(`[FeatureHandlers] DAG reset for replan ${featureId}`)

        // Feature stays in active status - user can interact with PM agent through chat
        feature.updatedAt = new Date().toISOString()
        await featureStore.saveFeature(feature)

        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message
        }
      }
    }
  )

  /**
   * Start investigation for a feature.
   * Triggers the investigation agent to explore the codebase and ask clarifying questions.
   * Streams events to all renderer windows via sdk-agent:stream channel.
   */
  ipcMain.handle(
    'feature:startInvestigation',
    async (
      _event,
      featureId: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const featureStore = getFeatureStore()
        const projectRoot = getProjectRoot()

        if (!featureStore || !projectRoot) {
          return { success: false, error: 'Storage not initialized' }
        }

        // Load feature
        const feature = await featureStore.loadFeature(featureId)
        if (!feature) {
          return { success: false, error: 'Feature not found' }
        }

        if (feature.status !== 'active') {
          return { success: false, error: `Feature must be active to investigate (current: ${feature.status})` }
        }

        // Set PM tools context
        const { setPMToolsFeatureContext } = await import('./pm-tools-handlers')
        setPMToolsFeatureContext(featureId)

        // Build investigation prompt
        const prompt = `I'm starting work on a new feature: "${feature.name}"

${feature.description ? `Description: ${feature.description}` : 'No description provided.'}

Please investigate the codebase to understand how to implement this feature:
1. Search for relevant existing code patterns
2. Identify files that might need changes
3. Ask me clarifying questions if needed

Start by exploring the codebase, then update the feature spec with what you learn.`

        // Get agent service and stream
        const agentService = getAgentService()

        // Start investigation in background and stream to all windows
        ;(async () => {
          try {
            for await (const event of agentService.streamQuery({
              prompt,
              toolPreset: 'projectAgent',
              agentType: 'project',
              featureId,
              cwd: feature.worktreePath || projectRoot,
              permissionMode: 'acceptEdits',
              autoContext: true
            })) {
              // Broadcast event to ALL renderer windows
              broadcastAgentEvent(featureId, event)
            }
          } catch (error) {
            console.error(`[FeatureHandlers] Investigation error for ${featureId}:`, error)
            broadcastAgentEvent(featureId, {
              type: 'error',
              error: error instanceof Error ? error.message : 'Investigation failed'
            })
          }
        })()

        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message
        }
      }
    }
  )
}

/**
 * Broadcast an agent stream event to all renderer windows.
 * Used for automatic investigation to show AI activity in chat panel.
 * Sends to both sdk-agent:stream (legacy) and unified-chat:stream (UnifiedChatPanel).
 */
function broadcastAgentEvent(featureId: string, event: AgentStreamEvent): void {
  const windows = BrowserWindow.getAllWindows()
  // Session ID format for unified chat: "feature-feature-{featureId}"
  const sessionId = `feature-feature-${featureId}`

  for (const win of windows) {
    if (!win.isDestroyed()) {
      // Send to legacy channel with featureId so renderer can filter to correct chat
      win.webContents.send('sdk-agent:stream', { ...event, featureId })
      // Also send to unified chat channel with sessionId format
      win.webContents.send('unified-chat:stream', { sessionId, event })
    }
  }
}

/**
 * Start investigation for a feature internally (called after worktree is ready).
 * Streams AI activity to all renderer windows.
 * Skips if feature already has a spec with content (e.g., moved back to backlog and started again).
 */
async function startInvestigationForFeature(
  featureId: string,
  featureStore: ReturnType<typeof getFeatureStore>,
  projectRoot: string,
  worktreePath: string
): Promise<void> {
  if (!featureStore) return

  // Load feature
  const feature = await featureStore.loadFeature(featureId)
  if (!feature) {
    console.error(`[FeatureHandlers] Feature ${featureId} not found for investigation`)
    return
  }

  // Check if spec already has content - skip investigation if so
  const specStore = getFeatureSpecStore(projectRoot)
  const existingSpec = await specStore.loadSpec(featureId)
  if (existingSpec) {
    const hasContent =
      existingSpec.goals.length > 0 ||
      existingSpec.requirements.length > 0 ||
      existingSpec.constraints.length > 0 ||
      existingSpec.acceptanceCriteria.length > 0
    if (hasContent) {
      console.log(`[FeatureHandlers] Skipping investigation for ${featureId} - spec already has content`)
      return
    }
  }

  // Ensure session exists for storing investigation messages
  // Session ID format: "{agentType}-{type}-{featureId}" = "feature-feature-{featureId}"
  const { getSessionManager } = await import('../services/session-manager')
  const sessionManager = getSessionManager(projectRoot)
  await sessionManager.getOrCreateSession({
    type: 'feature',
    agentType: 'feature',
    featureId
  })
  console.log(`[FeatureHandlers] Ensured session exists for feature ${featureId}`)

  // Set PM tools context for spec management
  const { setPMToolsFeatureContext } = await import('./pm-tools-handlers')
  setPMToolsFeatureContext(featureId)

  // Build investigation prompt for Feature Agent
  const prompt = `I'm starting work on a new feature: "${feature.name}"

${feature.description ? `Description: ${feature.description}` : 'No description provided.'}

Please investigate the codebase and prepare this feature:
1. Search for relevant existing code patterns using Glob/Grep/Read
2. Create a feature spec with goals, requirements, and acceptance criteria using CreateSpec
3. Ask me clarifying questions if the requirements are unclear

Start by exploring the codebase, then call CreateSpec with what you learn.`

  // Get agent service and stream
  const agentService = getAgentService()
  const sessionId = `feature-feature-${featureId}`

  // Track accumulated content for saving to session
  let accumulatedContent = ''

  // Create a user-friendly version of the prompt for the chat
  const userPrompt = `Investigate this feature: "${feature.name}"${feature.description ? `\n\n${feature.description}` : ''}`

  try {
    // Save the investigation request as a user message (so it appears in chat history)
    await sessionManager.addMessage(sessionId, featureId, {
      role: 'user',
      content: userPrompt
    })

    // Broadcast the user message to UI
    broadcastAgentEvent(featureId, {
      type: 'message',
      message: {
        type: 'user',
        content: userPrompt,
        timestamp: new Date().toISOString()
      }
    })

    for await (const event of agentService.streamQuery({
      prompt,
      toolPreset: 'featureAgent',
      agentType: 'feature',
      featureId,
      cwd: worktreePath || projectRoot,
      permissionMode: 'default',
      autoContext: true
    })) {
      // Track message content for persistence
      if (event.type === 'message' && event.message?.content) {
        accumulatedContent = event.message.content
      }

      // Broadcast event to ALL renderer windows
      broadcastAgentEvent(featureId, event)

      // On done, save the accumulated message to session
      if (event.type === 'done' && accumulatedContent) {
        try {
          await sessionManager.addMessage(sessionId, featureId, {
            role: 'assistant',
            content: accumulatedContent
          })
          console.log(`[FeatureHandlers] Saved investigation message to session ${sessionId}`)
        } catch (saveError) {
          console.error(`[FeatureHandlers] Failed to save investigation message:`, saveError)
        }
      }
    }
  } catch (error) {
    console.error(`[FeatureHandlers] Investigation error for ${featureId}:`, error)
    broadcastAgentEvent(featureId, {
      type: 'error',
      error: error instanceof Error ? error.message : 'Investigation failed'
    })
  }
}
