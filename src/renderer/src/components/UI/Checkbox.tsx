import React, { forwardRef } from 'react';
import './Checkbox.css';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Checkbox size */
  size?: 'sm' | 'md' | 'lg';
  /** Optional label text */
  label?: string;
  /** Show error state */
  error?: boolean;
  /** Indeterminate state (partially checked) */
  indeterminate?: boolean;
}

/**
 * Checkbox component with synthwave styling.
 *
 * Features square box with cyan fill when checked and white checkmark.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      size = 'md',
      label,
      error = false,
      indeterminate = false,
      disabled = false,
      className = '',
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    // Handle indeterminate state
    React.useEffect(() => {
      if (inputRef.current) {
        inputRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    // Combine refs
    const setRefs = React.useCallback(
      (element: HTMLInputElement | null) => {
        inputRef.current = element;
        if (typeof ref === 'function') {
          ref(element);
        } else if (ref) {
          ref.current = element;
        }
      },
      [ref]
    );

    const wrapperClasses = [
      'ui-checkbox',
      `ui-checkbox--${size}`,
      disabled && 'ui-checkbox--disabled',
      error && 'ui-checkbox--error',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <label className={wrapperClasses}>
        <input
          ref={setRefs}
          type="checkbox"
          className="ui-checkbox__input"
          disabled={disabled}
          {...props}
        />
        <span className="ui-checkbox__box">
          {indeterminate ? (
            <svg
              className="ui-checkbox__icon"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x="2" y="5" width="8" height="2" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg
              className="ui-checkbox__icon"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2 6L5 9L10 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        {label && <span className="ui-checkbox__label">{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
