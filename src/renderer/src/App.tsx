import { useEffect, useState, useMemo } from 'react'
import { useFeatureStore, useViewStore, useAuthStore, useProjectStore } from './stores'
import { KanbanView, DAGView, ContextView, AgentsView } from './views'
import { ToastContainer } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthStatusIndicator, AuthDialog } from './components/Auth'
import { NewFeatureDialog, type FeatureCreateData } from './components/Feature'
import {
  ProjectSelectionDialog,
  NewProjectDialog,
  ProjectSelector,
  GitInitDialog
} from './components/Project'
import { ViewSidebar, StatusBar } from './components/Layout'
import {
  UnifiedCanvas,
  HorizonGlowLayer,
  StarsLayer,
  ShootingStarsLayer
} from './components/Background'
import { Button } from './components/UI'
import { ThemeProvider } from './contexts/ThemeContext'

/**
 * Main App component for DAGent.
 * Provides the application shell with vertical sidebar navigation and view switching.
 */
function App(): React.JSX.Element {
  const { loadFeatures, createFeature, features, activeFeatureId } = useFeatureStore()
  const { activeView } = useViewStore()
  const { initialize: initAuth, state: authState, isLoading: authLoading } = useAuthStore()
  const { loadCurrentProject, projectPath, initGitRepo, checkGitStatus } = useProjectStore()

  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [newFeatureDialogOpen, setNewFeatureDialogOpen] = useState(false)
  const [projectSelectionDialogOpen, setProjectSelectionDialogOpen] = useState(false)
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false)
  const [gitInitDialogOpen, setGitInitDialogOpen] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    // Load current project and features on mount
    const initialize = async (): Promise<void> => {
      await loadCurrentProject()
      await loadFeatures()
      setInitialized(true)
    }
    initialize()
    // Initialize auth state from main process
    initAuth()
  }, [loadFeatures, initAuth, loadCurrentProject])

  // Open project selection dialog on startup if no project is loaded
  useEffect(() => {
    if (initialized && !projectPath) {
      setProjectSelectionDialogOpen(true)
    }
  }, [initialized, projectPath])

  // Auto-open auth dialog when auth fails and loading completes
  useEffect(() => {
    if (!authLoading && !authState.authenticated && authState.error) {
      setAuthDialogOpen(true)
    }
  }, [authLoading, authState.authenticated, authState.error])

  // Update window title when project changes
  useEffect(() => {
    const title = projectPath
      ? `DAGent - ${projectPath.split(/[/\\]/).pop() || 'Project'}`
      : 'DAGent'
    window.electronAPI.setWindowTitle(title)
  }, [projectPath])

  const handleCreateFeature = async (data: FeatureCreateData): Promise<void> => {
    const feature = await createFeature(data.name)
    if (feature) {
      // TODO: Handle description, attachments, and autoMerge in Task 4
      // For now, we just create the feature with the name
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

  const handleProjectOpened = (projectHasGit: boolean): void => {
    if (!projectHasGit) {
      setGitInitDialogOpen(true)
    }
  }

  const handleInitGit = async (): Promise<void> => {
    const success = await initGitRepo()
    if (success) {
      setGitInitDialogOpen(false)
    }
  }

  const handleOpenAnotherProject = (): void => {
    setGitInitDialogOpen(false)
    setProjectSelectionDialogOpen(true)
  }

  const handleRefreshGitStatus = async (): Promise<void> => {
    const hasGit = await checkGitStatus()
    if (hasGit) {
      setGitInitDialogOpen(false)
    }
  }

  // Instantiate background layers (back to front)
  // Using hybrid approach: static image background + horizon glow + stars + shooting stars
  const backgroundLayers = useMemo(() => [
    new HorizonGlowLayer(),
    new StarsLayer(),
    new ShootingStarsLayer()
  ], []);

  // Get active feature for badge
  const activeFeature = features.find(f => f.id === activeFeatureId)

  // Status color mapping
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'var(--accent-primary)'
      case 'needs_attention':
        return 'var(--color-warning)'
      case 'completed':
        return 'var(--color-success)'
      default:
        return 'var(--text-muted)'
    }
  }

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <UnifiedCanvas layers={backgroundLayers} backgroundImage="/synthwave.png" />
        <div className="h-screen text-white flex flex-col overflow-hidden relative z-0">
          {/* Header */}
          <header className="flex items-center justify-between gap-4 px-4 py-2 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
            <div className="flex items-center gap-4">
              <ProjectSelector onOpenFullDialog={() => setProjectSelectionDialogOpen(true)} />
              {/* Feature badge - only show in DAG view with active feature */}
              {activeView === 'dag' && activeFeature && (
                <div
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderLeft: `4px solid ${getStatusColor(activeFeature.status)}`
                  }}
                >
                  {activeFeature.name}
                </div>
              )}
            </div>
            <Button
              variant="primary"
              onClick={() => setNewFeatureDialogOpen(true)}
            >
              + New Feature
            </Button>
          </header>

          {/* Main content area with sidebar */}
          <div className="flex-1 flex overflow-hidden">
            <ViewSidebar />
            <main className="flex-1 overflow-auto">
              {activeView === 'kanban' && <KanbanView />}
              {activeView === 'dag' && <DAGView />}
              {activeView === 'context' && <ContextView />}
              {activeView === 'agents' && <AgentsView />}
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
          onProjectOpened={handleProjectOpened}
        />
        <NewProjectDialog
          isOpen={newProjectDialogOpen}
          onClose={handleNewProjectClose}
          onSuccess={handleNewProjectSuccess}
        />
        <GitInitDialog
          isOpen={gitInitDialogOpen}
          projectPath={projectPath || ''}
          onInitGit={handleInitGit}
          onOpenAnother={handleOpenAnotherProject}
          onRefresh={handleRefreshGitStatus}
        />
      </ErrorBoundary>
    </ThemeProvider>
  )
}

export default App
