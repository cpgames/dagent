/**
 * Git state store for renderer process.
 * Manages git branch information displayed in status bar.
 */

import { create } from 'zustand'

interface GitState {
  currentBranch: string | null
  isLoading: boolean
  error: string | null
}

interface GitActions {
  loadBranch: () => Promise<void>
  setBranch: (branch: string | null) => void
  setError: (error: string | null) => void
}

type GitStore = GitState & GitActions

export const useGitStore = create<GitStore>((set) => ({
  // State
  currentBranch: null,
  isLoading: false,
  error: null,

  // Actions
  loadBranch: async () => {
    set({ isLoading: true, error: null })
    try {
      // Check if git is initialized
      const isInitialized = await window.electronAPI.git.isInitialized()
      if (!isInitialized) {
        set({ currentBranch: null, isLoading: false, error: 'Git not initialized' })
        return
      }

      const branch = await window.electronAPI.git.getCurrentBranch()
      set({ currentBranch: branch, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get branch'
      set({ currentBranch: null, isLoading: false, error: message })
    }
  },

  setBranch: (branch) => set({ currentBranch: branch }),
  setError: (error) => set({ error })
}))
