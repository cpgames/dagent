import { useState, useEffect } from 'react'
import type { JSX } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '../UI/Dialog'
import { Input } from '../UI/Input'
import { RadioGroup, Radio } from '../UI/Radio'
import { Button } from '../UI/Button'
import { useGitStore } from '../../stores'

interface PublishToGitHubDialogProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * GitHub icon for input
 */
function GitHubIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

/**
 * Check icon for success state
 */
function CheckIcon({ className, style }: { className?: string; style?: React.CSSProperties }): JSX.Element {
  return (
    <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

/**
 * External link icon
 */
function ExternalLinkIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  )
}

/**
 * Dialog for publishing a local git repository to GitHub.
 * Uses the gh CLI to create a new repo and push.
 */
export function PublishToGitHubDialog({
  isOpen,
  onClose
}: PublishToGitHubDialogProps): JSX.Element {
  const { isPublishing, publishToGitHub, currentBranch } = useGitStore()
  const [repoName, setRepoName] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [error, setError] = useState<string | null>(null)
  const [successUrl, setSuccessUrl] = useState<string | null>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setError(null)
      setSuccessUrl(null)
      // Try to get default repo name from project path
      window.electronAPI.project.getCurrent().then((path) => {
        if (path) {
          const folderName = path.split(/[/\\]/).pop() || ''
          setRepoName(folderName)
        }
      })
    }
  }, [isOpen])

  const handlePublish = async (): Promise<void> => {
    if (!repoName.trim()) {
      setError('Repository name is required')
      return
    }

    setError(null)
    const result = await publishToGitHub(repoName.trim(), visibility)

    if (result.success) {
      setSuccessUrl(result.repoUrl || null)
    } else {
      setError(result.error || 'Failed to publish to GitHub')
    }
  }

  const handleClose = (): void => {
    if (!isPublishing) {
      onClose()
    }
  }

  const openRepoInBrowser = (): void => {
    if (successUrl) {
      window.open(successUrl, '_blank')
    }
  }

  return (
    <Dialog open={isOpen} onClose={handleClose} size="sm">
      <DialogHeader
        title="Publish to GitHub"
        description="Create a new GitHub repository and push your code."
      />

      <DialogBody>
        {successUrl ? (
          <div className="space-y-4">
            <div
              className="flex items-center gap-3 p-4 rounded-lg"
              style={{
                backgroundColor: 'var(--color-success-surface)',
                border: '1px solid var(--color-success)'
              }}
            >
              <CheckIcon
                className="w-6 h-6 flex-shrink-0"
                style={{ color: 'var(--color-success)' }}
              />
              <div>
                <p className="font-medium" style={{ color: 'var(--color-success)' }}>
                  Repository published successfully!
                </p>
                <p
                  className="text-sm mt-1 break-all"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {successUrl}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Repository name input */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Repository Name
              </label>
              <Input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="my-project"
                disabled={isPublishing}
                leftIcon={<GitHubIcon className="w-4 h-4" />}
                error={!!error && !repoName.trim()}
                errorMessage={!repoName.trim() ? error || undefined : undefined}
              />
            </div>

            {/* Visibility selection */}
            <div>
              <label
                className="block text-sm font-medium mb-3"
                style={{ color: 'var(--text-primary)' }}
              >
                Visibility
              </label>
              <RadioGroup
                name="visibility"
                value={visibility}
                onChange={(val) => setVisibility(val as 'public' | 'private')}
                orientation="horizontal"
                disabled={isPublishing}
              >
                <Radio value="private" label="Private" />
                <Radio value="public" label="Public" />
              </RadioGroup>
            </div>

            {/* Current branch info */}
            {currentBranch && (
              <div
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-md"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)'
                }}
              >
                <span>Will push branch:</span>
                <code
                  className="px-1.5 py-0.5 rounded text-xs font-mono"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--accent-primary)'
                  }}
                >
                  {currentBranch}
                </code>
              </div>
            )}

            {/* Error message */}
            {error && repoName.trim() && (
              <div
                className="p-3 rounded-md text-sm"
                style={{
                  backgroundColor: 'var(--color-error-surface)',
                  border: '1px solid var(--color-error)',
                  color: 'var(--color-error)'
                }}
              >
                {error}
              </div>
            )}

            {/* Requirements note */}
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Requires{' '}
              <a
                href="https://cli.github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: 'var(--accent-primary)' }}
              >
                GitHub CLI (gh)
              </a>{' '}
              to be installed and authenticated.
            </div>
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        {successUrl ? (
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={handleClose}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={openRepoInBrowser}
              rightIcon={<ExternalLinkIcon className="w-4 h-4" />}
            >
              Open in Browser
            </Button>
          </div>
        ) : (
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={handleClose} disabled={isPublishing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handlePublish}
              disabled={isPublishing || !repoName.trim()}
              loading={isPublishing}
              leftIcon={<GitHubIcon className="w-4 h-4" />}
            >
              {isPublishing ? 'Publishing...' : 'Publish'}
            </Button>
          </div>
        )}
      </DialogFooter>
    </Dialog>
  )
}
