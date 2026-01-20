import { ipcMain } from 'electron'
import { EventEmitter } from 'events'
import { getGitManager } from '../git/git-manager'
import { getAgentPool } from '../agents/agent-pool'
import { getFeatureStore, getProjectRoot } from './storage-handlers'
import { getFeatureWorktreeName, getFeatureBranchName } from '../git/types'
import { FeatureStatusManager } from '../services/feature-status-manager'
import { createPMAgentManager } from '../agent/pm-agent-manager'
import { getAgentService } from '../agent/agent-service'
import { getFeatureSpecStore } from '../agents/feature-spec-store'
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
   * Start worktree creation for a not_started feature.
   * 1. Validates feature is in 'not_started' status
   * 2. Updates feature status to 'creating_worktree' immediately
   * 3. Moves feature data from pending to worktree location
   * 4. Starts git worktree creation asynchronously (non-blocking)
   * 5. Returns immediately while worktree creation happens in background
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

        // Update status to creating_worktree immediately
        const manager = getStatusManager()
        await manager.updateFeatureStatus(featureId, 'creating_worktree')

        // Move feature data from pending to worktree location
        await featureStore.moveFeatureToWorktree(featureId)

        // Start worktree creation asynchronously (non-blocking)
        const gitManager = getGitManager()
        if (gitManager.isInitialized()) {
          gitManager.createFeatureWorktree(featureId)
            .then(async (result) => {
              if (result.success) {
                // Update status to investigating on success
                try {
                  await manager.updateFeatureStatus(featureId, 'investigating')
                  console.log(`[FeatureHandlers] Worktree created, status updated to investigating for ${featureId}`)

                  // Auto-start PM agent for planning
                  // Fire-and-forget - don't block the worktree success flow
                  try {
                    console.log(`[FeatureHandlers] Auto-starting PM agent for ${featureId}`)
                    const feature = await featureStore.loadFeature(featureId)
                    if (feature) {
                      const statusMgr = getStatusManager()
                      const agentSvc = getAgentService()
                      const evtEmitter = new EventEmitter()
                      const projRoot = getProjectRoot()

                      if (projRoot) {
                        // Initialize DAGManager for event broadcasting
                        const { getDAGManager } = await import('./dag-handlers')
                        await getDAGManager(featureId, projRoot)

                        const pmManager = createPMAgentManager(
                          agentSvc,
                          featureStore,
                          statusMgr,
                          evtEmitter,
                          projRoot
                        )
                        // Fire-and-forget - don't await
                        pmManager.startPlanningForFeature(
                          featureId,
                          feature.name,
                          feature.description,
                          feature.attachments
                        ).catch(err => {
                          console.error(`[FeatureHandlers] PM agent planning failed for ${featureId}:`, err)
                        })
                      }
                    }
                  } catch (pmError) {
                    console.error(`[FeatureHandlers] Failed to auto-start PM agent for ${featureId}:`, pmError)
                    // Non-blocking - don't affect worktree success
                  }
                } catch (error) {
                  console.error(`[FeatureHandlers] Failed to update status after worktree creation:`, error)
                }
              } else {
                // Update status back to not_started on failure
                console.error(`[FeatureHandlers] Worktree creation failed for ${featureId}:`, result.error)
                try {
                  await manager.updateFeatureStatus(featureId, 'not_started')
                } catch (error) {
                  console.error(`[FeatureHandlers] Failed to revert status:`, error)
                }
              }
            })
            .catch(async (error) => {
              console.error(`[FeatureHandlers] Worktree creation error for ${featureId}:`, error)
              try {
                await manager.updateFeatureStatus(featureId, 'not_started')
              } catch (revertError) {
                console.error(`[FeatureHandlers] Failed to revert status:`, revertError)
              }
            })
        } else {
          // Git not initialized - skip worktree creation, just update status to investigating
          await manager.updateFeatureStatus(featureId, 'investigating')
          console.log(`[FeatureHandlers] Git not initialized, skipped worktree creation for ${featureId}`)
        }

        return { success: true, featureId }
      } catch (error) {
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
   * Start PM agent planning for a feature.
   * Runs asynchronously - does not block the response.
   */
  ipcMain.handle(
    'feature:startPlanning',
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

        // Create PM agent manager
        const pmManager = createPMAgentManager(
          agentService,
          featureStore,
          statusManager,
          eventEmitter,
          projectRoot
        )

        // Start planning asynchronously (don't await - let it run in background)
        pmManager.startPlanningForFeature(featureId, featureName, description, attachments)
          .catch(error => {
            console.error(`[FeatureHandlers] Planning failed for ${featureId}:`, error)
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
   * Continue PM agent conversation with user's response.
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

        // Create PM agent manager
        const pmManager = createPMAgentManager(
          agentService,
          featureStore,
          statusManager,
          eventEmitter,
          projectRoot
        )

        // Continue pre-planning analysis with user's response
        const result = await pmManager.continuePrePlanningAnalysis(featureId, userResponse)

        // If PM is ready to proceed, trigger full planning
        if (result.canProceed) {
          const feature = await featureStore.loadFeature(featureId)
          if (feature) {
            // Start planning asynchronously (don't await)
            pmManager.startPlanningForFeature(featureId, feature.name, feature.description)
              .catch(error => {
                console.error(`[FeatureHandlers] Planning failed for ${featureId}:`, error)
              })
          }
        }

        return {
          success: true,
          canProceed: result.canProceed,
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
   * Replan a feature - delete all tasks and spec, then restart planning.
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

        if (feature.status !== 'ready' && feature.status !== 'questioning') {
          return { success: false, error: `Cannot replan feature in '${feature.status}' status. Feature must be in 'ready' or 'questioning' status.` }
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

        // Create PM agent manager and start planning
        const pmManager = createPMAgentManager(
          agentService,
          featureStore,
          statusManager,
          eventEmitter,
          projectRoot
        )

        // Start planning asynchronously
        pmManager.startPlanningForFeature(featureId, feature.name, feature.description)
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
