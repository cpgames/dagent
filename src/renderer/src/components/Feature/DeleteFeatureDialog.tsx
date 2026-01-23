import type { JSX } from 'react';
import { useState } from 'react';
import type { Feature } from '@shared/types';
import { Dialog, DialogHeader, DialogBody, DialogFooter, Checkbox, Button } from '../UI';
import './DeleteFeatureDialog.css';

interface DeleteFeatureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  feature: Feature | null;
  onConfirm: (deleteBranch: boolean) => Promise<void>;
}

export function DeleteFeatureDialog({
  isOpen,
  onClose,
  feature,
  onConfirm
}: DeleteFeatureDialogProps): JSX.Element | null {
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !feature) return null;

  const handleConfirm = async (): Promise<void> => {
    setIsDeleting(true);
    try {
      await onConfirm(deleteBranch);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = (): void => {
    if (!isDeleting) {
      setDeleteBranch(true); // Reset to default
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} size="sm" closeOnBackdrop={!isDeleting}>
      <DialogHeader title="Delete Feature" />

      <DialogBody>
        <div className="delete-feature-dialog__content">
          <p className="delete-feature-dialog__message">
            Are you sure you want to delete{' '}
            <span className="delete-feature-dialog__feature-name">{feature.name}</span>?
          </p>

          <div className="delete-feature-dialog__warning">
            <p className="delete-feature-dialog__warning-title">This action is irreversible!</p>
            <p>All task data, chat history, and related files will be permanently deleted.</p>
          </div>

          <div className="delete-feature-dialog__option">
            <Checkbox
              checked={deleteBranch}
              onChange={(e) => setDeleteBranch(e.target.checked)}
              disabled={isDeleting}
              label="Also delete git branch and worktrees"
            />
          </div>
        </div>
      </DialogBody>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={handleClose}
          disabled={isDeleting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={handleConfirm}
          disabled={isDeleting}
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
