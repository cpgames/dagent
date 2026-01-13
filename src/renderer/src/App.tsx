import { useEffect, useState } from 'react'
import { useFeatureStore, useViewStore, useAuthStore, type ViewType } from './stores'
import { KanbanView, DAGView, ContextView } from './views'
import { ToastContainer } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthStatusIndicator, AuthDialog } from './components/Auth'
import { NewFeatureDialog } from './components/Feature'

/**
 * Tab configuration for main navigation.
 */
const tabs: { id: ViewType; label: string }[] = [
  { id: 'kanban', label: 'Kanban' },
  { id: 'dag', label: 'DAG' },
  { id: 'context', label: 'Context' },
]

/**
 * Main App component for DAGent.
 * Provides the application shell with tab navigation and view switching.
 */
function App(): React.JSX.Element {
  const { loadFeatures, createFeature } = useFeatureStore()
  const { activeView, setView } = useViewStore()
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
        <header className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeView === tab.id
                    ? 'bg-gray-700 border-b-2 border-blue-500 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
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
        <main className="flex-1 overflow-auto">
          {activeView === 'kanban' && <KanbanView />}
          {activeView === 'dag' && <DAGView />}
          {activeView === 'context' && <ContextView />}
        </main>
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
