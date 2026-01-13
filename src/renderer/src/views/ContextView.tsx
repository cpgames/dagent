import { useState, useCallback, useEffect, useRef, type JSX } from 'react';
import { toast } from '../stores/toast-store';
import { useViewStore } from '../stores';

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
   * Attempt an action that may require confirmation if there are unsaved changes.
   * If dirty, show confirmation dialog. Otherwise, execute immediately.
   */
  const confirmDiscardIfDirty = useCallback(
    (action: () => void): void => {
      if (isDirty) {
        setPendingAction(() => action);
        setShowDiscardDialog(true);
      } else {
        action();
      }
    },
    [isDirty]
  );

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
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-white">Project Context</h2>
          {isDirty && (
            <span className="text-xs bg-yellow-600 text-yellow-100 px-2 py-0.5 rounded">
              Unsaved
            </span>
          )}
        </div>
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-400 bg-gray-700 border border-gray-600 rounded-md cursor-not-allowed opacity-60 focus:outline-none"
          title="Coming soon: AI will generate context from your codebase"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <span className="flex items-center gap-1">
            Generate with AI
            <span className="text-xs">(Soon)</span>
          </span>
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-2 bg-red-900/90 text-red-100 px-3 py-2 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-2 hover:text-white text-red-200"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Main textarea */}
      <div className="flex-1 min-h-0 flex flex-col">
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
          className="flex-1 w-full min-h-0 px-4 py-3 font-mono text-sm bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-400">
          {lastSynced ? (
            <span>Last saved: {formatTimestamp(lastSynced)}</span>
          ) : (
            <span>Not yet saved</span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
            isDirty
              ? 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500'
              : 'bg-gray-700 text-gray-300 focus:ring-gray-500'
          }`}
        >
          <svg
            className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`}
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
      {showDiscardDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md shadow-xl border border-gray-700">
            <h3 className="text-lg font-semibold mb-2 text-white">Unsaved Changes</h3>
            <p className="text-gray-300 mb-4">
              You have unsaved changes. Do you want to discard them?
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white"
                onClick={handleCancelDiscard}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white"
                onClick={handleConfirmDiscard}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
