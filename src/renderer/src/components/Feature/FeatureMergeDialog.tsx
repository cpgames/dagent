import type { JSX } from 'react'
import { useState, useEffect, useCallback } from 'react'
import type { Feature } from '@shared/types'
import type { MergeType } from '../Kanban'

interface FeatureMergeDialogProps {
  isOpen: boolean
  onClose: () => void
  feature: Feature | null
  mergeType: MergeType | null
}

type MergeStatus = 'idle' | 'initializing' | 'checking' | 'merging' | 'creating-pr' | 'completed' | 'failed'

export function FeatureMergeDialog({
  isOpen,
  onClose,
  feature,
  mergeType
}: FeatureMergeDialogProps): JSX.Element | null {
  const [status, setStatus] = useState<MergeStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [deleteBranch, setDeleteBranch] = useState(false)
  const [prUrl, setPrUrl] = useState<string | null>(null)

  // PR form state
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen && feature) {
      setStatus('idle')
      setError(null)
      setPrUrl(null)
      setPrTitle(`Merge feature: ${feature.name}`)
      setPrBody(`## Summary\nMerge completed feature "${feature.name}" into main branch.\n\n## Changes\n- Feature implementation`)
    }
  }, [isOpen, feature])

  // Cleanup on close
  const handleClose = useCallback(async () => {
    if (feature && status !== 'merging' && status !== 'creating-pr') {
      await window.electronAPI.featureMerge.cleanup(feature.id)
    }
    onClose()
  }, [feature, status, onClose])

  // AI Merge flow
  const handleAIMerge = async () => {
    if (!feature) return

    try {
      setStatus('initializing')
      setError(null)

      // Create and initialize agent
      const createResult = await window.electronAPI.featureMerge.create(feature.id, 'main')
      if (!createResult.success) {
        throw new Error(createResult.state?.error || 'Failed to initialize merge agent')
      }

      // Check branches
      setStatus('checking')
      const checkResult = await window.electronAPI.featureMerge.checkBranches(feature.id)
      if (!checkResult.success) {
        throw new Error(checkResult.error || 'Branch check failed')
      }

      // Execute merge
      setStatus('merging')
      const mergeResult = await window.electronAPI.featureMerge.execute(feature.id, deleteBranch)

      if (mergeResult.success && mergeResult.merged) {
        setStatus('completed')
      } else if (mergeResult.conflicts && mergeResult.conflicts.length > 0) {
        throw new Error(`Merge conflicts in ${mergeResult.conflicts.length} files. Please resolve manually.`)
      } else {
        throw new Error(mergeResult.error || 'Merge failed')
      }
    } catch (err) {
      setStatus('failed')
      setError((err as Error).message)
    }
  }

  // Create PR flow
  const handleCreatePR = async () => {
    if (!feature) return

    try {
      setStatus('creating-pr')
      setError(null)

      // Check gh CLI first
      const ghStatus = await window.electronAPI.pr.checkGhCli()
      if (!ghStatus.installed) {
        throw new Error('GitHub CLI (gh) is not installed. Please install it from https://cli.github.com/')
      }
      if (!ghStatus.authenticated) {
        throw new Error('GitHub CLI is not authenticated. Run `gh auth login` to authenticate.')
      }

      // Get feature branch name
      const featureBranch = `feature/${feature.id}/main`

      // Create PR
      const result = await window.electronAPI.pr.create({
        title: prTitle,
        body: prBody,
        head: featureBranch,
        base: 'main'
      })

      if (result.success && result.prUrl) {
        setStatus('completed')
        setPrUrl(result.htmlUrl || result.prUrl)
      } else {
        throw new Error(result.error || 'Failed to create PR')
      }
    } catch (err) {
      setStatus('failed')
      setError((err as Error).message)
    }
  }

  if (!isOpen || !feature) return null

  const isProcessing = status === 'initializing' || status === 'checking' || status === 'merging' || status === 'creating-pr'
  const showPRForm = mergeType === 'pr' && status === 'idle'
  const showMergeOptions = mergeType === 'ai' && status === 'idle'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={isProcessing ? undefined : handleClose} />

      {/* Dialog */}
      <div
        className="relative bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            {mergeType === 'ai' ? 'AI Merge' : 'Create Pull Request'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            className="text-gray-400 hover:text-white focus:outline-none disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Feature info */}
        <div className="mb-4 p-3 bg-gray-700/50 rounded-md">
          <p className="text-sm text-gray-300">
            Feature: <span className="font-medium text-white">{feature.name}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Branch: feature/{feature.id}/main → main
          </p>
        </div>

        {/* AI Merge Options */}
        {showMergeOptions && (
          <div className="mb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteBranch}
                onChange={(e) => setDeleteBranch(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
              />
              <span className="text-sm text-gray-300">Delete feature branch after merge</span>
            </label>
          </div>
        )}

        {/* PR Form */}
        {showPRForm && (
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">PR Title</label>
              <input
                type="text"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
              <textarea
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        )}

        {/* Status/Progress */}
        {isProcessing && (
          <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded-md">
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm text-blue-300">
                {status === 'initializing' && 'Initializing merge agent...'}
                {status === 'checking' && 'Checking branches...'}
                {status === 'merging' && 'Merging branches...'}
                {status === 'creating-pr' && 'Creating pull request...'}
              </span>
            </div>
          </div>
        )}

        {/* Success */}
        {status === 'completed' && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-md">
            <p className="text-sm text-green-300 font-medium">
              {mergeType === 'ai' ? 'Merge completed successfully!' : 'Pull request created!'}
            </p>
            {prUrl && (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 mt-1 block"
              >
                View PR: {prUrl}
              </a>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            {status === 'completed' ? 'Close' : 'Cancel'}
          </button>
          {status === 'idle' && (
            <button
              type="button"
              onClick={mergeType === 'ai' ? handleAIMerge : handleCreatePR}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {mergeType === 'ai' ? 'Start Merge' : 'Create PR'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
