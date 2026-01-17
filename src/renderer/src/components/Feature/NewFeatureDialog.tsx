import type { JSX } from 'react';
import { useState, useRef } from 'react';
import { Dialog, DialogHeader, DialogBody, DialogFooter, Input, Button, Textarea, Checkbox } from '../UI';
import './NewFeatureDialog.css';

interface FeatureCreateData {
  name: string;
  description?: string;
  attachments?: string[];
  autoMerge?: boolean;
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
  const [autoMerge, setAutoMerge] = useState(false);
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
        autoMerge
      };

      // Upload attachments if any (we'll handle this after feature creation)
      // Note: We can't upload before feature exists, so we pass file names
      // and the parent component will handle actual upload after feature creation
      if (files.length > 0) {
        data.attachments = files.map(f => f.name);
      }

      await onSubmit(data);

      // Clear form and close on success
      setName('');
      setDescription('');
      setFiles([]);
      setAutoMerge(false);
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
    setAutoMerge(false);
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
    <Dialog open={isOpen} onClose={handleClose} size="sm">
      <DialogHeader title="Create New Feature" />

      <form onSubmit={handleSubmit}>
        <DialogBody>
          <div className="new-feature-dialog__form">
            <div className="new-feature-dialog__field">
              <label className="new-feature-dialog__label">Feature Name</label>
              <Input
                type="text"
                value={name}
                onChange={handleInputChange}
                placeholder="Enter feature name"
                autoFocus
                disabled={isSubmitting}
              />
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
