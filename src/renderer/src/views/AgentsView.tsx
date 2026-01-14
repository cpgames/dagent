import type { JSX } from 'react'
import { useEffect } from 'react'
import { useAgentStore } from '../stores'
import type { AgentRole } from '@shared/types'

const ROLE_ORDER: AgentRole[] = ['pm', 'harness', 'developer', 'qa', 'merge']

/**
 * Agents View - Configure and monitor AI agents
 */
export function AgentsView(): JSX.Element {
  const { configs, runtimeStatus, selectedRole, selectRole, loadConfigs, isLoading } =
    useAgentStore()

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading agents...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white">Agents</h1>
        <p className="text-sm text-gray-400">Configure AI agent roles and monitor activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ROLE_ORDER.map((role) => {
          const config = configs[role]
          const status = runtimeStatus[role]
          const isSelected = selectedRole === role

          return (
            <div
              key={role}
              onClick={() => selectRole(isSelected ? null : role)}
              className={`
                p-4 rounded-lg border cursor-pointer transition-colors
                ${
                  isSelected
                    ? 'bg-blue-900/30 border-blue-500'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }
                ${!config.enabled ? 'opacity-50' : ''}
              `}
            >
              {/* Header with name and status */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-white">{config.name}</h3>
                <StatusIndicator status={status.status} />
              </div>

              {/* Description */}
              <p className="text-sm text-gray-400 line-clamp-2 mb-2">
                {config.instructions.slice(0, 100)}...
              </p>

              {/* Current task if busy */}
              {status.status === 'busy' && status.currentTaskTitle && (
                <div className="text-xs text-blue-400 truncate">
                  Working on: {status.currentTaskTitle}
                </div>
              )}

              {/* Enabled/disabled badge */}
              {!config.enabled && <div className="text-xs text-gray-500 mt-1">Disabled</div>}
            </div>
          )
        })}
      </div>

      {/* Selected agent details panel */}
      {selectedRole && (
        <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h3 className="font-medium text-white mb-2">
            {configs[selectedRole].name} Configuration
          </h3>
          <p className="text-sm text-gray-400">
            Configuration editing will be added in Plan 20-02
          </p>
        </div>
      )}
    </div>
  )
}

function StatusIndicator({ status }: { status: 'idle' | 'busy' | 'offline' }): JSX.Element {
  const colors = {
    idle: 'bg-green-500',
    busy: 'bg-yellow-500 animate-pulse',
    offline: 'bg-gray-500'
  }

  const labels = {
    idle: 'Idle',
    busy: 'Working',
    offline: 'Offline'
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span className="text-xs text-gray-400">{labels[status]}</span>
    </div>
  )
}
