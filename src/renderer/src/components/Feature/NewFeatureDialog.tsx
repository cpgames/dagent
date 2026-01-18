import type { JSX } from 'react';
import { useState, useRef } from 'react';
import { Dialog, DialogHeader, DialogBody, DialogFooter, Input, Button, Textarea } from '../UI';
import type { CompletionAction } from '@shared/types/feature';
import './NewFeatureDialog.css';

export interface FeatureCreateData {
  name: string;
  description?: string;
  attachments?: File[];
  completionAction?: CompletionAction;
  autoStart?: boolean;
}

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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [completionAction, setCompletionAction] = useState<CompletionAction>('manual');
  const [autoStart, setAutoStart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uniqueNameError, setUniqueNameError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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

    // Check for duplicate names
    try {
      const exists = await window.electronAPI.storage.featureExists(trimmedName);
      if (exists) {
        setUniqueNameError(true);
        setError('A feature with this name already exists');
        return;
      }
    } catch (err) {
      console.error('Error checking feature existence:', err);
      // Continue with creation if check fails
    }

    setIsSubmitting(true);
    try {
      // Prepare data
      const data: FeatureCreateData = {
        name: trimmedName,
        description: description.trim() || undefined,
        completionAction,
        autoStart
      };

      // Pass File objects if any - parent will handle uploading to worktree
      if (files.length > 0) {
        data.attachments = files;
      }

      await onSubmit(data);

      // Clear form and close on success
      setName('');
      setDescription('');
      setFiles([]);
      setCompletionAction('manual');
      setAutoStart(false);
      setError(null);
      setUniqueNameError(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create feature');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (): void => {
    setName('');
    setDescription('');
    setFiles([]);
    setCompletionAction('manual');
    setAutoStart(false);
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
      <DialogHeader title="Create New Feature" />

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

            {/* File Attachments */}
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

            {/* Completion Action */}
            <div className="new-feature-dialog__field">
              <label className="new-feature-dialog__label">When Completed</label>
              <div className="new-feature-dialog__radio-group">
                <label className="new-feature-dialog__radio-option">
                  <input
                    type="radio"
                    name="completionAction"
                    value="manual"
                    checked={completionAction === 'manual'}
                    onChange={() => setCompletionAction('manual')}
                    disabled={isSubmitting}
                    className="new-feature-dialog__radio-input"
                  />
                  <div className="new-feature-dialog__radio-content">
                    <span className="new-feature-dialog__radio-title">Manual</span>
                    <span className="new-feature-dialog__radio-desc">I'll create the PR myself</span>
                  </div>
                </label>
                <label className="new-feature-dialog__radio-option">
                  <input
                    type="radio"
                    name="completionAction"
                    value="auto_pr"
                    checked={completionAction === 'auto_pr'}
                    onChange={() => setCompletionAction('auto_pr')}
                    disabled={isSubmitting}
                    className="new-feature-dialog__radio-input"
                  />
                  <div className="new-feature-dialog__radio-content">
                    <span className="new-feature-dialog__radio-title">Auto PR</span>
                    <span className="new-feature-dialog__radio-desc">Create Pull Request automatically</span>
                  </div>
                </label>
                <label className="new-feature-dialog__radio-option">
                  <input
                    type="radio"
                    name="completionAction"
                    value="auto_merge"
                    checked={completionAction === 'auto_merge'}
                    onChange={() => setCompletionAction('auto_merge')}
                    disabled={isSubmitting}
                    className="new-feature-dialog__radio-input"
                  />
                  <div className="new-feature-dialog__radio-content">
                    <span className="new-feature-dialog__radio-title">Auto Merge</span>
                    <span className="new-feature-dialog__radio-desc">Merge into main directly</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Auto Start */}
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
            {isSubmitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
