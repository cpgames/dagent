import type { JSX } from 'react';
import { useToastStore, type Toast as ToastType, type ToastType as TType } from '../../stores/toast-store';
import './Toast.css';

const typeIcons: Record<TType, string> = {
  success: '\u2713',
  error: '\u2715',
  warning: '\u26A0',
  info: '\u2139'
};

function ToastItem({ toast }: { toast: ToastType }): JSX.Element {
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <div
      className={`toast toast--${toast.type}`}
      role="alert"
    >
      <span className="toast__icon">{typeIcons[toast.type]}</span>
      <span className="toast__message">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className="toast__dismiss"
        aria-label="Dismiss"
      >
        {'\u2715'}
      </button>
    </div>
  );
}

export default function ToastContainer(): JSX.Element {
  const toasts = useToastStore((state) => state.toasts);

  if (toasts.length === 0) return <></>;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
