import React, { forwardRef } from 'react';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Select size */
  size?: 'sm' | 'md' | 'lg';
  /** Options to display */
  options: SelectOption[];
  /** Placeholder text (shows as first disabled option) */
  placeholder?: string;
  /** Show error state */
  error?: boolean;
  /** Error message to display */
  errorMessage?: string;
}

/**
 * Select dropdown component with synthwave styling.
 *
 * Uses native select element for accessibility with custom styling.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      size = 'md',
      options,
      placeholder,
      error = false,
      errorMessage,
      disabled = false,
      className = '',
      ...props
    },
    ref
  ) => {
    const selectClasses = [
      'ui-select',
      `ui-select--${size}`,
      error && 'ui-select--error',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="ui-select-wrapper">
        <div className="ui-select-container">
          <select
            ref={ref}
            className={selectClasses}
            disabled={disabled}
            aria-invalid={error}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          <svg
            className="ui-select__icon"
            viewBox="0 0 20 20"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        {error && errorMessage && (
          <span className="ui-select__error" role="alert">
            {errorMessage}
          </span>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
