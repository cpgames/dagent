import type { JSX } from 'react'
import { useEffect } from 'react'
import { useAgentStore } from '../stores'
import { AgentConfigPanel } from '../components/Agents'
import type { AgentRole } from '@shared/types'
import './AgentsView.css'

const ROLE_ORDER: AgentRole[] = ['pm', 'developer', 'qa', 'merge']

/**
 * Agents View - Configure AI agents
 */
export function AgentsView(): JSX.Element {
  const { configs, runtimeStatus, selectedRole, selectRole, loadConfigs, loadRuntimeStatus, isLoading } =
    useAgentStore()

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  // Poll runtime status every 2 seconds
  useEffect(() => {
    loadRuntimeStatus()
    const interval = setInterval(loadRuntimeStatus, 2000)
    return () => clearInterval(interval)
  }, [loadRuntimeStatus])

  if (isLoading) {
    return (
      <div className="agents-view__loading">
        <div>Loading agents...</div>
      </div>
    )
  }

  return (
    <div className="agents-view">
      <div className="agents-view__header">
        <h1 className="agents-view__title">Agents</h1>
        <p className="agents-view__description">Configure AI agent roles</p>
      </div>

      <div className="agents-view__grid">
        {ROLE_ORDER.map((role) => {
          const config = configs[role]
          const status = runtimeStatus[role]
          const isSelected = selectedRole === role

          return (
            <div
              key={role}
              onClick={() => selectRole(isSelected ? null : role)}
              className={`agents-view__card ${isSelected ? 'agents-view__card--selected' : ''} ${!config.enabled ? 'agents-view__card--disabled' : ''}`}
            >
              {/* Header */}
              <div className="agents-view__card-header">
                <h3 className="agents-view__card-name">{config.name}</h3>
              </div>

              {/* Description */}
              <p className="agents-view__card-description">
                {config.instructions.slice(0, 100)}...
              </p>

              {/* Current task if busy */}
              {status.status === 'busy' && status.currentTaskTitle && (
                <div className="agents-view__card-task">
                  Working on: {status.currentTaskTitle}
                </div>
              )}

              {/* Enabled/disabled badge */}
              {!config.enabled && <div className="agents-view__card-badge">Disabled</div>}
            </div>
          )
        })}
      </div>

      {/* Selected agent configuration panel */}
      {selectedRole && (
        <div style={{ marginTop: 'var(--space-lg)' }}>
          <AgentConfigPanel
            role={selectedRole}
            onClose={() => selectRole(null)}
          />
        </div>
      )}
    </div>
  )
}
