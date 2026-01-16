import React, { forwardRef } from 'react';
import './Badge.css';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color variant */
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  /** Badge size */
  size?: 'sm' | 'md';
  /** Show dot indicator before text */
  dot?: boolean;
  /** Icon displayed before text */
  icon?: React.ReactNode;
}

/**
 * Badge component for status indicators.
 *
 * Supports multiple semantic color variants and an optional dot indicator.
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'default',
      size = 'md',
      dot = false,
      icon,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const classes = [
      'ui-badge',
      `ui-badge--${variant}`,
      `ui-badge--${size}`,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <span ref={ref} className={classes} {...props}>
        {dot && <span className="ui-badge__dot" />}
        {icon && <span className="ui-badge__icon">{icon}</span>}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
