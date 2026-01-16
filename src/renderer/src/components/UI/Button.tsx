import React, { forwardRef } from 'react';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Show loading spinner */
  loading?: boolean;
  /** Icon displayed before text */
  leftIcon?: React.ReactNode;
  /** Icon displayed after text */
  rightIcon?: React.ReactNode;
  /** Make button full width */
  fullWidth?: boolean;
}

/**
 * Button component with synthwave styling.
 *
 * Supports multiple variants and sizes, with optional loading state and icons.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const classes = [
      'ui-button',
      `ui-button--${variant}`,
      `ui-button--${size}`,
      loading && 'ui-button--loading',
      fullWidth && 'ui-button--full-width',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <span className="ui-button__spinner" />}
        {leftIcon && <span className="ui-button__icon">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="ui-button__icon">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
