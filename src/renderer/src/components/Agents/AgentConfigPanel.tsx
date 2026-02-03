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

export function AgentConfigPanel({ role, onClose }: AgentConfigPanelProps): JSX.Element {
  const { configs, updateConfig, runtimeStatus } = useAgentStore()
  const config = configs[role]
  const status = runtimeStatus[role]

  // Local state for editing
  const [instructions, setInstructions] = useState(config.instructions)
  const [permissionMode, setPermissionMode] = useState(config.permissionMode)
  const [isSaving, setIsSaving] = useState(false)

  // Reset local state when role changes
  useEffect(() => {
    setInstructions(config.instructions)
    setPermissionMode(config.permissionMode)
  }, [config])

  const hasChanges =
    instructions !== config.instructions ||
    permissionMode !== config.permissionMode

  const handleSave = async (): Promise<void> => {
    setIsSaving(true)
    try {
      await updateConfig(role, { instructions, permissionMode })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = (): void => {
    setInstructions(config.instructions)
    setPermissionMode(config.permissionMode)
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
        {hasChanges && (
          <Button variant="ghost" onClick={handleReset}>
            Reset
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
  )
}
