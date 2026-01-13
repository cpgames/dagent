import { useEffect, useState } from 'react'
import { useFeatureStore, useViewStore, useAuthStore } from './stores'
import { KanbanView, DAGView, ContextView } from './views'
import { ToastContainer } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthStatusIndicator, AuthDialog } from './components/Auth'
import { NewFeatureDialog } from './components/Feature'
import { ViewSidebar } from './components/Layout'

/**
 * Main App component for DAGent.
 * Provides the application shell with vertical sidebar navigation and view switching.
 */
function App(): React.JSX.Element {
  const { loadFeatures, createFeature } = useFeatureStore()
  const { activeView } = useViewStore()
  const { initialize: initAuth, state: authState, isLoading: authLoading } = useAuthStore()
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [newFeatureDialogOpen, setNewFeatureDialogOpen] = useState(false)

  useEffect(() => {
    // Load features from storage on mount
    loadFeatures()
    // Initialize auth state from main process
    initAuth()
  }, [loadFeatures, initAuth])

  // Auto-open auth dialog when auth fails and loading completes
  useEffect(() => {
    if (!authLoading && !authState.authenticated && authState.error) {
      setAuthDialogOpen(true)
    }
  }, [authLoading, authState.authenticated, authState.error])

  const handleCreateFeature = async (name: string): Promise<void> => {
    const feature = await createFeature(name)
    if (feature) {
      setNewFeatureDialogOpen(false)
    }
    // Error case is handled in store (toast displayed)
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        {/* Header - simplified without tabs */}
        <header className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">DAGent</span>
          </div>
          <div className="flex items-center gap-2">
            <AuthStatusIndicator onConfigureClick={() => setAuthDialogOpen(true)} />
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
          <main className="flex-1 overflow-auto">
            {activeView === 'kanban' && <KanbanView />}
            {activeView === 'dag' && <DAGView />}
            {activeView === 'context' && <ContextView />}
          </main>
          <ViewSidebar />
        </div>
      </div>
      <ToastContainer />
      <AuthDialog isOpen={authDialogOpen} onClose={() => setAuthDialogOpen(false)} />
      <NewFeatureDialog
        isOpen={newFeatureDialogOpen}
        onClose={() => setNewFeatureDialogOpen(false)}
        onSubmit={handleCreateFeature}
      />
    </ErrorBoundary>
  )
}

export default App
