import { useState, useEffect, type JSX, type FormEvent } from 'react';
import type { Task, TaskStatus } from '@shared/types';

export interface NodeDialogProps {
  task: Task;
  onSave: (updates: Partial<Task>) => void;
  onClose: () => void;
}

const statusBadgeColors: Record<TaskStatus, string> = {
  blocked: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  ready: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  running: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  merging: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  completed: 'bg-green-500/20 text-green-400 border-green-500/50',
  failed: 'bg-red-500/20 text-red-400 border-red-500/50',
};

export default function NodeDialog({ task, onSave, onClose }: NodeDialogProps): JSX.Element {
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

  const handleOverlayClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Edit Task</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {/* Name field */}
            <div>
              <label htmlFor="task-title" className="block text-sm font-medium text-gray-300 mb-1">
                Name
              </label>
              <input
                id="task-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Task name"
                required
              />
            </div>

            {/* Description field */}
            <div>
              <label
                htmlFor="task-description"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Description
              </label>
              <textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Task description"
              />
            </div>

            {/* Status display (read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
              <span
                className={`inline-block px-3 py-1 text-sm font-medium rounded-full border capitalize ${statusBadgeColors[task.status]}`}
              >
                {task.status}
              </span>
            </div>

            {/* Lock toggle and Chat button row */}
            <div className="flex items-center gap-4">
              {/* Lock toggle */}
              <button
                type="button"
                onClick={() => setLocked(!locked)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-colors ${
                  locked
                    ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {locked ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                    />
                  </svg>
                )}
                <span>{locked ? 'Locked' : 'Unlocked'}</span>
              </button>

              {/* Chat button (placeholder - disabled for now) */}
              <button
                type="button"
                disabled
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-gray-400 cursor-not-allowed opacity-60"
                title="Coming soon: Chat with AI about this task"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span className="flex items-center gap-1">
                  Chat
                  <span className="text-xs">(Soon)</span>
                </span>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
