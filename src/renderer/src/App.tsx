import { useEffect, useState, useMemo } from 'react'
import { useFeatureStore, useViewStore, useAuthStore, useProjectStore, setupGlobalDAGEventSubscription } from './stores'
import { KanbanView, DAGView, ContextView, AgentsView, WorktreesView } from './views'
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
import { SplashScreen } from './components/Loading'
import { ThemeProvider } from './contexts/ThemeContext'
import { FEATURE_MANAGER_NAMES } from '@shared/types/pool'
import './App.css'

// Set up global DAG event subscription immediately when module loads
// This ensures we receive events even before any component mounts
setupGlobalDAGEventSubscription()

/**
 * Main App component for DAGent.
 * Provides the application shell with vertical sidebar navigation and view switching.
 */
function App(): React.JSX.Element {
  const { loadFeatures, createFeature, features, activeFeatureId } = useFeatureStore()
  const { activeView, setView } = useViewStore()
  const { initialize: initAuth, state: authState, isLoading: authLoading } = useAuthStore()
  const { loadCurrentProject, projectPath, initGitRepo, checkGitStatus } = useProjectStore()

  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [newFeatureDialogOpen, setNewFeatureDialogOpen] = useState(false)
  const [projectSelectionDialogOpen, setProjectSelectionDialogOpen] = useState(false)
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false)
  const [gitInitDialogOpen, setGitInitDialogOpen] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Feature manager filter for Kanban view - Set of selected manager IDs (all selected by default)
  const [selectedManagerFilters, setSelectedManagerFilters] = useState<Set<number>>(() =>
    new Set(Object.keys(FEATURE_MANAGER_NAMES).map(Number))
  )

  // Toggle manager filter - add/remove from set
  const handleManagerFilterToggle = (managerId: number) => {
    setSelectedManagerFilters(prev => {
      const next = new Set(prev)
      if (next.has(managerId)) {
        next.delete(managerId)
      } else {
        next.add(managerId)
      }
      return next
    })
  }

  // Count features per manager (active + merging, excludes archived)
  const featureCountsByManager = useMemo(() => {
    const managerIdToWorktreeId: Record<number, string> = { 1: 'neon', 2: 'cyber', 3: 'pulse' }
    const counts: Record<number, number> = {}
    for (const managerId of Object.keys(FEATURE_MANAGER_NAMES).map(Number)) {
      const worktreeId = managerIdToWorktreeId[managerId]
      counts[managerId] = features.filter(
        f => f.worktreeId === worktreeId && (f.status === 'active' || f.status === 'merging' || f.status === 'creating_worktree')
      ).length
    }
    return counts
  }, [features])

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

  /**
   * Handle feature creation - simplified non-blocking flow.
   * Creates feature instantly (no worktree), closes dialog, and switches to Kanban view.
   * PM planning is NOT triggered here - it will be triggered when user clicks Start (Phase v3.2-03).
   */
  const handleCreateFeature = async (data: FeatureCreateData): Promise<void> => {
    // Create feature (now instant - no worktree)
    const feature = await createFeature(data.name, {
      description: data.description,
      completionAction: data.completionAction,
      autoStart: data.autoStart
    })

    if (feature) {
      // Close dialog immediately
      setNewFeatureDialogOpen(false)

      // Upload attachments if provided (background - don't await)
      if (data.attachments && data.attachments.length > 0) {
        window.electronAPI.feature.uploadAttachments(feature.id, data.attachments)
          .catch(err => console.error('Failed to upload attachments:', err))
      }

      // Switch to Kanban view to see the new feature in Backlog (not_started column)
      setView('kanban')
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

  // Status color mapping for new feature statuses
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'var(--accent-primary)'
      case 'merging':
        return '#a855f7'
      case 'archived':
        return 'var(--color-success)'
      case 'backlog':
      default:
        return 'var(--text-muted)'
    }
  }

  // Status labels
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'backlog': return 'BACKLOG'
      case 'active': return 'ACTIVE'
      case 'merging': return 'MERGING'
      case 'archived': return 'ARCHIVED'
      default: return status.toUpperCase()
    }
  }

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <SplashScreen isReady={initialized} />
        <UnifiedCanvas layers={backgroundLayers} backgroundImage="/synthwave.png" />
        <div className="h-screen text-white flex flex-col overflow-hidden relative z-0">
          {/* Header */}
          <header className="flex items-center justify-between gap-4 px-4 py-2 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
            <div className="flex items-center gap-4">
              <ProjectSelector onOpenFullDialog={() => setProjectSelectionDialogOpen(true)} />
              {/* Feature badge - only show in DAG view with active feature */}
              {activeView === 'dag' && activeFeature && (
                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderLeft: `4px solid ${getStatusColor(activeFeature.status)}`
                  }}
                >
                  <span>{activeFeature.name}</span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[0.625rem] font-semibold tracking-wide"
                    style={{
                      backgroundColor: `${getStatusColor(activeFeature.status)}22`,
                      color: getStatusColor(activeFeature.status)
                    }}
                  >
                    {getStatusLabel(activeFeature.status)}
                  </span>
                </div>
              )}
            </div>

            {/* Feature Manager Filter - only show in Kanban view */}
            {activeView === 'kanban' && (
              <div className="header-filters flex gap-3">
                {Object.entries(FEATURE_MANAGER_NAMES).map(([id, name]) => {
                  const managerId = Number(id)
                  const isActive = selectedManagerFilters.has(managerId)
                  const count = featureCountsByManager[managerId] || 0
                  return (
                    <button
                      key={managerId}
                      onClick={() => handleManagerFilterToggle(managerId)}
                      className={`header-filter-btn header-filter-btn--${name.toLowerCase()} ${isActive ? 'header-filter-btn--active' : ''}`}
                    >
                      <span className="header-filter-text">{name}</span>
                      {count > 0 && <span className="header-filter-count">{count}</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Spacer to balance the header when in Kanban view (button moved to Backlog column) */}
            {activeView === 'kanban' && <div className="w-[120px]" />}
          </header>

          {/* Main content area with sidebar */}
          <div className="flex-1 flex overflow-hidden">
            <ViewSidebar />
            <main className="flex-1 overflow-auto">
              {activeView === 'kanban' && (
                <KanbanView
                  selectedManagerFilters={selectedManagerFilters}
                  onNewFeature={() => setNewFeatureDialogOpen(true)}
                />
              )}
              {activeView === 'dag' && <DAGView />}
              {activeView === 'context' && <ContextView />}
              {activeView === 'agents' && <AgentsView />}
              {activeView === 'worktrees' && <WorktreesView />}
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
