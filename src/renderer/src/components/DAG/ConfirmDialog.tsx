import type { JSX } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter, Button } from '../UI'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

/**
 * ConfirmDialog - Simple confirmation dialog for destructive actions
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element | null {
  if (!open) return null

  return (
    <Dialog open={open} onClose={onCancel} size="sm">
      <DialogHeader title={title} />
      <DialogBody>
        <p className="confirm-dialog__message">{message}</p>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={variant}
          onClick={() => {
            onConfirm()
            onCancel()
          }}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
