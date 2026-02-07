import { useState, useEffect, useRef, useCallback, type JSX } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from '../stores/toast-store';
import { useProjectStore } from '../stores';
import { Dialog, DialogHeader, DialogBody, DialogFooter, Button } from '../components/UI';
import { UnifiedChatPanel } from '../components/Chat';
import './ContextView.css';

/**
 * ContextView - Displays CLAUDE.md content as rendered markdown with chat panel.
 */
export default function ContextView(): JSX.Element {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [initProgress, setInitProgress] = useState<{ message: string; detail?: string } | null>(null);
  const [chatPanelOpen, setChatPanelOpen] = useState(true);
  const [chatPanelWidth, setChatPanelWidth] = useState(400);
  const [isCommitting, setIsCommitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const isResizing = useRef(false);

  const projectPath = useProjectStore((state) => state.projectPath);

  // Generate session ID for this project
  const sessionId = projectPath ? `setup-context-${projectPath.replace(/[^a-zA-Z0-9]/g, '-')}` : '';

  /**
   * Load CLAUDE.md content.
   */
  const loadClaudeMd = useCallback(async (showDialog = true): Promise<void> => {
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
        if (showDialog) {
          setShowInitDialog(true);
        }
        setContent('');
      } else {
        setContent(result.content);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load CLAUDE.md: ${message}`);
      console.error('Failed to load CLAUDE.md:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Load CLAUDE.md on mount.
   */
  useEffect(() => {
    loadClaudeMd();
  }, [loadClaudeMd]);

  /**
   * Check if CLAUDE.md has uncommitted changes.
   */
  const checkClaudeMdChanges = useCallback(async (): Promise<void> => {
    try {
      const result = await window.electronAPI.context.hasClaudeMdChanges();
      setHasChanges(result.hasChanges);
    } catch (err) {
      console.error('Failed to check CLAUDE.md changes:', err);
      setHasChanges(false);
    }
  }, []);

  /**
   * Check for changes when content loads or updates.
   */
  useEffect(() => {
    if (content) {
      checkClaudeMdChanges();
    }
  }, [content, checkClaudeMdChanges]);

  /**
   * Subscribe to CLAUDE.md update events.
   */
  useEffect(() => {
    const unsubscribe = window.electronAPI.context.onClaudeMdUpdated(() => {
      // Reload content when CLAUDE.md is updated by the agent
      loadClaudeMd(false);
      // Also recheck for changes
      checkClaudeMdChanges();
    });

    return () => {
      unsubscribe();
    };
  }, [loadClaudeMd, checkClaudeMdChanges]);

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
   * Handle running /init skill to generate CLAUDE.md.
   */
  const handleRunInit = async (): Promise<void> => {
    setIsInitializing(true);
    setError(null);
    setInitProgress(null);
    setShowInitDialog(false);
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
      setTimeout(() => setInitProgress(null), 2000);
    }
  };

  /**
   * Handle skipping initialization.
   */
  const handleSkipInit = (): void => {
    setShowInitDialog(false);
  };

  /**
   * Open chat panel.
   */
  const handleOpenChat = (): void => {
    setShowInitDialog(false);
    setChatPanelOpen(true);
  };

  /**
   * Commit and sync CLAUDE.md to all worktrees.
   */
  const handleCommitAndSync = async (): Promise<void> => {
    if (!content || !hasChanges) return;

    setIsCommitting(true);
    try {
      const result = await window.electronAPI.context.commitAndSyncClaudeMd();
      if ('error' in result) {
        toast.error(`Failed to commit: ${result.error}`);
      } else {
        toast.success(result.synced ? 'Committed and synced to worktrees' : 'Committed (no worktrees to sync)');
        // Recheck changes after successful commit
        await checkClaudeMdChanges();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to commit: ${message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  /**
   * Handle resize start.
   */
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, []);

  /**
   * Handle resize move.
   */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setChatPanelWidth(Math.max(280, Math.min(600, newWidth)));
    };

    const handleMouseUp = (): void => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className={`context-view ${chatPanelOpen ? 'context-view--chat-open' : ''}`}>
      {/* Main content area */}
      <div className="context-view__main">
        {/* Header */}
        <div className="context-view__header">
          <div className="context-view__header-left">
            <h2 className="context-view__title">Project Context</h2>
          </div>
          <div className="context-view__header-right">
            {content && (
              <button
                onClick={handleCommitAndSync}
                className={`context-view__commit-btn ${!hasChanges ? 'context-view__commit-btn--uptodate' : ''}`}
                title={hasChanges ? 'Commit CLAUDE.md and sync to worktrees' : 'No uncommitted changes'}
                disabled={isCommitting || !hasChanges}
              >
                {isCommitting ? (
                  <svg className="context-view__icon context-view__icon--spinning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : hasChanges ? (
                  <svg className="context-view__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                ) : (
                  <svg className="context-view__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span>{isCommitting ? 'Syncing...' : hasChanges ? 'Commit & Sync' : 'Up to date'}</span>
              </button>
            )}
            {!chatPanelOpen && (
              <button
                onClick={() => setChatPanelOpen(true)}
                className="context-view__chat-toggle"
                title="Open chat"
              >
                <svg className="context-view__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span>Chat</span>
              </button>
            )}
          </div>
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
              ×
            </button>
          </div>
        )}

        {/* Markdown content */}
        <div className="context-view__content" style={{ position: 'relative' }}>
          {isLoading ? (
            <div className="context-view__loading">
              <div style={{ color: 'var(--text-secondary)' }}>Loading CLAUDE.md...</div>
            </div>
          ) : content ? (
            <div className="context-view__markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
            <div className="context-view__empty">
              <p>No CLAUDE.md found. Open Chat to create one.</p>
            </div>
          )}

          {/* Initializing Overlay */}
          {isInitializing && (
            <div className="context-view__overlay">
              <svg
                className="context-view__overlay-spinner"
                fill="none"
                stroke="var(--accent-primary)"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <div className="context-view__overlay-title">
                {initProgress?.message || 'Initializing CLAUDE.md...'}
              </div>
              <div className="context-view__overlay-detail">
                {initProgress?.detail || 'Analyzing your codebase and generating documentation.'}
                {!initProgress && <><br />This may take a minute or two.</>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat side panel using UnifiedChatPanel */}
      {chatPanelOpen && projectPath && (
        <div className="context-view__chat-panel" style={{ width: chatPanelWidth }}>
          {/* Resize handle */}
          <div
            className="context-view__chat-resize-handle"
            onMouseDown={handleResizeStart}
          />
          <div className="context-view__chat-panel-header">
            <span className="context-view__chat-panel-title">Chat</span>
            <button
              onClick={() => setChatPanelOpen(false)}
              className="context-view__chat-panel-close"
              title="Close chat"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <UnifiedChatPanel
            sessionId={sessionId}
            chatType="project"
            projectRoot={projectPath}
            placeholder="Type your message..."
          />
        </div>
      )}

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
              Choose how you want to create it:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: '1rem 0' }}>
              <div style={{
                padding: '1rem',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)'
              }}>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                  Chat (Recommended)
                </div>
                <div style={{ fontSize: '0.875rem' }}>
                  Describe your project in a conversation and generate a tailored CLAUDE.md.
                </div>
              </div>
              <div style={{
                padding: '1rem',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)'
              }}>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                  Auto-Analyze
                </div>
                <div style={{ fontSize: '0.875rem' }}>
                  AI scans your codebase structure and patterns to generate CLAUDE.md automatically.
                </div>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={handleSkipInit}>
            Skip
          </Button>
          <Button variant="secondary" onClick={handleRunInit}>
            Auto-Analyze
          </Button>
          <Button variant="primary" onClick={handleOpenChat}>
            Chat
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
