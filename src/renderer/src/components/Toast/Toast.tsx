import type { JSX } from 'react';
import { useToastStore, type Toast as ToastType, type ToastType as TType } from '../../stores/toast-store';

const typeStyles: Record<TType, string> = {
  success: 'bg-green-600 border-green-500',
  error: 'bg-red-600 border-red-500',
  warning: 'bg-yellow-600 border-yellow-500',
  info: 'bg-blue-600 border-blue-500'
};

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
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-white ${typeStyles[toast.type]}`}
      role="alert"
    >
      <span className="text-lg">{typeIcons[toast.type]}</span>
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className="text-white/70 hover:text-white"
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
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
