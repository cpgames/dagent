import { useState, useEffect, type JSX, type FormEvent } from 'react';
import type { Task } from '@shared/types';
import type { TaskLoopStatus } from '../../../../main/dag-engine/orchestrator-types';
import { getTaskStatusLabel } from '@shared/types/task';
import { Dialog, DialogHeader, DialogBody, DialogFooter, Input, Textarea, Button } from '../UI';
import './NodeDialog.css';

export interface NodeDialogProps {
  task: Task;
  loopStatus?: TaskLoopStatus | null;
  onSave: (updates: Partial<Task>) => void;
  onClose: () => void;
  onAbortLoop?: (taskId: string) => void;
}

// Helper to get loop status CSS class
const getLoopStatusClass = (status: string): string => {
  switch (status) {
    case 'running': return 'node-dialog__loop-status--running';
    case 'completed': return 'node-dialog__loop-status--completed';
    case 'failed': return 'node-dialog__loop-status--failed';
    case 'aborted': return 'node-dialog__loop-status--aborted';
    default: return '';
  }
};

// Helper to get checklist icon CSS class
const getChecklistIconClass = (status: string): string => {
  switch (status) {
    case 'pass': return 'node-dialog__checklist-icon--pass';
    case 'fail': return 'node-dialog__checklist-icon--fail';
    case 'pending': return 'node-dialog__checklist-icon--pending';
    case 'skipped': return 'node-dialog__checklist-icon--skipped';
    default: return 'node-dialog__checklist-icon--pending';
  }
};

// Checklist status icons
const checklistIcons: Record<string, string> = {
  pass: '\u2713',
  fail: '\u2717',
  pending: '\u25CB',
  skipped: '\u2014',
};

export default function NodeDialog({
  task,
  loopStatus,
  onSave,
  onClose,
  onAbortLoop,
}: NodeDialogProps): JSX.Element {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [locked, setLocked] = useState(task.locked);

  // Reset form when task changes
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setLocked(task.locked);
  }, [task]);

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    onSave({
      title: title.trim(),
      description: description.trim(),
      locked,
    });
    onClose();
  };

  return (
    <Dialog open={true} onClose={onClose} size="lg">
      <DialogHeader title="Edit Task" />

      <form onSubmit={handleSubmit}>
        <DialogBody>
          <div className="node-dialog__form">
            {/* Name field */}
            <div className="node-dialog__field">
              <label htmlFor="task-title" className="node-dialog__label">
                Name
              </label>
              <Input
                id="task-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task name"
                required
              />
            </div>

            {/* Description field */}
            <div className="node-dialog__field">
              <label htmlFor="task-description" className="node-dialog__label">
                Description
              </label>
              <Textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Task description"
              />
            </div>

            {/* Status display (read-only) */}
            <div className="node-dialog__status-row">
              <span className="node-dialog__status-label">Status</span>
              <span className={`node-dialog__status-badge node-dialog__status-badge--${task.status}`}>
                {getTaskStatusLabel(task.status)}
              </span>
            </div>

            {/* Loop Status Section */}
            {loopStatus && (
              <div className="node-dialog__loop-section">
                <div className="node-dialog__loop-header">
                  <span className="node-dialog__loop-label">Loop Progress</span>
                  <span className={`node-dialog__loop-status ${getLoopStatusClass(loopStatus.status)}`}>
                    {loopStatus.status.toUpperCase()} - Iteration{' '}
                    {loopStatus.currentIteration}/{loopStatus.maxIterations}
                  </span>
                </div>

                {/* Checklist items */}
                <div className="node-dialog__checklist">
                  {Object.entries(loopStatus.checklistSnapshot).map(([key, status]) => {
                    const icon = checklistIcons[status] || checklistIcons.pending;
                    return (
                      <div key={key} className="node-dialog__checklist-item">
                        <span className={`node-dialog__checklist-icon ${getChecklistIconClass(status)}`}>
                          {icon}
                        </span>
                        <span className="node-dialog__checklist-label">{key}</span>
                        <span className={`node-dialog__checklist-status ${getChecklistIconClass(status)}`}>
                          ({status})
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Abort button - only show if running */}
                {loopStatus.status === 'running' && onAbortLoop && (
                  <button
                    type="button"
                    onClick={() => onAbortLoop(task.id)}
                    className="node-dialog__abort-btn"
                  >
                    <svg className="node-dialog__abort-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Abort Loop
                  </button>
                )}

                {/* Error message if failed */}
                {loopStatus.error && (
                  <div className="node-dialog__loop-error">
                    {loopStatus.error}
                  </div>
                )}

                {/* Exit reason if completed/failed */}
                {loopStatus.exitReason && (
                  <div className="node-dialog__loop-exit">
                    Exit reason: {loopStatus.exitReason}
                  </div>
                )}
              </div>
            )}

            {/* Lock toggle and Chat button row */}
            <div className="node-dialog__controls-row">
              {/* Lock toggle */}
              <button
                type="button"
                onClick={() => setLocked(!locked)}
                className={`node-dialog__lock-btn ${locked ? 'node-dialog__lock-btn--locked' : ''}`}
              >
                {locked ? (
                  <svg className="node-dialog__lock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ) : (
                  <svg className="node-dialog__lock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                )}
                <span>{locked ? 'Locked' : 'Unlocked'}</span>
              </button>

              {/* Chat button (placeholder - disabled for now) */}
              <button
                type="button"
                disabled
                className="node-dialog__chat-btn"
                title="Coming soon: Chat with AI about this task"
              >
                <svg className="node-dialog__chat-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>Chat <span style={{ fontSize: '0.75rem' }}>(Soon)</span></span>
              </button>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
