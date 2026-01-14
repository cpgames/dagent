import type { JSX } from 'react';
import { useState } from 'react';
import type { Feature } from '@shared/types';

interface DeleteFeatureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  feature: Feature | null;
  onConfirm: (deleteBranch: boolean) => void;
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
      onConfirm(deleteBranch);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Dialog */}
      <div
        className="relative bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Delete Feature</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="text-gray-400 hover:text-white focus:outline-none disabled:opacity-50"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Warning content */}
        <div className="mb-4">
          <p className="text-gray-300 mb-3">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-white">{feature.name}</span>?
          </p>
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-md text-sm text-red-300">
            <p className="font-medium mb-1">This action is irreversible!</p>
            <p>All task data, chat history, and related files will be permanently deleted.</p>
          </div>
        </div>

        {/* Options */}
        <div className="mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteBranch}
              onChange={(e) => setDeleteBranch(e.target.checked)}
              disabled={isDeleting}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
            />
            <span className="text-sm text-gray-300">
              Also delete git branch and worktrees
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
