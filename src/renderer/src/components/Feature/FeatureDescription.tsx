import { useState, useEffect, type JSX } from 'react'
import { useFeatureStore } from '../../stores'
import { Button } from '../UI'
import { ConfirmDialog } from '../DAG'
import { toast } from '../../stores/toast-store'
import './FeatureDescription.css'

export interface FeatureDescriptionProps {
  featureId: string
  className?: string
}

/**
 * Editable feature description panel.
 * Shows feature name and description with the ability to edit and save changes.
 */
export function FeatureDescription({
  featureId,
  className = ''
}: FeatureDescriptionProps): JSX.Element {
  const { features, saveFeature, updateFeature } = useFeatureStore()
  const feature = features.find((f) => f.id === featureId)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isReplanning, setIsReplanning] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showReplanConfirm, setShowReplanConfirm] = useState(false)

  // Sync local state with feature data
  useEffect(() => {
    if (feature) {
      setName(feature.name)
      setDescription(feature.description || '')
      setHasChanges(false)
    }
  }, [feature])

  // Track changes
  useEffect(() => {
    if (feature) {
      const nameChanged = name !== feature.name
      const descChanged = description !== (feature.description || '')
      setHasChanges(nameChanged || descChanged)
    }
  }, [name, description, feature])

  const handleSave = async (): Promise<void> => {
    if (!feature || !hasChanges) return

    setIsSaving(true)
    try {
      await saveFeature({
        ...feature,
        name: name.trim(),
        description: description.trim() || undefined
      })
      setHasChanges(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReplanClick = (): void => {
    setShowReplanConfirm(true)
  }

  const handleReplanConfirm = async (): Promise<void> => {
    if (!feature) return

    // Double-check status before proceeding
    const currentFeature = features.find((f) => f.id === featureId)
    if (!currentFeature || currentFeature.status !== 'backlog') {
      toast.error('Feature must be in backlog status to replan')
      return
    }

    setIsReplanning(true)
    try {
      // Save any pending changes first
      if (hasChanges) {
        await saveFeature({
          ...feature,
          name: name.trim(),
          description: description.trim() || undefined
        })
        setHasChanges(false)
      }

      // Call replan API
      const result = await window.electronAPI.feature.replan(featureId)
      if (result.success) {
        // Update local state to show planning status
        updateFeature(featureId, { status: 'planning' })
        toast.success('Replanning started')
      } else {
        toast.error(result.error || 'Failed to start replanning')
      }
    } catch (error) {
      toast.error(`Replan failed: ${(error as Error).message}`)
    } finally {
      setIsReplanning(false)
    }
  }

  // Check if replan is allowed (only in backlog status)
  const canReplan = feature?.status === 'backlog'

  if (!feature) {
    return (
      <div className={`feature-description ${className}`}>
        <div className="feature-description__empty">Feature not found</div>
      </div>
    )
  }

  return (
    <div className={`feature-description ${className}`}>
      <div className="feature-description__content">
        {/* Feature Name */}
        <div className="feature-description__field">
          <label className="feature-description__label" htmlFor="feature-name">
            Name
          </label>
          <input
            id="feature-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="feature-description__input"
            placeholder="Feature name"
          />
        </div>

        {/* Feature Description */}
        <div className="feature-description__field feature-description__field--grow">
          <label className="feature-description__label" htmlFor="feature-desc">
            Description
          </label>
          <textarea
            id="feature-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="feature-description__textarea"
            placeholder="Describe what this feature does..."
            rows={6}
          />
        </div>

        {/* Metadata (read-only) */}
        <div className="feature-description__meta">
          <div className="feature-description__meta-item">
            <span className="feature-description__meta-label">Branch:</span>
            <span className="feature-description__meta-value">{feature.branchName}</span>
          </div>
          <div className="feature-description__meta-item">
            <span className="feature-description__meta-label">Created:</span>
            <span className="feature-description__meta-value">
              {new Date(feature.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Footer with Save and Plan buttons */}
      <div className="feature-description__footer">
        <Button
          variant="primary"
          onClick={handleReplanClick}
          disabled={!canReplan || isReplanning}
          title={canReplan ? 'Replan this feature from scratch' : 'Feature must be in backlog status to replan'}
        >
          {isReplanning ? 'Planning...' : 'Plan'}
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Replan Confirmation Dialog */}
      <ConfirmDialog
        open={showReplanConfirm}
        title="Replan Feature"
        message="Do you want to redo the planning phase? Warning: all current tasks and spec will be deleted."
        confirmLabel="Yes, Replan"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleReplanConfirm}
        onCancel={() => setShowReplanConfirm(false)}
      />
    </div>
  )
}

export default FeatureDescription
