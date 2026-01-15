import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { subscribeToFeatureStatusChanges } from './stores/feature-store'

// Subscribe to feature status changes for real-time Kanban updates
subscribeToFeatureStatusChanges()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
