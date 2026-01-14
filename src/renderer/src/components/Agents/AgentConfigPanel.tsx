import type { JSX } from 'react'
import { useState, useEffect } from 'react'
import { useAgentStore } from '../../stores'
import type { AgentConfig, AgentRole } from '@shared/types'

interface AgentConfigPanelProps {
  role: AgentRole
  onClose: () => void
}

export function AgentConfigPanel({ role, onClose }: AgentConfigPanelProps): JSX.Element {
  const { configs, updateConfig, runtimeStatus } = useAgentStore()
  const config = configs[role]
  const status = runtimeStatus[role]

  // Local state for editing
  const [name, setName] = useState(config.name)
  const [instructions, setInstructions] = useState(config.instructions)
  const [enabled, setEnabled] = useState(config.enabled)
  const [permissionMode, setPermissionMode] = useState(config.permissionMode)
  const [isSaving, setIsSaving] = useState(false)

  // Reset local state when role changes
  useEffect(() => {
    setName(config.name)
    setInstructions(config.instructions)
    setEnabled(config.enabled)
    setPermissionMode(config.permissionMode)
  }, [config])

  const hasChanges =
    name !== config.name ||
    instructions !== config.instructions ||
    enabled !== config.enabled ||
    permissionMode !== config.permissionMode

  const handleSave = async (): Promise<void> => {
    setIsSaving(true)
    try {
      await updateConfig(role, { name, instructions, enabled, permissionMode })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = (): void => {
    setName(config.name)
    setInstructions(config.instructions)
    setEnabled(config.enabled)
    setPermissionMode(config.permissionMode)
  }

  return (
    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium text-white">{config.name}</h3>
          <StatusBadge status={status.status} />
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Current activity */}
      {status.status === 'busy' && status.currentTaskTitle && (
        <div className="mb-4 p-2 bg-blue-900/20 border border-blue-800 rounded text-sm text-blue-300">
          Currently working on: {status.currentTaskTitle}
        </div>
      )}

      {/* Name field */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Display Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Instructions field */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Instructions (System Prompt)
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none resize-none"
        />
        <p className="text-xs text-gray-500 mt-1">
          These instructions are prepended to the agent&apos;s prompts
        </p>
      </div>

      {/* Permission mode */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Permission Mode
        </label>
        <select
          value={permissionMode}
          onChange={(e) => setPermissionMode(e.target.value as AgentConfig['permissionMode'])}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
        >
          <option value="default">Default (ask for permissions)</option>
          <option value="acceptEdits">Accept Edits (auto-approve file changes)</option>
          <option value="bypassPermissions">Bypass All (full autonomy)</option>
        </select>
      </div>

      {/* Enabled toggle */}
      <div className="mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-300">Agent enabled</span>
        </label>
        <p className="text-xs text-gray-500 mt-1 ml-6">
          Disabled agents won&apos;t be used for task execution
        </p>
      </div>

      {/* Tools display (read-only for now) */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Allowed Tools
        </label>
        <div className="flex flex-wrap gap-1">
          {config.allowedTools.map((tool) => (
            <span
              key={tool}
              className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300"
            >
              {tool}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-700">
        {hasChanges && (
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Reset
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={`
            px-4 py-1.5 text-sm font-medium rounded transition-colors
            ${hasChanges
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
          `}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: 'idle' | 'busy' | 'offline' }): JSX.Element {
  const styles = {
    idle: 'bg-green-900/50 text-green-400 border-green-800',
    busy: 'bg-yellow-900/50 text-yellow-400 border-yellow-800',
    offline: 'bg-gray-700 text-gray-400 border-gray-600'
  }

  return (
    <span className={`px-2 py-0.5 text-xs rounded border ${styles[status]}`}>
      {status}
    </span>
  )
}

function XIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
