import { create } from 'zustand'
import { useFeatureStore } from './feature-store'

export interface RecentProject {
  path: string
  name: string
  lastOpened: string
}

interface OpenProjectResult {
  success: boolean
  hasGit?: boolean
}

interface ProjectStoreState {
  projectPath: string | null
  hasGit: boolean
  recentProjects: RecentProject[]
  isLoading: boolean
  error: string | null

  // Actions
  loadCurrentProject: () => Promise<void>
  openProject: (path: string) => Promise<OpenProjectResult>
  openFolderDialog: () => Promise<OpenProjectResult>
  createProject: (parentPath: string, projectName: string) => Promise<string | null>
  loadRecentProjects: () => Promise<void>
  removeFromRecent: (path: string) => Promise<void>
  initGitRepo: () => Promise<boolean>
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projectPath: null,
  hasGit: false,
  recentProjects: [],
  isLoading: false,
  error: null,

  loadCurrentProject: async () => {
    set({ isLoading: true, error: null })
    try {
      const path = await window.electronAPI.project.getCurrent()
      // Convert empty string to null (no project open)
      set({ projectPath: path || null, isLoading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load project'
      set({ error: message, isLoading: false })
    }
  },

  openProject: async (path: string) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.project.setProject(path)
      if (result.success) {
        set({ projectPath: path, hasGit: result.hasGit ?? false, isLoading: false, error: null })
        // Clear and reload features for the new project
        useFeatureStore.getState().setFeatures([])
        useFeatureStore.getState().setActiveFeature(null)
        await useFeatureStore.getState().loadFeatures()
        // Reload recent projects list (main process updated it)
        await get().loadRecentProjects()
        return { success: true, hasGit: result.hasGit }
      } else {
        set({ error: result.error || 'Failed to open project', isLoading: false })
        return { success: false }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open project'
      set({ error: message, isLoading: false })
      return { success: false }
    }
  },

  openFolderDialog: async () => {
    set({ isLoading: true, error: null })
    try {
      const selectedPath = await window.electronAPI.project.openDialog()
      if (selectedPath) {
        // User selected a folder, now open it as a project
        const result = await window.electronAPI.project.setProject(selectedPath)
        if (result.success) {
          set({ projectPath: selectedPath, hasGit: result.hasGit ?? false, isLoading: false, error: null })
          // Clear and reload features for the new project
          useFeatureStore.getState().setFeatures([])
          useFeatureStore.getState().setActiveFeature(null)
          await useFeatureStore.getState().loadFeatures()
          // Reload recent projects list (main process updated it)
          await get().loadRecentProjects()
          return { success: true, hasGit: result.hasGit }
        } else {
          set({ error: result.error || 'Failed to open project', isLoading: false })
          return { success: false }
        }
      } else {
        // User cancelled the dialog
        set({ isLoading: false })
        return { success: false }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open folder dialog'
      set({ error: message, isLoading: false })
      return { success: false }
    }
  },

  createProject: async (parentPath: string, projectName: string) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.project.create(parentPath, projectName)
      if (result.success && result.projectPath) {
        set({ projectPath: result.projectPath, isLoading: false, error: null })
        // Clear and reload features for the new project
        useFeatureStore.getState().setFeatures([])
        useFeatureStore.getState().setActiveFeature(null)
        await useFeatureStore.getState().loadFeatures()
        // Reload recent projects list (main process updated it)
        await get().loadRecentProjects()
        return result.projectPath
      } else {
        set({ error: result.error || 'Failed to create project', isLoading: false })
        return null
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create project'
      set({ error: message, isLoading: false })
      return null
    }
  },

  loadRecentProjects: async () => {
    try {
      const recent = await window.electronAPI.project.getRecent()
      set({ recentProjects: recent })
    } catch (error) {
      console.error('[DAGent] Failed to load recent projects:', error)
      // Don't set error state - this is a non-critical operation
    }
  },

  removeFromRecent: async (path: string) => {
    try {
      await window.electronAPI.project.removeRecent(path)
      // Update local state
      set((state) => ({
        recentProjects: state.recentProjects.filter(
          (p) => p.path.toLowerCase() !== path.toLowerCase()
        )
      }))
    } catch (error) {
      console.error('[DAGent] Failed to remove from recent:', error)
    }
  },

  initGitRepo: async () => {
    const { projectPath } = get()
    if (!projectPath) {
      return false
    }
    try {
      const result = await window.electronAPI.git.initRepo(projectPath)
      if (result.success) {
        set({ hasGit: true })
        return true
      }
      return false
    } catch (error) {
      console.error('[DAGent] Failed to initialize git repository:', error)
      return false
    }
  }
}))
