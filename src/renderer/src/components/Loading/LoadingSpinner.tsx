import type { JSX } from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export default function LoadingSpinner({
  size = 'md',
  message
}: LoadingSpinnerProps): JSX.Element {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${sizeClasses[size]} border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin`}
      />
      {message && <span className="text-gray-400 text-sm">{message}</span>}
    </div>
  );
}

// Full-screen loading overlay
export function LoadingOverlay({ message }: { message?: string }): JSX.Element {
  return (
    <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-50">
      <LoadingSpinner size="lg" message={message} />
    </div>
  );
}
