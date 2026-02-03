import './assets/main.css'

import { createRoot } from 'react-dom/client'
import App from './App'
import { subscribeToFeatureStatusChanges } from './stores/feature-store'

// Subscribe to feature status changes for real-time Kanban updates
subscribeToFeatureStatusChanges()

// Note: StrictMode removed for performance testing
// It causes double-rendering in development which can cause UI lag
createRoot(document.getElementById('root')!).render(<App />)
