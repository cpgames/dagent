import { useState, type JSX } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter, Button, Textarea } from '../UI'

interface ReanalyzeDialogProps {
  open: boolean
  taskTitle: string
  onConfirm: (comment: string) => void
  onCancel: () => void
}

/**
 * ReanalyzeDialog - Dialog for providing optional context when reanalyzing a task.
 * Allows user to add a comment that will be sent to the investigation agent.
 */
export default function ReanalyzeDialog({
  open,
  taskTitle,
  onConfirm,
  onCancel
}: ReanalyzeDialogProps): JSX.Element | null {
  const [comment, setComment] = useState('')

  if (!open) return null

  const handleConfirm = () => {
    onConfirm(comment)
    setComment('') // Reset for next use
  }

  const handleCancel = () => {
    setComment('') // Reset for next use
    onCancel()
  }

  return (
    <Dialog open={open} onClose={handleCancel} size="md">
      <DialogHeader title={`Reanalyze: ${taskTitle}`} />
      <DialogBody>
        <p style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>
          Add optional context or instructions for the investigation agent.
        </p>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="e.g., Focus on error handling, split into smaller tasks, add more detail about the API integration..."
          rows={4}
          style={{ width: '100%' }}
        />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleConfirm}
        >
          Reanalyze
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
