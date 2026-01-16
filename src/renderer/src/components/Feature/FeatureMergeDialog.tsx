import type { JSX } from 'react'
import { useState, useEffect, useCallback } from 'react'
import type { Feature } from '@shared/types'
import type { MergeType } from '../Kanban'
import {
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Button,
  Input,
  Textarea,
  Checkbox,
  Select,
  type SelectOption
} from '../UI'
import './FeatureMergeDialog.css'

// Local type matching git manager BranchInfo
interface BranchInfo {
  name: string
  current: boolean
  commit: string
  label: string
}

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

  // Branch selection state
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [targetBranch, setTargetBranch] = useState<string>('')
  const [loadingBranches, setLoadingBranches] = useState(false)

  // PR form state
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')

  // Load branches when dialog opens
  useEffect(() => {
    if (isOpen && feature) {
      setLoadingBranches(true)
      Promise.all([
        window.electronAPI.git.listBranches(),
        window.electronAPI.git.getCurrentBranch()
      ])
        .then(([branchList, currentBranch]) => {
          // Filter out feature branches (only show main/master and other non-feature branches)
          const filteredBranches = branchList.filter(
            (b) => !b.name.startsWith('feature/') && b.name !== feature.branchName
          )
          setBranches(filteredBranches)

          // Default to current branch, or first available branch
          if (currentBranch && filteredBranches.some((b) => b.name === currentBranch)) {
            setTargetBranch(currentBranch)
          } else if (filteredBranches.length > 0) {
            // Prefer main/master
            const defaultBranch = filteredBranches.find((b) => b.name === 'main' || b.name === 'master')
            setTargetBranch(defaultBranch?.name || filteredBranches[0].name)
          }
        })
        .catch((err) => {
          console.error('Failed to load branches:', err)
        })
        .finally(() => {
          setLoadingBranches(false)
        })
    }
  }, [isOpen, feature])

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen && feature) {
      setStatus('idle')
      setError(null)
      setPrUrl(null)
      setPrTitle(`Merge feature: ${feature.name}`)
      setPrBody(`## Summary
Merge completed feature "${feature.name}" into main branch.

## Changes
- Feature implementation`)
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
    if (!feature || !targetBranch) return

    try {
      setStatus('initializing')
      setError(null)

      // Create and initialize agent with selected target branch
      const createResult = await window.electronAPI.featureMerge.create(feature.id, targetBranch)
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

      // Create PR using branch name from feature record
      const result = await window.electronAPI.pr.create({
        title: prTitle,
        body: prBody,
        head: feature.branchName,
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

  if (!feature) return null

  const isProcessing = status === 'initializing' || status === 'checking' || status === 'merging' || status === 'creating-pr'
  const showPRForm = mergeType === 'pr' && status === 'idle'
  const showMergeOptions = mergeType === 'ai' && status === 'idle'

  // Convert branches to Select options
  const branchOptions: SelectOption[] = branches.map((branch) => ({
    value: branch.name,
    label: `${branch.name}${branch.current ? ' (current)' : ''}`
  }))

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      size="md"
      closeOnBackdrop={!isProcessing}
      closeOnEscape={!isProcessing}
    >
      <DialogHeader title={mergeType === 'ai' ? 'AI Merge' : 'Create Pull Request'} />

      <DialogBody>
        {/* Feature info */}
        <div className="merge-dialog__feature-info">
          <p className="merge-dialog__feature-name">
            Feature: <span className="merge-dialog__feature-name-value">{feature.name}</span>
          </p>
          <p className="merge-dialog__branch-info">
            Branch: {feature.branchName} &rarr; {targetBranch || 'loading...'}
          </p>
        </div>

        {/* AI Merge Options */}
        {showMergeOptions && (
          <div className="merge-dialog__options">
            {/* Target branch selection */}
            <div className="merge-dialog__field">
              <label className="merge-dialog__label">Target Branch</label>
              {loadingBranches ? (
                <div className="merge-dialog__loading">
                  <svg className="merge-dialog__loading-spinner" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading branches...
                </div>
              ) : (
                <Select
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value)}
                  options={branchOptions}
                />
              )}
            </div>

            {/* Delete branch checkbox */}
            <Checkbox
              checked={deleteBranch}
              onChange={(e) => setDeleteBranch(e.target.checked)}
              label="Delete feature branch after merge"
            />
          </div>
        )}

        {/* PR Form */}
        {showPRForm && (
          <div className="merge-dialog__pr-form">
            <div className="merge-dialog__field">
              <label className="merge-dialog__label">PR Title</label>
              <Input
                type="text"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
              />
            </div>
            <div className="merge-dialog__field">
              <label className="merge-dialog__label">Description</label>
              <Textarea
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                minRows={4}
              />
            </div>
          </div>
        )}

        {/* Status/Progress */}
        {isProcessing && (
          <div className="merge-dialog__status merge-dialog__status--processing">
            <div className="merge-dialog__status-content">
              <svg className="merge-dialog__loading-spinner" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="merge-dialog__status-text merge-dialog__status-text--processing">
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
          <div className="merge-dialog__status merge-dialog__status--success">
            <p className="merge-dialog__status-text merge-dialog__status-text--success">
              {mergeType === 'ai' ? 'Merge completed successfully!' : 'Pull request created!'}
            </p>
            {prUrl && (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="merge-dialog__pr-link"
              >
                View PR: {prUrl}
              </a>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="merge-dialog__status merge-dialog__status--error">
            <p className="merge-dialog__status-text merge-dialog__status-text--error">{error}</p>
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        <Button
          variant="secondary"
          onClick={handleClose}
          disabled={isProcessing}
        >
          {status === 'completed' ? 'Close' : 'Cancel'}
        </Button>
        {status === 'idle' && (
          <Button
            variant="primary"
            onClick={mergeType === 'ai' ? handleAIMerge : handleCreatePR}
          >
            {mergeType === 'ai' ? 'Start Merge' : 'Create PR'}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  )
}
