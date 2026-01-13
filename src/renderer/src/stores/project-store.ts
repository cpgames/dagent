import { create } from 'zustand'
import { useFeatureStore } from './feature-store'

interface ProjectStoreState {
  projectPath: string | null
  isLoading: boolean
  error: string | null

  // Actions
  loadCurrentProject: () => Promise<void>
  openProject: (path: string) => Promise<boolean>
  openFolderDialog: () => Promise<boolean>
  createProject: (parentPath: string, projectName: string) => Promise<string | null>
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  projectPath: null,
  isLoading: false,
  error: null,

  loadCurrentProject: async () => {
    set({ isLoading: true, error: null })
    try {
      const path = await window.electronAPI.project.getCurrent()
      set({ projectPath: path, isLoading: false })
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
        set({ projectPath: path, isLoading: false, error: null })
        // Clear and reload features for the new project
        useFeatureStore.getState().setFeatures([])
        useFeatureStore.getState().setActiveFeature(null)
        await useFeatureStore.getState().loadFeatures()
        return true
      } else {
        set({ error: result.error || 'Failed to open project', isLoading: false })
        return false
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open project'
      set({ error: message, isLoading: false })
      return false
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
          set({ projectPath: selectedPath, isLoading: false, error: null })
          // Clear and reload features for the new project
          useFeatureStore.getState().setFeatures([])
          useFeatureStore.getState().setActiveFeature(null)
          await useFeatureStore.getState().loadFeatures()
          return true
        } else {
          set({ error: result.error || 'Failed to open project', isLoading: false })
          return false
        }
      } else {
        // User cancelled the dialog
        set({ isLoading: false })
        return false
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open folder dialog'
      set({ error: message, isLoading: false })
      return false
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
  }
}))
