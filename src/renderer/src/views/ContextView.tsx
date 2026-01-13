import { useState, useCallback, type JSX } from 'react';
import { toast } from '../stores/toast-store';

/**
 * ContextView - Displays context documents and CLAUDE.md content.
 * Allows editing project context that agents can access.
 * Per DAGENT_SPEC 3.5.
 */
export default function ContextView(): JSX.Element {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSave = async (): Promise<void> => {
    setError(null);
    setIsSaving(true);
    try {
      // TODO: Implement actual IPC call to save CLAUDE.md
      // await window.electronAPI.storage.saveClaudeMd(content);
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

  const handleGenerate = async (): Promise<void> => {
    setIsGenerating(true);
    try {
      // TODO: Implement AI generation in Phase 7
      console.log('Generate with AI placeholder');
      // Simulate delay for placeholder
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      setIsGenerating(false);
    }
  };

  const formatTimestamp = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Project Context</h2>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500"
          title="Generate with AI (coming in Phase 7)"
        >
          <svg
            className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          {isGenerating ? 'Generating...' : 'Generate with AI'}
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
      <div className="flex-1 min-h-0">
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
          className="w-full h-full px-4 py-3 font-mono text-sm bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
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
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
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
    </div>
  );
}
