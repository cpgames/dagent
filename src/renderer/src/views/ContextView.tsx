import { useState, useCallback, useEffect, useRef, type JSX } from 'react';
import { toast } from '../stores/toast-store';
import { useViewStore } from '../stores';
import { Dialog, DialogHeader, DialogBody, DialogFooter, Button } from '../components/UI';
import './ContextView.css';

/**
 * ContextView - Displays context documents and CLAUDE.md content.
 * Allows editing project context that agents can access.
 * Per DAGENT_SPEC 3.5.
 */
export default function ContextView(): JSX.Element {
  const { setContextViewDirty, setConfirmDiscardCallback } = useViewStore();
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isDirty, setIsDirtyLocal] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Ref to resolve/reject the confirmation promise for view switching
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);

  /**
   * Wrapper to sync local dirty state with store.
   */
  const setIsDirty = useCallback(
    (dirty: boolean): void => {
      setIsDirtyLocal(dirty);
      setContextViewDirty(dirty);
    },
    [setContextViewDirty]
  );

  /**
   * Register confirmation callback with view store on mount.
   * This allows App.tsx to trigger the discard dialog when switching views.
   */
  useEffect(() => {
    const confirmCallback = (): Promise<boolean> => {
      return new Promise((resolve) => {
        confirmResolveRef.current = resolve;
        setShowDiscardDialog(true);
      });
    };

    setConfirmDiscardCallback(confirmCallback);

    return () => {
      setConfirmDiscardCallback(null);
      setContextViewDirty(false);
    };
  }, [setConfirmDiscardCallback, setContextViewDirty]);

  /**
   * Add beforeunload handler to warn user when closing browser/Electron with unsaved changes.
   * This shows the browser's native "Leave site?" dialog.
   */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent): string | undefined => {
      if (isDirty) {
        e.preventDefault();
        // Required for Chrome - setting returnValue triggers the dialog
        e.returnValue = '';
        // Required for other browsers
        return '';
      }
      return undefined;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  /**
   * Handle content changes and track dirty state.
   */
  const handleContentChange = useCallback(
    (newContent: string): void => {
      setContent(newContent);
      setIsDirty(newContent !== originalContent);
    },
    [originalContent]
  );

  // TODO: Implement actual save via IPC to write CLAUDE.md file
  const handleSave = async (): Promise<void> => {
    setError(null);
    setIsSaving(true);
    try {
      // Placeholder - logs to console until IPC save is implemented
      console.log('Save CLAUDE.md:', content.substring(0, 100) + '...');
      setLastSynced(new Date().toISOString());
      // Reset dirty state after successful save
      setOriginalContent(content);
      setIsDirty(false);
      toast.success('Context saved');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to save: ${message}`);
      toast.error('Failed to save context');
      console.error('Failed to save CLAUDE.md:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const formatTimestamp = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  /**
   * Handle confirming discard of unsaved changes.
   * Resolves any pending promise (for view switching) and executes pending action.
   */
  const handleConfirmDiscard = (): void => {
    setShowDiscardDialog(false);
    setIsDirty(false);
    setContent(originalContent);

    // Resolve view-switch confirmation promise
    if (confirmResolveRef.current) {
      confirmResolveRef.current(true);
      confirmResolveRef.current = null;
    }

    // Execute any pending local action
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  /**
   * Handle canceling the discard dialog.
   * Rejects view-switch and clears pending action.
   */
  const handleCancelDiscard = (): void => {
    setShowDiscardDialog(false);
    setPendingAction(null);

    // Resolve view-switch confirmation promise with false (cancelled)
    if (confirmResolveRef.current) {
      confirmResolveRef.current(false);
      confirmResolveRef.current = null;
    }
  };

  return (
    <div className="context-view">
      {/* Header */}
      <div className="context-view__header">
        <div className="context-view__header-left">
          <h2 className="context-view__title">Project Context</h2>
          {isDirty && <span className="context-view__badge--unsaved">Unsaved</span>}
        </div>
        <button
          disabled
          className="context-view__generate-btn"
          title="Coming soon: AI will generate context from your codebase"
        >
          <svg className="context-view__generate-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <span>
            Generate with AI
            <span className="context-view__generate-soon"> (Soon)</span>
          </span>
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="context-view__error">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="context-view__error-dismiss"
            aria-label="Dismiss error"
          >
            x
          </button>
        </div>
      )}

      {/* Main textarea */}
      <div className="context-view__editor">
        <textarea
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder={`# Project Context

Describe your project context here. This content will be used as CLAUDE.md for AI agents.

## Project Overview
Brief description of what the project does...

## Architecture
Key architectural decisions and patterns...

## Conventions
Coding standards, naming conventions, etc...

## Dependencies
Important dependencies and their purposes...`}
          className="context-view__textarea"
        />
      </div>

      {/* Footer */}
      <div className="context-view__footer">
        <div className="context-view__timestamp">
          {lastSynced ? (
            <span>Last saved: {formatTimestamp(lastSynced)}</span>
          ) : (
            <span>Not yet saved</span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className={`context-view__save-btn ${isDirty ? 'context-view__save-btn--active' : 'context-view__save-btn--inactive'}`}
        >
          <svg
            className={`context-view__save-icon ${isSaving ? 'context-view__save-icon--spinning' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
          {isSaving ? 'Saving...' : 'Save to CLAUDE.md'}
        </button>
      </div>

      {/* Discard Changes Confirmation Dialog */}
      <Dialog
        open={showDiscardDialog}
        onClose={handleCancelDiscard}
        size="sm"
        closeOnBackdrop={false}
      >
        <DialogHeader title="Unsaved Changes" />
        <DialogBody>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            You have unsaved changes. Do you want to discard them?
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={handleCancelDiscard}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirmDiscard}>
            Discard
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
