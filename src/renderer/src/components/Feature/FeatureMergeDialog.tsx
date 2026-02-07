import type { JSX } from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
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

interface LogEntry {
  timestamp: string
  type: 'message' | 'tool_use' | 'tool_result' | 'error' | 'info'
  content: string
  toolName?: string
}

interface FeatureMergeDialogProps {
  isOpen: boolean
  onClose: () => void
  feature: Feature | null
  mergeType: MergeType | null
}

type MergeStatus = 'idle' | 'initializing' | 'checking' | 'merging' | 'creating-pr' | 'completed' | 'failed' | 'uncommitted-changes'

export function FeatureMergeDialog({
  isOpen,
  onClose,
  feature,
  mergeType
}: FeatureMergeDialogProps): JSX.Element | null {
  const [status, setStatus] = useState<MergeStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)

  // Branch selection state
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [targetBranch, setTargetBranch] = useState<string>('')
  const [loadingBranches, setLoadingBranches] = useState(false)

  // PR form state
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [generatingSummary, setGeneratingSummary] = useState(false)

  // Log panel state
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Uncommitted changes handling
  const [handlingChanges, setHandlingChanges] = useState(false)

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logEntries, streamingContent])

  // Subscribe to merge streaming events
  useEffect(() => {
    if (!isOpen || !feature) return

    const unsubscribe = window.electronAPI.featureMerge.onStream((data) => {
      if (data.featureId !== feature.id) return

      const event = data.event
      const timestamp = new Date().toLocaleTimeString()

      if (event.type === 'message' && event.message) {
        if (event.message.type === 'assistant') {
          // Accumulate streaming content
          setStreamingContent((prev) => prev + event.message!.content)
        } else if (event.message.type === 'result') {
          // Tool result - add as log entry
          setLogEntries((prev) => [...prev, {
            timestamp,
            type: 'tool_result',
            content: event.message!.content.slice(0, 200) + (event.message!.content.length > 200 ? '...' : ''),
            toolName: event.message!.toolName
          }])
        }
      } else if (event.type === 'tool_use') {
        // Flush streaming content as a message
        setStreamingContent((prev) => {
          if (prev.trim()) {
            setLogEntries((entries) => [...entries, {
              timestamp,
              type: 'message',
              content: prev.trim()
            }])
          }
          return ''
        })

        // Add tool use entry
        if (event.message?.toolName) {
          setLogEntries((prev) => [...prev, {
            timestamp,
            type: 'tool_use',
            content: `Using ${event.message!.toolName}`,
            toolName: event.message!.toolName
          }])
        }
      } else if (event.type === 'error') {
        setLogEntries((prev) => [...prev, {
          timestamp,
          type: 'error',
          content: event.error || 'Unknown error'
        }])
      } else if (event.type === 'done') {
        // Flush any remaining streaming content
        setStreamingContent((prev) => {
          if (prev.trim()) {
            setLogEntries((entries) => [...entries, {
              timestamp,
              type: 'message',
              content: prev.trim()
            }])
          }
          return ''
        })
      }
    })

    return () => unsubscribe()
  }, [isOpen, feature])

  // Load branches when dialog opens
  useEffect(() => {
    if (isOpen && feature) {
      setLoadingBranches(true)
      Promise.all([
        window.electronAPI.git.listBranches(),
        window.electronAPI.git.getCurrentBranch()
      ])
        .then(([branchList, currentBranch]) => {
          // Filter out feature branches and dagent/* pool branches
          const filteredBranches = branchList.filter(
            (b) => !b.name.startsWith('feature/') &&
                   !b.name.startsWith('dagent/') &&
                   b.name !== feature.branch
          )
          setBranches(filteredBranches)

          // Default to current branch from status bar
          if (currentBranch && filteredBranches.some((b) => b.name === currentBranch)) {
            setTargetBranch(currentBranch)
          } else if (filteredBranches.length > 0) {
            setTargetBranch(filteredBranches[0].name)
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
      setLogEntries([])
      setStreamingContent('')

      // For PR creation, generate summary from feature spec using AI
      if (mergeType === 'pr') {
        // Set defaults while generating
        setPrTitle(`feat: ${feature.name}`)
        setPrBody('Generating summary...')
        setGeneratingSummary(true)

        window.electronAPI.pr.generateSummary(feature.id)
          .then((result) => {
            if (result.success) {
              setPrTitle(result.title || `feat: ${feature.name}`)
              setPrBody(result.body || '')
            } else {
              // Fallback to simple summary on error
              setPrTitle(`feat: ${feature.name}`)
              setPrBody(`## Summary\n${feature.name}`)
              console.error('Failed to generate PR summary:', result.error)
            }
          })
          .catch((err) => {
            console.error('Failed to generate PR summary:', err)
            setPrTitle(`feat: ${feature.name}`)
            setPrBody(`## Summary\n${feature.name}`)
          })
          .finally(() => {
            setGeneratingSummary(false)
          })
      } else {
        setPrTitle(`feat: ${feature.name}`)
        setPrBody('')
      }
    }
  }, [isOpen, feature, mergeType])

  // Cleanup on close
  const handleClose = useCallback(async () => {
    if (feature && status !== 'merging' && status !== 'creating-pr') {
      await window.electronAPI.featureMerge.cleanup(feature.id)
    }
    onClose()
  }, [feature, status, onClose])

  // Add info log entry
  const addInfoLog = (content: string) => {
    setLogEntries((prev) => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      content
    }])
  }

  // AI Merge flow
  const handleAIMerge = async () => {
    if (!feature || !targetBranch) return

    try {
      setStatus('initializing')
      setError(null)
      setLogEntries([])
      setStreamingContent('')
      addInfoLog('Initializing merge agent...')

      // Create and initialize agent with selected target branch
      const createResult = await window.electronAPI.featureMerge.create(feature.id, targetBranch)
      if (!createResult.success) {
        throw new Error(createResult.state?.error || 'Failed to initialize merge agent')
      }
      addInfoLog('Merge agent initialized')

      // Check branches
      setStatus('checking')
      addInfoLog('Checking branches...')
      const checkResult = await window.electronAPI.featureMerge.checkBranches(feature.id)
      if (!checkResult.success) {
        throw new Error(checkResult.error || 'Branch check failed')
      }
      addInfoLog('Branches verified')

      // Execute merge
      setStatus('merging')
      addInfoLog('Starting merge...')
      const mergeResult = await window.electronAPI.featureMerge.execute(feature.id)

      if (mergeResult.success && mergeResult.merged) {
        addInfoLog('Merge completed successfully!')
        setStatus('completed')
      } else if (mergeResult.conflicts && mergeResult.conflicts.length > 0) {
        throw new Error(`Failed to resolve conflicts in ${mergeResult.conflicts.length} files.`)
      } else {
        throw new Error(mergeResult.error || 'Merge failed')
      }
    } catch (err) {
      const errorMessage = (err as Error).message
      // Check if error is due to uncommitted changes
      if (errorMessage.includes('uncommitted changes')) {
        setStatus('uncommitted-changes')
        setError(errorMessage)
        addInfoLog('Working directory has uncommitted changes')
      } else {
        setStatus('failed')
        setError(errorMessage)
        addInfoLog(`Error: ${errorMessage}`)
      }
    }
  }

  // Handle uncommitted changes - stash and retry
  const handleStashAndRetry = async () => {
    if (!feature) return
    setHandlingChanges(true)
    addInfoLog('Stashing changes...')
    try {
      const result = await window.electronAPI.git.stash('Pre-merge stash')
      if (!result.success) {
        throw new Error(result.error || 'Failed to stash changes')
      }
      addInfoLog('Changes stashed successfully')
      setError(null)
      // Retry merge
      await handleAIMerge()
    } catch (err) {
      setError((err as Error).message)
      addInfoLog(`Error: ${(err as Error).message}`)
    } finally {
      setHandlingChanges(false)
    }
  }

  // Handle uncommitted changes - discard and retry
  const handleDiscardAndRetry = async () => {
    if (!feature) return
    setHandlingChanges(true)
    addInfoLog('Discarding changes...')
    try {
      const result = await window.electronAPI.git.discardChanges()
      if (!result.success) {
        throw new Error(result.error || 'Failed to discard changes')
      }
      addInfoLog('Changes discarded')
      setError(null)
      // Retry merge
      await handleAIMerge()
    } catch (err) {
      setError((err as Error).message)
      addInfoLog(`Error: ${(err as Error).message}`)
    } finally {
      setHandlingChanges(false)
    }
  }

  // Handle uncommitted changes - abort
  const handleAbortMerge = () => {
    setStatus('idle')
    setError(null)
    setLogEntries([])
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

      // Create PR using branch name from feature record or worktree pool
      // Branch naming: feature.branch (explicit) > dagent/{worktreeId} (pool-based)
      const branchName = feature.branch || (feature.worktreeId ? `dagent/${feature.worktreeId}` : null)
      if (!branchName) {
        throw new Error('Feature has no branch assigned. Ensure the feature has an active worktree.')
      }

      const result = await window.electronAPI.pr.create({
        title: prTitle,
        body: prBody,
        head: branchName,
        base: targetBranch,
        featureId: feature.id
      })

      if (result.success && result.prUrl) {
        setStatus('completed')
        const url = result.htmlUrl || result.prUrl
        setPrUrl(url)
      } else {
        throw new Error(result.error || 'Failed to create PR')
      }
    } catch (err) {
      setStatus('failed')
      setError((err as Error).message)
    }
  }

  if (!feature) return null

  const isProcessing = status === 'initializing' || status === 'checking' || status === 'merging' || status === 'creating-pr' || handlingChanges
  const showPRForm = mergeType === 'pr' && status === 'idle'
  const showMergeOptions = mergeType === 'ai' && status === 'idle'
  const showLogPanel = mergeType === 'ai' && (isProcessing || status === 'completed' || status === 'failed' || status === 'uncommitted-changes')
  const showUncommittedOptions = status === 'uncommitted-changes' && !handlingChanges

  // Convert branches to Select options
  const branchOptions: SelectOption[] = branches.map((branch) => ({
    value: branch.name,
    label: `${branch.name}${branch.current ? ' (current)' : ''}`
  }))

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      size="lg"
      closeOnBackdrop={false}
      closeOnEscape={!isProcessing}
      className="merge-dialog"
    >
      <DialogHeader title={mergeType === 'ai' ? 'AI Merge' : 'Create Pull Request'} />

      <DialogBody className="merge-dialog__body">
        {/* Feature info */}
        <div className="merge-dialog__feature-info">
          <p className="merge-dialog__feature-name">
            Feature: <span className="merge-dialog__feature-name-value">{feature.name}</span>
          </p>
          <p className="merge-dialog__branch-info">
            <span className="merge-dialog__branch-source">{feature.worktreeId ? `dagent/${feature.worktreeId}` : feature.branch || 'unknown'}</span>
            <span className="merge-dialog__branch-arrow">&rarr;</span>
            <span className="merge-dialog__branch-target">{targetBranch || 'loading...'}</span>
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
                disabled={generatingSummary}
              />
            </div>
            <div className="merge-dialog__field">
              <label className="merge-dialog__label">
                Description {generatingSummary && <span className="merge-dialog__generating">(generating from spec...)</span>}
              </label>
              <Textarea
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                minRows={4}
                disabled={generatingSummary}
              />
            </div>
          </div>
        )}

        {/* Log Panel - shown during AI merge */}
        {showLogPanel && (
          <div className="merge-dialog__log-panel">
            <div className="merge-dialog__log-header">
              <span className="merge-dialog__log-title">Agent Activity</span>
              {isProcessing && (
                <svg className="merge-dialog__loading-spinner merge-dialog__log-spinner" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
            </div>
            <div className="merge-dialog__log-entries" ref={logContainerRef}>
              {logEntries.map((entry, index) => (
                <div key={index} className={`merge-dialog__log-entry merge-dialog__log-entry--${entry.type}`}>
                  <span className="merge-dialog__log-timestamp">{entry.timestamp}</span>
                  {entry.toolName && (
                    <span className="merge-dialog__log-tool">{entry.toolName}</span>
                  )}
                  <span className="merge-dialog__log-content">{entry.content}</span>
                </div>
              ))}
              {streamingContent && (
                <div className="merge-dialog__log-entry merge-dialog__log-entry--streaming">
                  <span className="merge-dialog__log-timestamp">{new Date().toLocaleTimeString()}</span>
                  <span className="merge-dialog__log-content">{streamingContent}</span>
                </div>
              )}
              {logEntries.length === 0 && !streamingContent && (
                <div className="merge-dialog__log-empty">Waiting for agent activity...</div>
              )}
            </div>
          </div>
        )}

        {/* Status/Progress - only show for PR or when not showing log */}
        {isProcessing && !showLogPanel && (
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
        {error && !showUncommittedOptions && (
          <div className="merge-dialog__status merge-dialog__status--error">
            <p className="merge-dialog__status-text merge-dialog__status-text--error">{error}</p>
          </div>
        )}

        {/* Uncommitted Changes Options */}
        {showUncommittedOptions && (
          <div className="merge-dialog__uncommitted-panel">
            <div className="merge-dialog__uncommitted-header">
              <svg className="merge-dialog__uncommitted-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Working directory has uncommitted changes</span>
            </div>
            <p className="merge-dialog__uncommitted-text">
              Choose how to handle the changes before merging:
            </p>
            <div className="merge-dialog__uncommitted-options">
              <button
                className="merge-dialog__uncommitted-btn merge-dialog__uncommitted-btn--stash"
                onClick={handleStashAndRetry}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                <div>
                  <div className="merge-dialog__uncommitted-btn-title">Stash Changes</div>
                  <div className="merge-dialog__uncommitted-btn-desc">Save changes and restore after merge</div>
                </div>
              </button>
              <button
                className="merge-dialog__uncommitted-btn merge-dialog__uncommitted-btn--discard"
                onClick={handleDiscardAndRetry}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <div>
                  <div className="merge-dialog__uncommitted-btn-title">Discard Changes</div>
                  <div className="merge-dialog__uncommitted-btn-desc">Delete all uncommitted changes</div>
                </div>
              </button>
              <button
                className="merge-dialog__uncommitted-btn merge-dialog__uncommitted-btn--abort"
                onClick={handleAbortMerge}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <div>
                  <div className="merge-dialog__uncommitted-btn-title">Cancel Merge</div>
                  <div className="merge-dialog__uncommitted-btn-desc">Go back and handle changes manually</div>
                </div>
              </button>
            </div>
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
            disabled={generatingSummary}
          >
            {generatingSummary ? 'Generating...' : mergeType === 'ai' ? 'Start Merge' : 'Create PR'}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  )
}
