import type { JSX } from 'react'
import { useState, useEffect } from 'react'
import { useAgentStore } from '../../stores'
import { Textarea, Select, Button } from '../UI'
import type { AgentConfig, AgentRole } from '@shared/types'
import './AgentConfigPanel.css'

interface AgentConfigPanelProps {
  role: AgentRole
  onClose: () => void
}

const PERMISSION_OPTIONS = [
  { value: 'default', label: 'Default (ask for permissions)' },
  { value: 'acceptEdits', label: 'Accept Edits (auto-approve file changes)' },
  { value: 'bypassPermissions', label: 'Bypass All (full autonomy)' },
]

const MODEL_OPTIONS = [
  { value: '', label: 'Sonnet 4.5 (Default)' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6 (Latest)' },
  { value: 'claude-opus-4-5', label: 'Opus 4.5' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5 (Fast)' },
]

export function AgentConfigPanel({ role, onClose }: AgentConfigPanelProps): JSX.Element {
  const { configs, updateConfig, resetConfig, runtimeStatus } = useAgentStore()
  const config = configs[role]
  const status = runtimeStatus[role]

  // Local state for editing
  const [instructions, setInstructions] = useState(config.instructions)
  const [permissionMode, setPermissionMode] = useState(config.permissionMode)
  const [model, setModel] = useState(config.model || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  // Reset local state when role changes
  useEffect(() => {
    setInstructions(config.instructions)
    setPermissionMode(config.permissionMode)
    setModel(config.model || '')
  }, [config])

  const hasChanges =
    instructions !== config.instructions ||
    permissionMode !== config.permissionMode ||
    model !== (config.model || '')

  const handleSave = async (): Promise<void> => {
    setIsSaving(true)
    try {
      await updateConfig(role, {
        instructions,
        permissionMode,
        model: model || undefined // Convert empty string to undefined
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = (): void => {
    setInstructions(config.instructions)
    setPermissionMode(config.permissionMode)
    setModel(config.model || '')
  }

  const handleResetToDefault = async (): Promise<void> => {
    setIsResetting(true)
    try {
      const freshConfig = await resetConfig(role)
      if (freshConfig) {
        setInstructions(freshConfig.instructions)
        setPermissionMode(freshConfig.permissionMode)
        setModel(freshConfig.model || '')
      }
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="agent-config">
      {/* Header */}
      <div className="agent-config__header">
        <h3 className="agent-config__title">{config.name}</h3>
        <button onClick={onClose} className="agent-config__close-btn">
          <svg className="agent-config__close-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Current activity */}
      {status.status === 'busy' && status.currentTaskTitle && (
        <div className="agent-config__activity">
          Currently working on: {status.currentTaskTitle}
        </div>
      )}

      {/* Instructions field */}
      <div className="agent-config__field">
        <label className="agent-config__label">Instructions (System Prompt)</label>
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          minRows={5}
        />
        <p className="agent-config__hint">
          These instructions are prepended to the agent&apos;s prompts
        </p>
      </div>

      {/* Permission mode */}
      <div className="agent-config__field">
        <label className="agent-config__label">Permission Mode</label>
        <Select
          value={permissionMode}
          onChange={(e) => setPermissionMode(e.target.value as AgentConfig['permissionMode'])}
          options={PERMISSION_OPTIONS}
        />
      </div>

      {/* Model selection */}
      <div className="agent-config__field">
        <label className="agent-config__label">Model</label>
        <Select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          options={MODEL_OPTIONS}
        />
        <p className="agent-config__hint">
          Override the default Claude model for this agent
        </p>
      </div>

      {/* Tools display (read-only for now) */}
      <div className="agent-config__field">
        <label className="agent-config__label">Allowed Tools</label>
        <div className="agent-config__tools">
          {config.allowedTools.map((tool) => (
            <span key={tool} className="agent-config__tool-badge">
              {tool}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="agent-config__actions">
        <Button
          variant="ghost"
          onClick={handleResetToDefault}
          disabled={isResetting}
        >
          {isResetting ? 'Resetting...' : 'Reset to Default'}
        </Button>
        <div className="agent-config__actions-right">
          {hasChanges && (
            <Button variant="ghost" onClick={handleReset}>
              Discard
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!hasChanges}
            loading={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
