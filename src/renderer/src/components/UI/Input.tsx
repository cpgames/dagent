import React, { forwardRef } from 'react';
import './Input.css';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input size */
  size?: 'sm' | 'md' | 'lg';
  /** Show error state */
  error?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Icon displayed on the left */
  leftIcon?: React.ReactNode;
  /** Icon displayed on the right */
  rightIcon?: React.ReactNode;
  /** Click handler for right icon (makes it clickable) */
  onRightIconClick?: () => void;
}

/**
 * Input component with synthwave styling.
 *
 * Supports multiple sizes, error states, and optional icons.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      size = 'md',
      error = false,
      errorMessage,
      leftIcon,
      rightIcon,
      onRightIconClick,
      className = '',
      ...props
    },
    ref
  ) => {
    const inputClasses = [
      'ui-input',
      `ui-input--${size}`,
      error && 'ui-input--error',
      leftIcon && 'ui-input--with-left-icon',
      rightIcon && 'ui-input--with-right-icon',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const rightIconClasses = [
      'ui-input__icon',
      'ui-input__icon--right',
      onRightIconClick && 'ui-input__icon--clickable',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="ui-input-wrapper">
        <div className="ui-input-container">
          {leftIcon && (
            <span className="ui-input__icon ui-input__icon--left">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            className={inputClasses}
            aria-invalid={error}
            {...props}
          />
          {rightIcon && (
            <span
              className={rightIconClasses}
              onClick={onRightIconClick}
              role={onRightIconClick ? 'button' : undefined}
              tabIndex={onRightIconClick ? 0 : undefined}
              onKeyDown={
                onRightIconClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRightIconClick();
                      }
                    }
                  : undefined
              }
            >
              {rightIcon}
            </span>
          )}
        </div>
        {error && errorMessage && (
          <span className="ui-input__error" role="alert">
            {errorMessage}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
