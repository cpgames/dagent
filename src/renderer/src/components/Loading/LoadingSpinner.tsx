import type { JSX } from 'react';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export default function LoadingSpinner({
  size = 'md',
  message
}: LoadingSpinnerProps): JSX.Element {
  return (
    <div className="loading-spinner">
      <div className={`loading-spinner__spinner loading-spinner__spinner--${size}`} />
      {message && <span className="loading-spinner__message">{message}</span>}
    </div>
  );
}

// Full-screen loading overlay
export function LoadingOverlay({ message }: { message?: string }): JSX.Element {
  return (
    <div className="loading-overlay">
      <LoadingSpinner size="lg" message={message} />
    </div>
  );
}
