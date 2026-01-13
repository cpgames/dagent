import { useEffect, useState } from 'react'
import { useFeatureStore, useDAGStore } from './stores'

/**
 * Main App component for DAGent.
 * Provides the application shell with header and main content area.
 */
function App(): React.JSX.Element {
  const [appInfo, setAppInfo] = useState<{ version: string; platform: string } | null>(null)
  const [pingResult, setPingResult] = useState<string>('')

  // Zustand stores
  const { features, isLoading, error, loadFeatures } = useFeatureStore()
  const { dag } = useDAGStore()

  useEffect(() => {
    // Test IPC on mount
    window.electronAPI.ping().then(setPingResult)
    window.electronAPI.getAppInfo().then(setAppInfo)

    // Load features from storage
    loadFeatures()
  }, [loadFeatures])

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="flex items-center justify-between p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold text-blue-400">DAGent</h1>
        <div className="flex gap-2">
          <button
            onClick={() => window.electronAPI.minimizeWindow()}
            className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600"
          >
            -
          </button>
          <button
            onClick={() => window.electronAPI.maximizeWindow()}
            className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600"
          >
            []
          </button>
          <button
            onClick={() => window.electronAPI.closeWindow()}
            className="px-3 py-1 rounded bg-red-700 hover:bg-red-600"
          >
            x
          </button>
        </div>
      </header>
      <main className="p-4">
        <p className="text-gray-400 mb-4">Dependency-aware AI agent orchestration</p>
        <div className="text-sm text-gray-500 mb-4">
          <p>IPC ping: {pingResult}</p>
          {appInfo && (
            <p>App: v{appInfo.version} on {appInfo.platform}</p>
          )}
        </div>

        {/* Store state display */}
        <section className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Features ({features.length})</h2>
          {isLoading && <p className="text-gray-400">Loading...</p>}
          {error && <p className="text-red-400">{error}</p>}
          {features.length === 0 && !isLoading && (
            <p className="text-gray-500">No features yet</p>
          )}
          <ul className="space-y-1">
            {features.map((f) => (
              <li key={f.id} className="text-gray-300">
                {f.name} - {f.status}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">
            DAG Nodes: {dag?.nodes.length ?? 0}
          </h2>
          <p className="text-gray-500">
            Connections: {dag?.connections.length ?? 0}
          </p>
        </section>

        {/* TODO: Add tab navigation for views (Kanban, DAG, Context) */}
        {/* TODO: Add main view container */}
      </main>
    </div>
  )
}

export default App
