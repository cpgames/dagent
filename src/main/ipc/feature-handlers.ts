import { ipcMain, BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { getGitManager } from '../git/git-manager'
import { getAgentPool } from '../agents/agent-pool'
import { getFeatureStore, getProjectRoot } from './storage-handlers'
import { getFeatureWorktreeName, getFeatureBranchName } from '../git/types'
import { FeatureStatusManager } from '../services/feature-status-manager'
import { createInvestigationAgent } from '../agent/investigation-agent'
import { createPlanningAgent } from '../agent/planning-agent'
import { getAgentService } from '../agent/agent-service'
import { getFeatureSpecStore } from '../agents/feature-spec-store'
import { getFeatureManagerPool } from '../git/worktree-pool-manager'
import { getSessionManager } from '../services/session-manager'
import { getOrchestrator } from '../dag-engine/orchestrator'
import type { FeatureStatus } from '@shared/types/feature'
import type { Task } from '@shared/types/task'
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
   * 2. Remove all task worktrees for the feature
   * 3. Remove the feature worktree
   * 4. Delete the feature branch (if option is true)
   * 5. Delete feature storage (.dagent/worktrees/{featureId}/)
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

          // Step 3: Remove the feature worktree
          const featureWorktreeName = getFeatureWorktreeName(featureId)
          const featureWorktreePath = path.join(config.worktreesDir, featureWorktreeName)

          // Find feature worktree with normalized path comparison
          const normalizedFeatureWorktreePath = path.normalize(featureWorktreePath)
          const featureWorktree = worktrees.find((w) => path.normalize(w.path) === normalizedFeatureWorktreePath)

          if (featureWorktree) {
            try {
              // Don't delete branch here - we'll do it separately if option is set
              const result = await gitManager.removeWorktree(featureWorktree.path, false)
              if (result.success) {
                deletedWorktrees++
              } else if (result.error) {
                errors.push(`Feature worktree: ${result.error}`)
              }
            } catch (err) {
              errors.push(`Feature worktree: ${(err as Error).message}`)
            }
          } else {
            console.warn(`[FeatureDelete] Feature worktree not found in git worktree list: ${featureWorktreePath}`)
            // Try to remove it anyway in case it exists but wasn't registered
            try {
              const result = await gitManager.removeWorktree(featureWorktreePath, false)
              if (result.success) {
                deletedWorktrees++
              }
            } catch (err) {
              // Ignore - worktree probably doesn't exist
              console.warn(`[FeatureDelete] Could not remove feature worktree: ${(err as Error).message}`)
            }
          }

          // Step 3.5: Prune worktrees to clean up stale references before branch deletion
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

          // Step 4b: Clean up any remaining worktree directories on disk
          // (handles cases where git worktree remove left empty folders or worktrees weren't registered)
          try {
            const worktreesDir = config.worktreesDir
            const dirEntries = await fs.readdir(worktreesDir, { withFileTypes: true })
            for (const entry of dirEntries) {
              if (entry.isDirectory()) {
                // Check if directory belongs to this feature (featureId--task-* or feature/{featureId}/*)
                if (entry.name.startsWith(`${featureId}--`) || entry.name === getFeatureWorktreeName(featureId)) {
                  const dirPath = path.join(worktreesDir, entry.name)
                  try {
                    await fs.rm(dirPath, { recursive: true, force: true })
                    console.log(`[FeatureDelete] Cleaned up leftover directory: ${dirPath}`)
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
   * This is called when the user clicks "Start" on a not_started feature.
   * The feature is assigned to a pool worktree (creating one on demand if needed).
   *
   * Pool-based flow:
   * 1. Validate feature is in 'not_started' status
   * 2. Get target branch (current branch) for later merge
   * 3. Assign feature to pool (creates pool worktree on demand)
   * 4. Store pool assignment in feature (poolId, queuePosition, targetBranch)
   * 5. If queue position is 0 (immediately active):
   *    - Transition to 'investigating'
   *    - Start PM agent for planning
   * 6. If queued (position > 0):
   *    - Stay in 'queued' status
   *    - Feature will be started when pool becomes available
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

        if (feature.status !== 'not_started') {
          return {
            success: false,
            error: `Feature ${featureId} is not in not_started status (current: ${feature.status})`
          }
        }

        // Get target branch (current branch) for later merge
        const gitManager = getGitManager()
        const targetBranch = await gitManager.getCurrentBranch()

        // Initialize pool manager if needed
        const poolManager = getFeatureManagerPool()
        if (!poolManager.isInitialized()) {
          await poolManager.initialize(projectRoot)
        }

        // Assign feature to manager (this creates worktree on demand)
        console.log(`[FeatureHandlers] Assigning feature ${featureId} to manager`)
        const assignment = await poolManager.assignFeature(featureId, targetBranch)

        // Update feature with manager assignment info and save BEFORE status transition
        // IMPORTANT: Set managerWorktreePath NOW so that when status changes to creating_worktree,
        // the feature-store knows where to save data (avoids falling back to legacy paths)
        const { getManagerWorktreePath } = await import('../../shared/types/pool')
        const expectedWorktreePath = getManagerWorktreePath(projectRoot, assignment.featureManagerId)

        feature.featureManagerId = assignment.featureManagerId
        feature.queuePosition = assignment.queuePosition
        feature.targetBranch = targetBranch
        feature.managerWorktreePath = expectedWorktreePath  // Set worktree path early!
        feature.updatedAt = new Date().toISOString()
        await featureStore.saveFeature(feature)
        console.log(`[FeatureHandlers] Saved feature ${featureId} with manager ${assignment.featureManagerId}, worktreePath=${expectedWorktreePath}`)

        if (assignment.queuePosition === 0) {
          // Feature is immediately active - assigned to a manager
          const statusMgr = getStatusManager()

          // STEP 1: Immediately transition to creating_worktree so UI updates
          await statusMgr.updateFeatureStatus(featureId, 'creating_worktree')
          console.log(`[FeatureHandlers] Feature ${featureId} moved to creating_worktree`)

          // Broadcast manager assignment to UI
          const allWindows = BrowserWindow.getAllWindows()
          for (const win of allWindows) {
            if (!win.isDestroyed()) {
              win.webContents.send('feature:manager-assigned', {
                featureId,
                featureManagerId: assignment.featureManagerId,
                queuePosition: assignment.queuePosition
              })
            }
          }

          console.log(`[FeatureHandlers] Feature ${featureId} assigned to manager ${assignment.featureManagerId}`)

          // STEP 2: Create worktree and start PM agent asynchronously (fire-and-forget)
          // This allows the IPC handler to return immediately so UI can update
          ;(async () => {
            try {
              // Ensure worktree exists for the assigned manager
              console.log(`[FeatureHandlers] Ensuring worktree for manager ${assignment.featureManagerId}`)
              const worktreePath = await poolManager.ensureWorktree(assignment.featureManagerId)
              console.log(`[FeatureHandlers] Worktree ready at: ${worktreePath}`)

              // Move feature files to manager worktree
              await featureStore.moveFeatureToWorktree(featureId, worktreePath)
              console.log(`[FeatureHandlers] Moved feature ${featureId} to worktree storage at ${worktreePath}`)

              // Transition to investigating (worktree is ready)
              await statusMgr.updateFeatureStatus(featureId, 'investigating')
              console.log(`[FeatureHandlers] Feature ${featureId} moved to investigating`)

              // Reload feature to get fresh data for PM agent
              const freshFeature = await featureStore.loadFeature(featureId)
              if (!freshFeature) {
                throw new Error(`Feature ${featureId} not found after worktree setup`)
              }

              console.log(`[FeatureHandlers] Starting PM agent for ${featureId} (status: ${freshFeature.status})`)

              // Auto-start PM agent for investigation
              const agentSvc = getAgentService()
              const evtEmitter = new EventEmitter()

              // Initialize DAGManager for event broadcasting
              const { getDAGManager } = await import('./dag-handlers')
              await getDAGManager(featureId, projectRoot)

              const investigationAgent = createInvestigationAgent(
                agentSvc,
                featureStore,
                statusMgr,
                evtEmitter,
                projectRoot
              )

              // Start investigation (fire-and-forget) - this gathers requirements
              investigationAgent.startInvestigation(
                featureId,
                freshFeature.name,
                freshFeature.description,
                freshFeature.attachments
              ).catch(err => {
                console.error(`[FeatureHandlers] Investigation agent failed for ${featureId}:`, err)
              })
            } catch (err) {
              console.error(`[FeatureHandlers] Failed during worktree setup or PM agent start for ${featureId}:`, err)
              // On error, transition back to not_started so user can retry
              try {
                const currentFeature = await featureStore.loadFeature(featureId)
                if (currentFeature && currentFeature.status !== 'not_started') {
                  currentFeature.status = 'not_started'
                  currentFeature.updatedAt = new Date().toISOString()
                  await featureStore.saveFeature(currentFeature)
                  const windows = BrowserWindow.getAllWindows()
                  for (const win of windows) {
                    if (!win.isDestroyed()) {
                      win.webContents.send('feature:status-changed', { featureId, status: 'not_started' })
                    }
                  }
                }
              } catch (revertErr) {
                console.error(`[FeatureHandlers] Failed to revert status for ${featureId}:`, revertErr)
              }
            }
          })()
        } else {
          // Feature is queued (queuePosition > 0) - save assignment, status stays as creating_worktree
          // Queue position is tracked via queuePosition property, not via status
          await featureStore.saveFeature(feature)

          // Broadcast manager assignment for queued features
          const allWindows = BrowserWindow.getAllWindows()
          for (const win of allWindows) {
            if (!win.isDestroyed()) {
              win.webContents.send('feature:manager-assigned', {
                featureId,
                featureManagerId: assignment.featureManagerId,
                queuePosition: assignment.queuePosition
              })
            }
          }

          console.log(`[FeatureHandlers] Feature ${featureId} queued at position ${assignment.queuePosition} in manager ${assignment.featureManagerId} (status: creating_worktree)`)
        }

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
   * Stores file in .dagent-worktrees/{featureId}/.dagent/attachments/
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
   * Used by startWorktreeCreation for initial planning.
   * Runs asynchronously - does not block the response.
   */
  ipcMain.handle(
    'feature:startPlanningFull',
    async (
      _event,
      featureId: string,
      featureName: string,
      description?: string,
      attachments?: string[]
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const featureStore = getFeatureStore()
        const projectRoot = getProjectRoot()

        if (!featureStore || !projectRoot) {
          throw new Error('FeatureStore not initialized. Call initializeStorage first.')
        }

        // IMPORTANT: Initialize DAGManager with event broadcasting BEFORE planning starts.
        // This ensures that any tasks created by the PM agent will broadcast events to the renderer.
        const { getDAGManager } = await import('./dag-handlers')
        await getDAGManager(featureId, projectRoot)
        console.log(`[FeatureHandlers] DAGManager initialized for ${featureId} before planning`)

        const statusManager = getStatusManager()
        const agentService = getAgentService()
        const eventEmitter = new EventEmitter()

        // Create investigation agent
        const investigationAgent = createInvestigationAgent(
          agentService,
          featureStore,
          statusManager,
          eventEmitter,
          projectRoot
        )

        // Start investigation asynchronously (don't await - let it run in background)
        investigationAgent.startInvestigation(featureId, featureName, description, attachments)
          .catch(error => {
            console.error(`[FeatureHandlers] Investigation failed for ${featureId}:`, error)
          })

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
   * Continue investigation agent conversation with user's response.
   * This is called when user sends a message in chat during the planning phase.
   */
  ipcMain.handle(
    'feature:respondToPM',
    async (
      _event,
      featureId: string,
      userResponse: string
    ): Promise<{ success: boolean; canProceed: boolean; uncertainties?: string[]; error?: string }> => {
      try {
        const featureStore = getFeatureStore()
        const projectRoot = getProjectRoot()

        if (!featureStore || !projectRoot) {
          return { success: false, canProceed: false, error: 'Storage not initialized' }
        }

        // Get services for PM agent
        const agentService = getAgentService()
        if (!agentService) {
          return { success: false, canProceed: false, error: 'Agent service not available' }
        }

        const statusManager = getStatusManager()
        const eventEmitter = new EventEmitter()

        // Create investigation agent
        const investigationAgent = createInvestigationAgent(
          agentService,
          featureStore,
          statusManager,
          eventEmitter,
          projectRoot
        )

        // Continue investigation with user's response
        const result = await investigationAgent.continueInvestigation(featureId, userResponse)

        // Auto-proceed to task creation when investigation is ready
        if (result.isReady) {
          console.log(`[feature:respondToPM] Investigation complete, auto-proceeding to task creation for ${featureId}`)

          // Add confirmation message
          const sessionManager = getSessionManager(projectRoot)
          await sessionManager.addMessage(result.sessionId, featureId, {
            role: 'assistant',
            content: 'Investigation complete. Proceeding to create tasks...'
          })

          // Broadcast chat update
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('chat:updated', { featureId })
            }
          })

          // Create planning agent and start task creation
          const planningAgent = createPlanningAgent(
            agentService,
            featureStore,
            statusManager,
            eventEmitter,
            projectRoot
          )

          // Auto-proceed to task creation
          await planningAgent.createTasksFromSpec(featureId)
        }

        return {
          success: true,
          canProceed: result.isReady,
          uncertainties: result.uncertainties
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

        // Only allow starting planning from ready_for_planning or investigating status
        if (feature.status !== 'ready_for_planning' && feature.status !== 'investigating') {
          return { success: false, error: `Cannot start planning for feature in '${feature.status}' status. Feature must be in 'ready_for_planning' or 'investigating' status.` }
        }

        // Get services for PM agent
        const agentService = getAgentService()
        if (!agentService) {
          return { success: false, error: 'Agent service not available' }
        }

        const statusManager = getStatusManager()
        const eventEmitter = new EventEmitter()

        // Create planning agent
        const planningAgent = createPlanningAgent(
          agentService,
          featureStore,
          statusManager,
          eventEmitter,
          projectRoot
        )

        // Create tasks from existing spec (don't await - let it run in background)
        planningAgent.createTasksFromSpec(featureId)
          .catch(error => {
            console.error(`[FeatureHandlers] Task creation failed for ${featureId}:`, error)
          })

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
   * Replan a feature - delete all tasks and spec, then restart investigation.
   * Only allowed when feature is in 'backlog' or 'needs_attention' status.
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

        if (feature.status !== 'ready' && feature.status !== 'ready_for_planning' && feature.status !== 'investigating') {
          return { success: false, error: `Cannot replan feature in '${feature.status}' status. Feature must be in 'ready', 'ready_for_planning', or 'investigating' status.` }
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
          description: feature.description || '',
          status: 'needs_analysis',
          locked: false,
          position: { x: 250, y: 100 }
        }

        // Reset DAG via DAGManager to emit events for real-time UI updates
        const { getDAGManager } = await import('./dag-handlers')
        const manager = await getDAGManager(featureId, projectRoot)
        await manager.resetGraph({ nodes: [initialTask], connections: [] })
        console.log(`[FeatureHandlers] DAG reset for replan ${featureId}`)

        // Update feature status to planning
        feature.status = 'planning'
        feature.updatedAt = new Date().toISOString()
        await featureStore.saveFeature(feature)

        // Get services for PM agent
        const agentService = getAgentService()
        if (!agentService) {
          return { success: false, error: 'Agent service not available' }
        }

        const statusManager = getStatusManager()
        const eventEmitter = new EventEmitter()

        // Create investigation agent and restart from scratch
        const investigationAgent = createInvestigationAgent(
          agentService,
          featureStore,
          statusManager,
          eventEmitter,
          projectRoot
        )

        // Start investigation asynchronously (full replan from scratch)
        investigationAgent.startInvestigation(featureId, feature.name, feature.description, feature.attachments)
          .catch(error => {
            console.error(`[FeatureHandlers] Replanning failed for ${featureId}:`, error)
          })

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
