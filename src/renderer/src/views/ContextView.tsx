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
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [initProgress, setInitProgress] = useState<{ message: string; detail?: string } | null>(null);

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
   * Load CLAUDE.md content on mount.
   */
  useEffect(() => {
    const loadClaudeMd = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await window.electronAPI.context.getClaudeMd();
        if ('error' in result) {
          setError(result.error);
          return;
        }

        if (result.content === null) {
          // CLAUDE.md doesn't exist, show init dialog
          setShowInitDialog(true);
          setContent('');
          setOriginalContent('');
        } else {
          setContent(result.content);
          setOriginalContent(result.content);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to load CLAUDE.md: ${message}`);
        console.error('Failed to load CLAUDE.md:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadClaudeMd();
  }, []);

  /**
   * Subscribe to skill progress updates.
   */
  useEffect(() => {
    const unsubscribe = window.electronAPI.skill.onProgress((data) => {
      setInitProgress(data);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Handle content changes and track dirty state.
   */
  const handleContentChange = useCallback(
    (newContent: string): void => {
      setContent(newContent);
      setIsDirty(newContent !== originalContent);
    },
    [originalContent, setIsDirty]
  );

  /**
   * Save CLAUDE.md content to project root.
   */
  const handleSave = async (): Promise<void> => {
    setError(null);
    setIsSaving(true);
    try {
      const result = await window.electronAPI.context.saveClaudeMd(content);
      if ('error' in result) {
        setError(result.error);
        toast.error('Failed to save context');
        return;
      }

      setLastSynced(new Date().toISOString());
      setOriginalContent(content);
      setIsDirty(false);
      toast.success('Context saved to CLAUDE.md');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to save: ${message}`);
      toast.error('Failed to save context');
      console.error('Failed to save CLAUDE.md:', err);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handle running /init skill to generate CLAUDE.md.
   */
  const handleRunInit = async (): Promise<void> => {
    setIsInitializing(true);
    setError(null);
    setInitProgress(null); // Clear any previous progress
    setShowInitDialog(false); // Close dialog while initializing
    try {
      const result = await window.electronAPI.skill.runInit();
      if ('error' in result) {
        setError(result.error);
        toast.error('Failed to initialize CLAUDE.md');
        return;
      }

      // Reload the content after successful init
      const contentResult = await window.electronAPI.context.getClaudeMd();
      if ('error' in contentResult) {
        setError(contentResult.error);
        return;
      }

      if (contentResult.content !== null) {
        setContent(contentResult.content);
        setOriginalContent(contentResult.content);
        toast.success('CLAUDE.md initialized successfully');
      } else {
        setError('Init completed but CLAUDE.md was not created');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to initialize: ${message}`);
      toast.error('Failed to initialize CLAUDE.md');
      console.error('Failed to run /init:', err);
    } finally {
      setIsInitializing(false);
      // Clear progress after a short delay to show completion
      setTimeout(() => setInitProgress(null), 2000);
    }
  };

  /**
   * Handle skipping initialization.
   */
  const handleSkipInit = (): void => {
    setShowInitDialog(false);
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
          onClick={handleRunInit}
          disabled={isLoading || isInitializing}
          className="context-view__generate-btn"
          title="Run /init to analyze codebase and generate CLAUDE.md"
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
            {isInitializing ? 'Initializing...' : 'Initialize with AI'}
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
      <div className="context-view__editor" style={{ position: 'relative' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <div style={{ color: 'var(--text-secondary)' }}>Loading CLAUDE.md...</div>
          </div>
        ) : (
          <>
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
              disabled={isInitializing}
            />
            {/* Initializing Overlay */}
            {isInitializing && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '1rem',
                  zIndex: 10
                }}
              >
                <svg
                  style={{
                    width: '3rem',
                    height: '3rem',
                    animation: 'spin 1s linear infinite'
                  }}
                  fill="none"
                  stroke="var(--primary)"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <div style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 500 }}>
                  {initProgress?.message || 'Initializing CLAUDE.md...'}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', maxWidth: '400px' }}>
                  {initProgress?.detail || 'Analyzing your codebase and generating documentation.'}
                  {!initProgress && <><br/>This may take a minute or two.</>}
                </div>
              </div>
            )}
          </>
        )}
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

      {/* Initialize CLAUDE.md Dialog */}
      <Dialog
        open={showInitDialog}
        onClose={handleSkipInit}
        size="md"
        closeOnBackdrop={true}
      >
        <DialogHeader title="CLAUDE.md Not Found" />
        <DialogBody>
          <div style={{ color: 'var(--text-secondary)' }}>
            <p style={{ marginTop: 0 }}>
              CLAUDE.md provides guidance to AI agents when working with your codebase.
            </p>
            <p>
              Would you like to initialize it now? The /init skill will:
            </p>
            <ul style={{ marginLeft: '1.5rem' }}>
              <li>Analyze your codebase structure</li>
              <li>Identify build commands and scripts</li>
              <li>Document key architecture patterns</li>
              <li>Generate a comprehensive CLAUDE.md file</li>
            </ul>
            <p style={{ marginBottom: 0 }}>
              This process may take a minute or two.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={handleSkipInit}>
            Skip - Start Empty
          </Button>
          <Button variant="primary" onClick={handleRunInit}>
            Initialize
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
