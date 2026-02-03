import { useState, useEffect, useRef, type JSX } from 'react'
import { useFeatureStore } from '../../stores'
import { Button } from '../UI'
import { toast } from '../../stores/toast-store'
import type { CompletionAction } from '@shared/types'
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
  const [completionAction, setCompletionAction] = useState<CompletionAction>('manual')
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uncertainties, setUncertainties] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync local state with feature data
  useEffect(() => {
    if (feature) {
      setName(feature.name)
      setDescription(feature.description || '')
      setCompletionAction(feature.completionAction || 'manual')
      setHasChanges(false)
    }
  }, [feature])

  // Listen for analysis result events
  useEffect(() => {
    const unsubscribe = window.electronAPI.feature.onAnalysisResult((data) => {
      if (data.featureId === featureId && data.uncertainties) {
        setUncertainties(data.uncertainties)
      }
    })
    return unsubscribe
  }, [featureId])

  // Track changes
  useEffect(() => {
    if (feature) {
      const nameChanged = name !== feature.name
      const descChanged = description !== (feature.description || '')
      const actionChanged = completionAction !== (feature.completionAction || 'manual')
      setHasChanges(nameChanged || descChanged || actionChanged)
    }
  }, [name, description, completionAction, feature])

  const handleSave = async (): Promise<void> => {
    if (!feature || !hasChanges) return

    setIsSaving(true)
    try {
      await saveFeature({
        ...feature,
        name: name.trim(),
        description: description.trim() || undefined,
        completionAction
      })
      setHasChanges(false)
    } finally {
      setIsSaving(false)
    }
  }

  // File attachment handlers - upload immediately on selection
  const uploadFiles = async (files: File[]): Promise<void> => {
    if (!feature || files.length === 0) return

    setIsUploading(true)
    try {
      const newPaths = await window.electronAPI.feature.uploadAttachments(featureId, files)
      // Merge new paths with existing attachments
      const existingAttachments = feature.attachments || []
      updateFeature(featureId, { attachments: [...existingAttachments, ...newPaths] })
      toast.success(`${files.length} file(s) uploaded`)
    } catch (error) {
      toast.error(`Failed to upload files: ${(error as Error).message}`)
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length > 0) {
      uploadFiles(selectedFiles)
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length > 0) {
      uploadFiles(droppedFiles)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
  }

  const handleAttachmentRemove = async (attachmentPath: string): Promise<void> => {
    if (!feature) return

    try {
      // Delete file and update feature.json on backend
      await window.electronAPI.feature.deleteAttachment(featureId, attachmentPath)
      // Update local store
      const updatedAttachments = (feature.attachments || []).filter((a) => a !== attachmentPath)
      updateFeature(featureId, {
        attachments: updatedAttachments.length > 0 ? updatedAttachments : undefined
      })
      toast.success('Attachment removed')
    } catch (error) {
      toast.error(`Failed to remove attachment: ${(error as Error).message}`)
    }
  }

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

        {/* Uncertainties - shown when feature is active and has questions */}
        {feature.status === 'active' && uncertainties.length > 0 && (
          <div className="feature-description__field">
            <label className="feature-description__label">PM Agent Question</label>
            <div className="feature-description__uncertainties">
              <p className="feature-description__uncertainties-intro">
                {uncertainties[0]}
              </p>
              <p className="feature-description__uncertainties-note">
                Please update the description above to answer this question, then click "Plan" to continue the conversation.
              </p>
            </div>
          </div>
        )}

        {/* Attached Files */}
        <div className="feature-description__field">
          <label className="feature-description__label">Attached Files</label>

          {/* Existing attachments */}
          {feature.attachments && feature.attachments.length > 0 && (
            <div className="feature-description__attachments">
              {feature.attachments.map((attachment, index) => {
                const fileName = attachment.split('/').pop() || attachment
                return (
                  <div key={index} className="feature-description__attachment-item">
                    <svg
                      className="feature-description__attachment-icon"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                      />
                    </svg>
                    <span className="feature-description__attachment-name">{fileName}</span>
                    <button
                      type="button"
                      className="feature-description__attachment-remove"
                      onClick={() => handleAttachmentRemove(attachment)}
                      title="Remove attachment"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Dropzone for adding files */}
          <div
            className={`feature-description__dropzone ${isUploading ? 'feature-description__dropzone--uploading' : ''}`}
            onDrop={isUploading ? undefined : handleFileDrop}
            onDragOver={isUploading ? undefined : handleDragOver}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="feature-description__file-input"
              disabled={isUploading}
            />
            <div className="feature-description__dropzone-content">
              <svg
                className="feature-description__dropzone-icon"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="feature-description__dropzone-text">
                {isUploading ? (
                  'Uploading...'
                ) : (
                  <>
                    Drop files here or{' '}
                    <button
                      type="button"
                      className="feature-description__dropzone-button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      browse
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Metadata (read-only) */}
        <div className="feature-description__meta">
          <div className="feature-description__meta-item">
            <span className="feature-description__meta-label">Branch:</span>
            <span className="feature-description__meta-value">{feature.branch || 'Not assigned'}</span>
          </div>
          <div className="feature-description__meta-item">
            <span className="feature-description__meta-label">Created:</span>
            <span className="feature-description__meta-value">
              {new Date(feature.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Footer with Save button */}
      <div className="feature-description__footer">
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

export default FeatureDescription
