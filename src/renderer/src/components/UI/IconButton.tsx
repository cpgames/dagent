import React, { forwardRef } from 'react';
import './Button.css';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Accessible label (required for icon-only buttons) */
  label: string;
  /** The icon element */
  children: React.ReactNode;
}

/**
 * Square icon button component for icon-only actions.
 *
 * Requires a label prop for accessibility (renders as aria-label).
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = 'ghost',
      size = 'md',
      label,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const classes = [
      'ui-icon-button',
      `ui-icon-button--${variant}`,
      `ui-icon-button--${size}`,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        className={classes}
        aria-label={label}
        title={label}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
