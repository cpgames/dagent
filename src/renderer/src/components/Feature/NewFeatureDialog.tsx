import type { JSX } from 'react';
import { useState } from 'react';
import { Dialog, DialogHeader, DialogBody, DialogFooter, Input, Button } from '../UI';
import './NewFeatureDialog.css';

interface NewFeatureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export function NewFeatureDialog({
  isOpen,
  onClose,
  onSubmit
}: NewFeatureDialogProps): JSX.Element | null {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

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

    setIsSubmitting(true);
    try {
      await onSubmit(trimmedName);
      // Clear form and close on success
      setName('');
      setError(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create feature');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (): void => {
    setName('');
    setError(null);
    onClose();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setName(e.target.value);
    // Clear error when user types
    if (error) {
      setError(null);
    }
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
