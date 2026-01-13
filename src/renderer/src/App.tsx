import { useEffect, useState } from 'react'
import { useFeatureStore, useViewStore, useAuthStore, useProjectStore } from './stores'
import { KanbanView, DAGView, ContextView } from './views'
import { ToastContainer } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthStatusIndicator, AuthDialog } from './components/Auth'
import { NewFeatureDialog } from './components/Feature'
import { ProjectSelectionDialog, NewProjectDialog } from './components/Project'
import { ViewSidebar, StatusBar } from './components/Layout'

/**
 * Main App component for DAGent.
 * Provides the application shell with vertical sidebar navigation and view switching.
 */
function App(): React.JSX.Element {
  const { loadFeatures, createFeature } = useFeatureStore()
  const { activeView } = useViewStore()
  const { initialize: initAuth, state: authState, isLoading: authLoading } = useAuthStore()
  const { loadCurrentProject, projectPath } = useProjectStore()

  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [newFeatureDialogOpen, setNewFeatureDialogOpen] = useState(false)
  const [projectSelectionDialogOpen, setProjectSelectionDialogOpen] = useState(false)
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false)

  useEffect(() => {
    // Load current project and features on mount
    const initialize = async (): Promise<void> => {
      await loadCurrentProject()
      await loadFeatures()
    }
    initialize()
    // Initialize auth state from main process
    initAuth()
  }, [loadFeatures, initAuth, loadCurrentProject])

  // Auto-open auth dialog when auth fails and loading completes
  useEffect(() => {
    if (!authLoading && !authState.authenticated && authState.error) {
      setAuthDialogOpen(true)
    }
  }, [authLoading, authState.authenticated, authState.error])

  // Update window title when project changes
  useEffect(() => {
    if (projectPath) {
      const projectName = projectPath.split(/[/\\]/).pop() || 'Project'
      document.title = `DAGent - ${projectName}`
    } else {
      document.title = 'DAGent'
    }
  }, [projectPath])

  const handleCreateFeature = async (name: string): Promise<void> => {
    const feature = await createFeature(name)
    if (feature) {
      setNewFeatureDialogOpen(false)
    }
    // Error case is handled in store (toast displayed)
  }

  const handleCreateNewProject = (): void => {
    // Close project selection dialog, open new project dialog
    setProjectSelectionDialogOpen(false)
    setNewProjectDialogOpen(true)
  }

  const handleNewProjectSuccess = (_projectPath: string): void => {
    setNewProjectDialogOpen(false)
  }

  const handleNewProjectClose = (): void => {
    setNewProjectDialogOpen(false)
    // Reopen project selection dialog if no project is loaded
    if (!projectPath) {
      setProjectSelectionDialogOpen(true)
    }
  }

  return (
    <ErrorBoundary>
      <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
        {/* Header - simplified without tabs */}
        <header className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">DAGent</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setProjectSelectionDialogOpen(true)}
              className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
              title="Open or switch project"
            >
              Open Project...
            </button>
            <button
              onClick={() => setNewFeatureDialogOpen(true)}
              className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 rounded transition-colors"
            >
              + New Feature
            </button>
          </div>
        </header>

        {/* Main content area with sidebar */}
        <div className="flex-1 flex overflow-hidden">
          <ViewSidebar />
          <main className="flex-1 overflow-auto">
            {activeView === 'kanban' && <KanbanView />}
            {activeView === 'dag' && <DAGView />}
            {activeView === 'context' && <ContextView />}
          </main>
        </div>

        {/* Status bar at bottom */}
        <StatusBar>
          <AuthStatusIndicator onConfigureClick={() => setAuthDialogOpen(true)} />
        </StatusBar>
      </div>
      <ToastContainer />
      <AuthDialog isOpen={authDialogOpen} onClose={() => setAuthDialogOpen(false)} />
      <NewFeatureDialog
        isOpen={newFeatureDialogOpen}
        onClose={() => setNewFeatureDialogOpen(false)}
        onSubmit={handleCreateFeature}
      />
      <ProjectSelectionDialog
        isOpen={projectSelectionDialogOpen}
        onClose={() => setProjectSelectionDialogOpen(false)}
        onCreateNew={handleCreateNewProject}
      />
      <NewProjectDialog
        isOpen={newProjectDialogOpen}
        onClose={handleNewProjectClose}
        onSuccess={handleNewProjectSuccess}
      />
    </ErrorBoundary>
  )
}

export default App
