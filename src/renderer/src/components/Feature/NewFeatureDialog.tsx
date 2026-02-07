import type { JSX } from 'react';
import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogHeader, DialogBody, DialogFooter, Input, Button, Textarea } from '../UI';
import type { Feature, WorktreeId } from '@shared/types/feature';
import './NewFeatureDialog.css';

export interface FeatureCreateData {
  name: string;
  description?: string;
  attachments?: File[];
  autoStart?: boolean;
  worktreeId?: WorktreeId;
}

export interface FeatureEditData {
  name: string;
  description?: string;
  worktreeId?: WorktreeId;
}

type DialogMode = 'create' | 'edit';

interface FeatureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Mode determines title, button text, and behavior */
  mode: DialogMode;
  /** Feature to edit (required for edit mode) */
  feature?: Feature | null;
  /** Called in create mode */
  onSubmit?: (data: FeatureCreateData) => Promise<void>;
  /** Called in edit mode */
  onSave?: (featureId: string, data: FeatureEditData) => Promise<void>;
}

export function FeatureDialog({
  isOpen,
  onClose,
  mode,
  feature,
  onSubmit,
  onSave
}: FeatureDialogProps): JSX.Element | null {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [autoStart, setAutoStart] = useState(false);
  const [worktreeId, setWorktreeId] = useState<WorktreeId>('neon');
  const [canChangeWorktree, setCanChangeWorktree] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uniqueNameError, setUniqueNameError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Worktree options for the neon button selector
  const worktreeOptions: { value: WorktreeId; label: string }[] = [
    { value: 'neon', label: 'Neon' },
    { value: 'cyber', label: 'Cyber' },
    { value: 'pulse', label: 'Pulse' }
  ];

  // Pre-populate fields when editing
  useEffect(() => {
    if (mode === 'edit' && feature) {
      setName(feature.name);
      setDescription(feature.description || '');
      setWorktreeId(feature.worktreeId || 'neon');
    } else if (mode === 'create') {
      // Reset for create mode
      setName('');
      setDescription('');
      setFiles([]);
      setAutoStart(false);
      setWorktreeId('neon');
      setCanChangeWorktree(true);
    }
    setError(null);
    setUniqueNameError(false);
  }, [mode, feature, isOpen]);

  // Check if worktree can be changed (only if all tasks are in 'ready' status)
  useEffect(() => {
    if (mode !== 'edit' || !feature || !isOpen) {
      setCanChangeWorktree(true);
      return;
    }

    const checkTasks = async () => {
      try {
        const dag = await window.electronAPI.storage.loadDag(feature.id);
        if (!dag || dag.nodes.length === 0) {
          // No tasks, can change worktree
          setCanChangeWorktree(true);
          return;
        }

        // Check if any task is not in 'ready' status
        const hasNonReadyTasks = dag.nodes.some(task => task.status !== 'ready');
        setCanChangeWorktree(!hasNonReadyTasks);
      } catch (err) {
        console.error('Failed to load tasks:', err);
        // Default to allowing change on error
        setCanChangeWorktree(true);
      }
    };

    checkTasks();
  }, [mode, feature, isOpen]);

  if (!isOpen) return null;

  const isEditMode = mode === 'edit';

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setUniqueNameError(false);

    const trimmedName = name.trim();

    // Validation: not empty
    if (!trimmedName) {
      setError('Feature name is required');
      return;
    }

    // Validation: minimum 2 characters
    if (trimmedName.length < 2) {
      setError('Feature name must be at least 2 characters');
      return;
    }

    // Check for duplicate names (skip if editing and name unchanged)
    const nameChanged = isEditMode && feature ? trimmedName !== feature.name : true;
    if (nameChanged) {
      try {
        const exists = await window.electronAPI.storage.featureExists(trimmedName);
        if (exists) {
          setUniqueNameError(true);
          setError('A feature with this name already exists');
          return;
        }
      } catch (err) {
        console.error('Error checking feature existence:', err);
        // Continue if check fails
      }
    }

    setIsSubmitting(true);
    try {
      if (isEditMode && feature && onSave) {
        // Edit mode: save changes
        const data: FeatureEditData = {
          name: trimmedName,
          description: description.trim() || undefined,
          worktreeId: canChangeWorktree ? worktreeId : undefined
        };
        await onSave(feature.id, data);
      } else if (onSubmit) {
        // Create mode: create new feature
        const data: FeatureCreateData = {
          name: trimmedName,
          description: description.trim() || undefined,
          autoStart,
          worktreeId
        };

        // Pass File objects if any - parent will handle uploading to worktree
        if (files.length > 0) {
          data.attachments = files;
        }

        await onSubmit(data);
      }

      // Clear form and close on success
      setName('');
      setDescription('');
      setFiles([]);
      setAutoStart(false);
      setWorktreeId('neon');
      setError(null);
      setUniqueNameError(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditMode ? 'Failed to save feature' : 'Failed to create feature');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (): void => {
    setName('');
    setDescription('');
    setFiles([]);
    setAutoStart(false);
    setWorktreeId('neon');
    setError(null);
    setUniqueNameError(false);
    onClose();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setName(e.target.value);
    // Clear error when user types
    if (error || uniqueNameError) {
      setError(null);
      setUniqueNameError(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...selectedFiles]);
  };

  const handleFileRemove = (index: number): void => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...droppedFiles]);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} size="md" closeOnBackdrop={false} closeOnEscape={false}>
      <DialogHeader title={isEditMode ? 'Feature Settings' : 'Create New Feature'} />

      <form onSubmit={handleSubmit}>
        <DialogBody>
          <div className="new-feature-dialog__form">
            {/* Feature Name */}
            <div className="new-feature-dialog__field">
              <label className="new-feature-dialog__label">Feature Name *</label>
              <Input
                type="text"
                value={name}
                onChange={handleInputChange}
                placeholder="Enter feature name"
                autoFocus
                disabled={isSubmitting}
                error={uniqueNameError}
              />
            </div>

            {/* Description */}
            <div className="new-feature-dialog__field">
              <label className="new-feature-dialog__label">Description (optional)</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the feature (optional)"
                rows={4}
                disabled={isSubmitting}
              />
            </div>

            {/* Worktree Selection */}
            <div className="new-feature-dialog__field">
              <label className="new-feature-dialog__label">Worktree</label>
              <div className="new-feature-dialog__manager-selector">
                {worktreeOptions.map((option) => {
                  const isActive = worktreeId === option.value;
                  const isDisabled = isSubmitting || (isEditMode && !canChangeWorktree);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => !isDisabled && setWorktreeId(option.value)}
                      disabled={isDisabled}
                      className={`manager-btn manager-btn--${option.value} ${isActive ? 'manager-btn--active' : ''}`}
                    >
                      <span className="manager-btn__text">{option.label}</span>
                    </button>
                  );
                })}
              </div>
              {isEditMode && !canChangeWorktree && (
                <p className="new-feature-dialog__hint new-feature-dialog__hint--warning">
                  Cannot change manager while tasks are in progress
                </p>
              )}
            </div>

            {/* File Attachments - only in create mode */}
            {!isEditMode && (
              <div className="new-feature-dialog__field">
                <label className="new-feature-dialog__label">Attachments (optional)</label>
                <div
                  className="new-feature-dialog__dropzone"
                  onDrop={handleFileDrop}
                  onDragOver={handleDragOver}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="new-feature-dialog__file-input"
                    disabled={isSubmitting}
                  />
                  <div className="new-feature-dialog__dropzone-content">
                    <svg className="new-feature-dialog__dropzone-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="new-feature-dialog__dropzone-text">
                      Drop files here or{' '}
                      <button
                        type="button"
                        className="new-feature-dialog__dropzone-button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSubmitting}
                      >
                        browse
                      </button>
                    </p>
                  </div>
                </div>

                {/* File list */}
                {files.length > 0 && (
                  <div className="new-feature-dialog__file-list">
                    {files.map((file, index) => (
                      <div key={index} className="new-feature-dialog__file-item">
                        <span className="new-feature-dialog__file-name">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => handleFileRemove(index)}
                          className="new-feature-dialog__file-remove"
                          disabled={isSubmitting}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Auto Start - only in create mode */}
            {!isEditMode && (
              <div className="new-feature-dialog__field">
                <label className="new-feature-dialog__checkbox-option">
                  <input
                    type="checkbox"
                    checked={autoStart}
                    onChange={(e) => setAutoStart(e.target.checked)}
                    disabled={isSubmitting}
                    className="new-feature-dialog__checkbox-input"
                  />
                  <div className="new-feature-dialog__checkbox-content">
                    <span className="new-feature-dialog__checkbox-title">Auto Start</span>
                    <span className="new-feature-dialog__checkbox-desc">Begin execution automatically when planning completes</span>
                  </div>
                </label>
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="new-feature-dialog__error">
                {error}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? (isEditMode ? 'Saving...' : 'Creating...')
              : (isEditMode ? 'Save' : 'Create')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/**
 * Backward-compatible wrapper for create mode.
 * Use FeatureDialog directly for more control.
 */
interface NewFeatureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: FeatureCreateData) => Promise<void>;
}

export function NewFeatureDialog({
  isOpen,
  onClose,
  onSubmit
}: NewFeatureDialogProps): JSX.Element | null {
  return (
    <FeatureDialog
      isOpen={isOpen}
      onClose={onClose}
      mode="create"
      onSubmit={onSubmit}
    />
  );
}
