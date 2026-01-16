import React, { forwardRef } from 'react';
import './Toggle.css';

export interface ToggleProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Toggle size */
  size?: 'sm' | 'md' | 'lg';
  /** Optional label text */
  label?: string;
  /** Label position relative to toggle */
  labelPosition?: 'left' | 'right';
}

/**
 * Toggle (switch) component with synthwave styling.
 *
 * Pill-shaped track with sliding thumb, cyan when on.
 */
export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  (
    {
      size = 'md',
      label,
      labelPosition = 'right',
      disabled = false,
      className = '',
      ...props
    },
    ref
  ) => {
    const wrapperClasses = [
      'ui-toggle',
      `ui-toggle--${size}`,
      `ui-toggle--label-${labelPosition}`,
      disabled && 'ui-toggle--disabled',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <label className={wrapperClasses}>
        <input
          ref={ref}
          type="checkbox"
          className="ui-toggle__input"
          disabled={disabled}
          role="switch"
          {...props}
        />
        <span className="ui-toggle__track">
          <span className="ui-toggle__thumb" />
        </span>
        {label && <span className="ui-toggle__label">{label}</span>}
      </label>
    );
  }
);

Toggle.displayName = 'Toggle';
