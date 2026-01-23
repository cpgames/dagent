/**
 * MergeManager
 *
 * Central singleton for managing all merge operations in DAGent.
 * Processes merge requests sequentially through a queue system.
 *
 * Key responsibilities:
 * - Queue merge requests from FeatureManagers
 * - Process one merge at a time
 * - Handle AI-assisted conflict resolution
 * - Emit events for merge lifecycle
 *
 * Merge types:
 * - preparation: Sync manager branch with target before starting feature
 * - completion: Push manager branch changes back to target
 * - bidirectional: Full sync (target→manager then manager→target)
 */

import { EventEmitter } from 'events'
import { randomBytes } from 'crypto'
import { getGitManager } from '../git/git-manager'

/**
 * Generate a simple unique ID for merge requests
 */
function generateMergeRequestId(): string {
  return `merge-${Date.now()}-${randomBytes(4).toString('hex')}`
}
import { getAgentService } from '../agent'
import { RequestPriority } from '../agent/request-types'
import type {
  MergeRequest,
  MergeOperationResult,
  MergeManagerEvents,
  MergeManagerStatus,
  CreateMergeRequestOptions,
  MergeRequestStatus
} from './merge-types'
import type { MergeResult, MergeConflict } from '../git/types'

/**
 * MergeManager - Singleton for centralized merge handling
 */
export class MergeManager extends EventEmitter {
  private static instance: MergeManager | null = null

  private _projectRoot: string | null = null
  private initialized: boolean = false

  /** Queue of pending merge requests */
  private queue: MergeRequest[] = []

  /** Currently processing request */
  private currentRequest: MergeRequest | null = null

  /** Whether we're currently processing */
  private processing: boolean = false

  private constructor() {
    super()
  }

  // ===========================================================================
  // Singleton
  // ===========================================================================

  static getInstance(): MergeManager {
    if (!MergeManager.instance) {
      MergeManager.instance = new MergeManager()
    }
    return MergeManager.instance
  }

