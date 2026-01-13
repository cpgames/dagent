/**
 * Git state store for renderer process.
 * Manages git branch information and status displayed in status bar.
 */

import { create } from 'zustand'

interface BranchInfo {
  name: string
  current: boolean
  commit: string
  label: string
}

interface GitState {
  currentBranch: string | null
  isLoading: boolean
  error: string | null
  // Status fields (Phase 14-01)
  isDirty: boolean
  staged: number
  modified: number
  untracked: number
  ahead: number
  behind: number
  // Branch list (Phase 14-02)
  branches: BranchInfo[]
  isLoadingBranches: boolean
  isCheckingOut: boolean
}

interface GitActions {
  loadBranch: () => Promise<void>
  loadStatus: () => Promise<void>
  refreshStatus: () => Promise<void>
  setBranch: (branch: string | null) => void
  setError: (error: string | null) => void
  // Branch actions (Phase 14-02)
  loadBranches: () => Promise<void>
  checkoutBranch: (name: string) => Promise<boolean>
}

type GitStore = GitState & GitActions

export const useGitStore = create<GitStore>((set, get) => ({
  // State
  currentBranch: null,
  isLoading: false,
  error: null,
  // Status fields (Phase 14-01)
  isDirty: false,
  staged: 0,
  modified: 0,
  untracked: 0,
  ahead: 0,
  behind: 0,
  // Branch list (Phase 14-02)
  branches: [],
  isLoadingBranches: false,
  isCheckingOut: false,

  // Actions
  loadBranch: async () => {
    set({ isLoading: true, error: null })
    try {
      // Check if git is initialized
      const isInitialized = await window.electronAPI.git.isInitialized()
      if (!isInitialized) {
        set({
          currentBranch: null,
          isLoading: false,
          error: 'Git not initialized',
          isDirty: false,
          staged: 0,
          modified: 0,
          untracked: 0,
          ahead: 0,
          behind: 0
        })
        return
      }

      const branch = await window.electronAPI.git.getCurrentBranch()
      set({ currentBranch: branch, isLoading: false })

      // Also load full status
      await get().loadStatus()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get branch'
      set({ currentBranch: null, isLoading: false, error: message })
    }
  },

  loadStatus: async () => {
    try {
      const isInitialized = await window.electronAPI.git.isInitialized()
      if (!isInitialized) {
        return
      }

      const result = await window.electronAPI.git.getStatus()
      if (!result.success || !result.data) {
        return
      }

      // Parse StatusResult from simple-git
      const status = result.data as {
        staged: string[]
        modified: string[]
        not_added: string[]
        ahead: number
        behind: number
      }

      const staged = status.staged?.length ?? 0
      const modified = status.modified?.length ?? 0
      const untracked = status.not_added?.length ?? 0
      const ahead = status.ahead ?? 0
      const behind = status.behind ?? 0
      const isDirty = staged > 0 || modified > 0 || untracked > 0

      set({ isDirty, staged, modified, untracked, ahead, behind })
    } catch (err) {
      console.error('Failed to load git status:', err)
    }
  },

  refreshStatus: async () => {
    // Only updates status without full branch reload
    await get().loadStatus()
  },

  setBranch: (branch) => set({ currentBranch: branch }),
  setError: (error) => set({ error }),

  // Branch actions (Phase 14-02)
  loadBranches: async () => {
    set({ isLoadingBranches: true })
    try {
      const isInitialized = await window.electronAPI.git.isInitialized()
      if (!isInitialized) {
        set({ branches: [], isLoadingBranches: false })
        return
      }

      const branches = await window.electronAPI.git.listBranches()
      set({ branches, isLoadingBranches: false })
    } catch (err) {
      console.error('Failed to load branches:', err)
      set({ branches: [], isLoadingBranches: false })
    }
  },

  checkoutBranch: async (name: string) => {
    set({ isCheckingOut: true })
    try {
      const result = await window.electronAPI.git.checkout(name)
      if (result.success) {
        // Reload branch and status after successful checkout
        await get().loadBranch()
        await get().loadBranches()
        set({ isCheckingOut: false })
        return true
      } else {
        set({ isCheckingOut: false, error: result.error || 'Checkout failed' })
        return false
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed'
      set({ isCheckingOut: false, error: message })
      return false
    }
  }
}))
