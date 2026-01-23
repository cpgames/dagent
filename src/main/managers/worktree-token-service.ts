/**
 * Token request for the worktree token service.
 */
interface TokenRequest {
  worktreeId: number
  managerId: string
  resolve: () => void
}

/**
 * WorktreeTokenService - Central service for sequential worktree execution.
 *
 * Ensures only one manager can work on a worktree at a time.
 * Managers request tokens and await grant - no polling needed.
 *
 * Features:
 * - One token per worktree (3 total)
 * - FIFO request queue per worktree
 * - Automatic grant to next in queue on release
 */
export class WorktreeTokenService {
  private static instance: WorktreeTokenService | null = null

  // One token per worktree (true = available, false = held)
  private tokens: Map<number, boolean> = new Map()

  // Current holder per worktree
  private holders: Map<number, string | null> = new Map()

  // Pending requests per worktree (FIFO queue)
  private pendingRequests: Map<number, TokenRequest[]> = new Map()

  // Number of worktrees (pool size)
  private poolSize: number

  private constructor(poolSize: number = 3) {
    this.poolSize = poolSize

    // Initialize tokens for each worktree
    for (let i = 1; i <= poolSize; i++) {
      this.tokens.set(i, true)
      this.holders.set(i, null)
      this.pendingRequests.set(i, [])
    }
  }

  /**
   * Get singleton instance.
   */
  static getInstance(poolSize: number = 3): WorktreeTokenService {
    if (!WorktreeTokenService.instance) {
      WorktreeTokenService.instance = new WorktreeTokenService(poolSize)
    }
    return WorktreeTokenService.instance
  }

  /**
   * Reset singleton (for testing).
   */
  static resetInstance(): void {
    WorktreeTokenService.instance = null
  }

  /**
   * Request a token for a worktree.
   * Returns a Promise that resolves when the token is granted.
   *
   * @param worktreeId - The worktree ID (1-based)
   * @param managerId - The requesting manager's ID
   * @returns Promise that resolves when token is granted
   */
  async requestToken(worktreeId: number, managerId: string): Promise<void> {
    if (!this.tokens.has(worktreeId)) {
      throw new Error(`Invalid worktree ID: ${worktreeId}. Valid range: 1-${this.poolSize}`)
    }

    // If token available, grant immediately
    if (this.tokens.get(worktreeId)) {
      this.tokens.set(worktreeId, false)
      this.holders.set(worktreeId, managerId)
      console.log(`[TokenService] Token granted immediately: worktree=${worktreeId}, manager=${managerId}`)
      return
    }

    // Otherwise, queue the request and wait
    console.log(`[TokenService] Token busy, queueing request: worktree=${worktreeId}, manager=${managerId}, holder=${this.holders.get(worktreeId)}`)

    return new Promise((resolve) => {
      this.pendingRequests.get(worktreeId)!.push({
        worktreeId,
        managerId,
        resolve
      })
    })
  }

  /**
   * Release a token for a worktree.
   * If there are pending requests, grants to the next in queue.
   *
   * @param worktreeId - The worktree ID (1-based)
   * @param managerId - The releasing manager's ID
   */
  releaseToken(worktreeId: number, managerId: string): void {
    if (!this.tokens.has(worktreeId)) {
      console.warn(`[TokenService] Invalid worktree ID: ${worktreeId}`)
      return
    }

    // Verify caller holds the token
    if (this.holders.get(worktreeId) !== managerId) {
      console.warn(`[TokenService] Manager ${managerId} tried to release token it doesn't hold for worktree ${worktreeId}`)
      return
    }

    // Check for pending requests
    const pending = this.pendingRequests.get(worktreeId)!
    if (pending.length > 0) {
      // Grant to next in queue
      const next = pending.shift()!
      this.holders.set(worktreeId, next.managerId)
      console.log(`[TokenService] Token transferred: worktree=${worktreeId}, from=${managerId}, to=${next.managerId}`)
      next.resolve()
    } else {
      // No pending requests, token becomes available
      this.tokens.set(worktreeId, true)
      this.holders.set(worktreeId, null)
      console.log(`[TokenService] Token released: worktree=${worktreeId}, manager=${managerId}`)
    }
  }

  /**
   * Check who holds a token (for debugging/monitoring).
   *
   * @param worktreeId - The worktree ID
   * @returns Manager ID holding the token, or null if available
   */
  getHolder(worktreeId: number): string | null {
    return this.holders.get(worktreeId) ?? null
  }

  /**
   * Check pending queue length (for debugging/monitoring).
   *
   * @param worktreeId - The worktree ID
   * @returns Number of pending requests
   */
  getPendingCount(worktreeId: number): number {
    return this.pendingRequests.get(worktreeId)?.length ?? 0
  }

  /**
   * Check if a token is available.
   *
   * @param worktreeId - The worktree ID
   * @returns true if token is available
   */
  isAvailable(worktreeId: number): boolean {
    return this.tokens.get(worktreeId) ?? false
  }

  /**
   * Get status of all worktrees (for debugging/monitoring).
   */
  getStatus(): Array<{ worktreeId: number; available: boolean; holder: string | null; pendingCount: number }> {
    const status: Array<{ worktreeId: number; available: boolean; holder: string | null; pendingCount: number }> = []

    for (let i = 1; i <= this.poolSize; i++) {
      status.push({
        worktreeId: i,
        available: this.tokens.get(i) ?? false,
        holder: this.holders.get(i) ?? null,
        pendingCount: this.pendingRequests.get(i)?.length ?? 0
      })
    }

    return status
  }
}