  static reset(): void {
    if (MergeManager.instance) {
      MergeManager.instance.removeAllListeners()
      MergeManager.instance.queue = []
      MergeManager.instance.currentRequest = null
      MergeManager.instance.processing = false
      MergeManager.instance.initialized = false
      MergeManager.instance._projectRoot = null
    }
    MergeManager.instance = null
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the merge manager for a project
   */
  initialize(projectRoot: string): void {
    this._projectRoot = projectRoot
    this.initialized = true
    console.log(`[MergeManager] Initialized for ${projectRoot}`)
  }

  getProjectRoot(): string | null {
    return this._projectRoot
  }

  isInitialized(): boolean {
    return this.initialized
  }

  // ===========================================================================
  // Queue Operations
  // ===========================================================================

  /**
   * Submit a merge request to the queue
   * @returns The created request with its ID
   */
  async submitRequest(options: CreateMergeRequestOptions): Promise<MergeRequest> {
    if (!this.initialized) {
      throw new Error('MergeManager not initialized')
    }

    const request: MergeRequest = {
      id: generateMergeRequestId(),
      type: options.type,
      sourceBranch: options.sourceBranch,
      targetBranch: options.targetBranch,
      featureId: options.featureId,
      featureManagerId: options.featureManagerId,
      workingDirectory: options.workingDirectory,
      status: 'pending',
      createdAt: new Date().toISOString(),
      useAIConflictResolution: options.useAIConflictResolution ?? true,
      priority: options.priority ?? 0
    }

    // Insert by priority (higher priority first)
    const insertIndex = this.queue.findIndex(r => (r.priority ?? 0) < (request.priority ?? 0))
    if (insertIndex === -1) {
      this.queue.push(request)
    } else {
      this.queue.splice(insertIndex, 0, request)
    }

    const queuePosition = this.queue.indexOf(request) + 1

    console.log(`[MergeManager] Request ${request.id} queued at position ${queuePosition}: ${request.type} ${request.sourceBranch} → ${request.targetBranch}`)

    this.emit('merge:queued', { request, queuePosition })
    this.emitQueueUpdate()

    // Start processing if not already
    this.processNext()

    return request
  }

  /**
   * Cancel a pending merge request
   */
  cancelRequest(requestId: string): boolean {
    const index = this.queue.findIndex(r => r.id === requestId)
    if (index === -1) {
      return false
    }

    this.queue.splice(index, 1)
    console.log(`[MergeManager] Request ${requestId} cancelled`)
    this.emitQueueUpdate()
    return true
  }

  /**
   * Get a request by ID (from queue or current)
   */
  getRequest(requestId: string): MergeRequest | null {
    if (this.currentRequest?.id === requestId) {
      return this.currentRequest
    }
    return this.queue.find(r => r.id === requestId) ?? null
  }

  /**
   * Get all requests for a feature
   */
  getRequestsForFeature(featureId: string): MergeRequest[] {
    const requests: MergeRequest[] = []
    if (this.currentRequest?.featureId === featureId) {
      requests.push(this.currentRequest)
    }
    requests.push(...this.queue.filter(r => r.featureId === featureId))
    return requests
  }

  // ===========================================================================
  // Processing
  // ===========================================================================

  /**
   * Process the next request in queue
   */
  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true
    this.currentRequest = this.queue.shift()!
    this.currentRequest.status = 'in_progress'
    this.currentRequest.startedAt = new Date().toISOString()

    console.log(`[MergeManager] Processing request ${this.currentRequest.id}: ${this.currentRequest.type}`)
    this.emit('merge:started', { request: this.currentRequest })
    this.emitQueueUpdate()

    try {
      const result = await this.executeRequest(this.currentRequest)

      this.currentRequest.status = result.success ? 'completed' : 'failed'
      this.currentRequest.completedAt = new Date().toISOString()

      if (!result.success) {
        this.currentRequest.error = result.error
        this.currentRequest.conflicts = result.mergeResult?.conflicts
      }

      console.log(`[MergeManager] Request ${this.currentRequest.id} ${result.success ? 'completed' : 'failed'}`)
      this.emit('merge:completed', result)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[MergeManager] Request ${this.currentRequest.id} error:`, error)

      this.currentRequest.status = 'failed'
      this.currentRequest.completedAt = new Date().toISOString()
      this.currentRequest.error = errorMsg

      this.emit('merge:completed', {
        success: false,
        request: this.currentRequest,
        error: errorMsg
      })
    } finally {
      this.currentRequest = null
      this.processing = false
      this.emitQueueUpdate()

      // Process next in queue
      if (this.queue.length > 0) {
        // Small delay to allow event handlers to process
        setTimeout(() => this.processNext(), 100)
      }
    }
  }

  /**
   * Execute a merge request
   */
  private async executeRequest(request: MergeRequest): Promise<MergeOperationResult> {
    const gitManager = getGitManager()
    if (!gitManager) {
      return {
        success: false,
        request,
        error: 'GitManager not available'
      }
    }

    switch (request.type) {
      case 'preparation':
        return this.executePreparationMerge(request, gitManager)

      case 'completion':
        return this.executeCompletionMerge(request, gitManager)

      case 'bidirectional':
        return this.executeBidirectionalMerge(request, gitManager)

      default:
        return {
          success: false,
          request,
          error: `Unknown merge type: ${request.type}`
        }
    }
  }

  /**
   * Execute preparation merge: target → manager
   * Syncs manager branch with latest from target before starting feature work
   */
  private async executePreparationMerge(
    request: MergeRequest,
    gitManager: ReturnType<typeof getGitManager>
  ): Promise<MergeOperationResult> {
    this.updateRequestStatus(request, 'syncing')
    this.emit('merge:syncing', { request })

    // Merge target branch INTO manager branch (in manager worktree)
    const result = await gitManager.mergeInWorktree(
      request.workingDirectory,
      request.sourceBranch // target branch is source for preparation
    )

    if (result.success) {
      return {
        success: true,
        request,
        mergeResult: result
      }
    }

    // Handle conflicts
    if (result.conflicts && result.conflicts.length > 0) {
      return this.handleConflicts(request, result, 'preparation')
    }

    return {
      success: false,
      request,
      mergeResult: result,
      error: result.error || 'Preparation merge failed'
    }
  }

  /**
   * Execute completion merge: manager → target
   * Pushes feature work from manager branch back to target
   */
  private async executeCompletionMerge(
    request: MergeRequest,
    gitManager: ReturnType<typeof getGitManager>
  ): Promise<MergeOperationResult> {
    this.updateRequestStatus(request, 'integrating')
    this.emit('merge:integrating', { request })

    // Merge manager branch INTO target branch
    // This needs to be done in the main repo (not worktree)
    const result = await gitManager.mergeBranchIntoTarget(
      request.sourceBranch, // manager branch
      request.targetBranch
    )

    if (result.success) {
      return {
        success: true,
        request,
        mergeResult: result
      }
    }

    // Handle conflicts
    if (result.conflicts && result.conflicts.length > 0) {
      return this.handleConflicts(request, result, 'completion')
    }

    return {
      success: false,
      request,
      mergeResult: result,
      error: result.error || 'Completion merge failed'
    }
  }

  /**
   * Execute bidirectional merge: target → manager, then manager → target
   * Full sync for feature completion
   */
  private async executeBidirectionalMerge(
    request: MergeRequest,
    gitManager: ReturnType<typeof getGitManager>
  ): Promise<MergeOperationResult> {
    // Phase 1: Sync (target → manager)
    this.updateRequestStatus(request, 'syncing')
    this.emit('merge:syncing', { request })

    const syncResult = await gitManager.mergeInWorktree(
      request.workingDirectory,
      request.targetBranch // target is what we're syncing FROM
    )

    if (!syncResult.success) {
      // Handle conflicts in sync phase
      if (syncResult.conflicts && syncResult.conflicts.length > 0) {
        const conflictResult = await this.handleConflicts(request, syncResult, 'sync')
        if (!conflictResult.success) {
          return conflictResult
        }
        // Conflicts resolved, continue to integrate phase
      } else {
        return {
          success: false,
          request,
          mergeResult: syncResult,
          error: syncResult.error || 'Sync phase failed'
        }
      }
    }

    // Phase 2: Integrate (manager → target)
    this.updateRequestStatus(request, 'integrating')
    this.emit('merge:integrating', { request })

    const integrateResult = await gitManager.mergeBranchIntoTarget(
      request.sourceBranch, // manager branch
      request.targetBranch
    )

    if (integrateResult.success) {
      return {
        success: true,
        request,
        mergeResult: syncResult,
        integrateResult
      }
    }

    // Conflicts in integrate phase are unexpected (should be clean after sync)
    if (integrateResult.conflicts && integrateResult.conflicts.length > 0) {
      return {
        success: false,
        request,
        mergeResult: syncResult,
        integrateResult,
        error: `Unexpected conflicts in integrate phase: ${integrateResult.conflicts.length} files`
      }
    }

    return {
      success: false,
      request,
      mergeResult: syncResult,
      integrateResult,
      error: integrateResult.error || 'Integrate phase failed'
    }
  }

  /**
   * Handle merge conflicts, optionally using AI resolution
   */
  private async handleConflicts(
    request: MergeRequest,
    mergeResult: MergeResult,
    phase: string
  ): Promise<MergeOperationResult> {
    const conflicts = mergeResult.conflicts || []

    this.updateRequestStatus(request, 'resolving')
    this.emit('merge:conflicts', { request, conflicts })

    console.log(`[MergeManager] ${conflicts.length} conflicts in ${phase} phase for request ${request.id}`)

    if (!request.useAIConflictResolution) {
      return {
        success: false,
        request,
        mergeResult,
        error: `${conflicts.length} conflicts require manual resolution`
      }
    }

    // Attempt AI resolution
    try {
      const resolved = await this.resolveConflictsWithAI(request, conflicts)

      if (resolved) {
        // Commit the resolved merge
        const gitManager = getGitManager()
        if (gitManager) {
          const commitResult = await gitManager.commitMerge(
            request.workingDirectory,
            `Merge ${request.sourceBranch} into ${request.targetBranch} (conflicts resolved by AI)`
          )

          if (commitResult.success) {
            this.emit('merge:conflicts-resolved', { request, count: conflicts.length })

            return {
              success: true,
              request,
              mergeResult: { ...mergeResult, success: true, conflicts: [] },
              conflictsResolved: conflicts.length
            }
          }
        }
      }
    } catch (error) {
      console.error(`[MergeManager] AI conflict resolution failed:`, error)
    }

    return {
      success: false,
      request,
      mergeResult,
      error: `Failed to resolve ${conflicts.length} conflicts in ${phase} phase`
    }
  }

  /**
   * Use AI to resolve merge conflicts
   */
  private async resolveConflictsWithAI(
    request: MergeRequest,
    conflicts: MergeConflict[]
  ): Promise<boolean> {
    const agentService = getAgentService()
    const conflictFiles = conflicts.map(c => c.file)

    const prompt = this.buildConflictResolutionPrompt(request, conflictFiles)

    let resolved = false

    for await (const event of agentService.streamQuery({
      prompt,
      toolPreset: 'mergeAgent',
      permissionMode: 'acceptEdits',
      cwd: request.workingDirectory,
      agentType: 'merge',
      agentId: `merge-${request.id}`,
      priority: RequestPriority.MERGE
    })) {
      if (event.type === 'message' && event.message?.type === 'result') {
        const content = event.message.content.toLowerCase()
        resolved = content.includes('resolved') ||
                  content.includes('conflicts fixed') ||
                  content.includes('successfully')
      }
    }

    return resolved
  }

  /**
   * Build prompt for AI conflict resolution
   */
  private buildConflictResolutionPrompt(request: MergeRequest, conflictFiles: string[]): string {
    return `# Merge Conflict Resolution

## Context
You are resolving merge conflicts for a ${request.type} merge.
- Source branch: ${request.sourceBranch}
- Target branch: ${request.targetBranch}
- Feature ID: ${request.featureId}

## Conflicts
The following ${conflictFiles.length} file(s) have merge conflicts:
${conflictFiles.map(f => `- ${f}`).join('\n')}

## Instructions
1. Read each conflicting file to understand the conflicts
2. For each conflict:
   - Analyze what changes are from each branch
   - Preserve the most important changes based on the merge type
   - For preparation merges: prefer keeping target branch updates
   - For completion merges: prefer keeping source (feature work) changes
3. Edit each file to resolve the conflict markers (<<<<<<<, =======, >>>>>>>)
4. After resolving all conflicts, respond with "CONFLICTS RESOLVED"

Important: Ensure no conflict markers remain in any file.`
  }

  /**
   * Update request status
   */
  private updateRequestStatus(request: MergeRequest, status: MergeRequestStatus): void {
    request.status = status
  }

  /**
   * Emit queue update event
   */
  private emitQueueUpdate(): void {
    this.emit('queue:updated', {
      queueLength: this.queue.length,
      currentRequest: this.currentRequest
    })
  }

  // ===========================================================================
  // Status
  // ===========================================================================

  /**
   * Get current status of the merge manager
   */
  getStatus(): MergeManagerStatus {
    return {
      initialized: this.initialized,
      currentRequest: this.currentRequest,
      queueLength: this.queue.length,
      pendingRequests: [...this.queue],
      isBusy: this.processing
    }
  }

  /**
   * Check if any merge is in progress
   */
  isBusy(): boolean {
    return this.processing
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length
  }

  // ===========================================================================
  // Event Typing Helpers
  // ===========================================================================

  emit<K extends keyof MergeManagerEvents>(
    event: K,
    data: MergeManagerEvents[K]
  ): boolean {
    return super.emit(event, data)
  }

  on<K extends keyof MergeManagerEvents>(
    event: K,
    listener: (data: MergeManagerEvents[K]) => void
  ): this {
    return super.on(event, listener)
  }

  once<K extends keyof MergeManagerEvents>(
    event: K,
    listener: (data: MergeManagerEvents[K]) => void
  ): this {
    return super.once(event, listener)
  }
}

/**
 * Get the singleton MergeManager instance
 */
export function getMergeManager(): MergeManager {
  return MergeManager.getInstance()
}
