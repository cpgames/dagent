import React, { useEffect, useRef, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import './Dialog.css';

export interface DialogProps {
  /** Whether dialog is open */
  open: boolean;
  /** Called when dialog should close */
  onClose: () => void;
  /** Dialog width */
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** Close when clicking backdrop */
  closeOnBackdrop?: boolean;
  /** Close when pressing Escape */
  closeOnEscape?: boolean;
  /** Dialog content */
  children: React.ReactNode;
  /** Additional class name for dialog panel */
  className?: string;
}

/**
 * Dialog (modal) component with backdrop blur.
 *
 * Renders via Portal, traps focus, supports Escape to close.
 */
export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
  children,
  className = '',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  // Handle Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  // Focus trap
  useEffect(() => {
    if (!open) return;

    // Store currently focused element
    previousActiveElement.current = document.activeElement;

    // Focus the dialog
    const dialog = dialogRef.current;
    if (dialog) {
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        dialog.focus();
      }
    }

    // Handle tab key for focus trap
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialog) return;

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleTab);

    // Prevent body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', handleTab);
      document.body.style.overflow = originalOverflow;

      // Restore focus
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const dialogContent = (
    <div
      className="ui-dialog-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={`ui-dialog ui-dialog--${size} ${className}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <button
          type="button"
          className="ui-dialog__close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <svg
            className="ui-dialog__close-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};

Dialog.displayName = 'Dialog';

/* Compound components */
export interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Dialog title */
  title?: string;
  /** Optional description below title */
  description?: string;
}

export const DialogHeader = forwardRef<HTMLDivElement, DialogHeaderProps>(
  ({ title, description, className = '', children, ...props }, ref) => (
    <div ref={ref} className={`ui-dialog__header ${className}`} {...props}>
      {title && <h2 className="ui-dialog__title">{title}</h2>}
      {description && <p className="ui-dialog__description">{description}</p>}
      {children}
    </div>
  )
);

DialogHeader.displayName = 'DialogHeader';

export interface DialogBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

export const DialogBody = forwardRef<HTMLDivElement, DialogBodyProps>(
  ({ className = '', children, ...props }, ref) => (
    <div ref={ref} className={`ui-dialog__body ${className}`} {...props}>
      {children}
    </div>
  )
);

DialogBody.displayName = 'DialogBody';

export interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export const DialogFooter = forwardRef<HTMLDivElement, DialogFooterProps>(
  ({ className = '', children, ...props }, ref) => (
    <div ref={ref} className={`ui-dialog__footer ${className}`} {...props}>
      {children}
    </div>
  )
);

DialogFooter.displayName = 'DialogFooter';
