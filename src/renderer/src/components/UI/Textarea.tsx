import React, { forwardRef, useEffect, useRef, useCallback } from 'react';
import './Textarea.css';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Textarea size */
  size?: 'sm' | 'md' | 'lg';
  /** Show error state */
  error?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Auto-resize based on content */
  autoResize?: boolean;
  /** Minimum number of rows */
  minRows?: number;
  /** Maximum number of rows */
  maxRows?: number;
  /** Show character count */
  showCount?: boolean;
}

/**
 * Textarea component with synthwave styling.
 *
 * Supports auto-resize, character count, and error states.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      size = 'md',
      error = false,
      errorMessage,
      autoResize = false,
      minRows = 3,
      maxRows = 10,
      showCount = false,
      maxLength,
      value,
      defaultValue,
      className = '',
      onChange,
      ...props
    },
    ref
  ) => {
    const internalRef = useRef<HTMLTextAreaElement | null>(null);
    const currentValue = value ?? defaultValue ?? '';
    const charCount = String(currentValue).length;

    // Combine refs
    const setRefs = useCallback(
      (element: HTMLTextAreaElement | null) => {
        internalRef.current = element;
        if (typeof ref === 'function') {
          ref(element);
        } else if (ref) {
          ref.current = element;
        }
      },
      [ref]
    );

    // Auto-resize logic
    const adjustHeight = useCallback(() => {
      const textarea = internalRef.current;
      if (!textarea || !autoResize) return;

      // Reset height to get accurate scrollHeight
      textarea.style.height = 'auto';

      // Calculate line height based on size
      const lineHeight = size === 'sm' ? 18 : size === 'lg' ? 24 : 21;
      const padding = size === 'sm' ? 16 : size === 'lg' ? 32 : 24;

      const minHeight = minRows * lineHeight + padding;
      const maxHeight = maxRows * lineHeight + padding;

      const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;

      // Show scrollbar if content exceeds max height
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [autoResize, minRows, maxRows, size]);

    // Adjust height on value change
    useEffect(() => {
      adjustHeight();
    }, [currentValue, adjustHeight]);

    // Adjust height on mount
    useEffect(() => {
      if (autoResize) {
        adjustHeight();
      }
    }, [autoResize, adjustHeight]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
      onChange?.(e);
      if (autoResize) {
        adjustHeight();
      }
    };

    const textareaClasses = [
      'ui-textarea',
      `ui-textarea--${size}`,
      error && 'ui-textarea--error',
      autoResize && 'ui-textarea--auto-resize',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    // Character count state
    const countState =
      maxLength && charCount >= maxLength
        ? 'error'
        : maxLength && charCount >= maxLength * 0.9
          ? 'warning'
          : 'normal';

    return (
      <div className="ui-textarea-wrapper">
        <textarea
          ref={setRefs}
          className={textareaClasses}
          aria-invalid={error}
          rows={minRows}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          {...props}
        />
        {(error && errorMessage) || showCount ? (
          <div className="ui-textarea__footer">
            {error && errorMessage && (
              <span className="ui-textarea__error" role="alert">
                {errorMessage}
              </span>
            )}
            {showCount && (
              <span
                className={`ui-textarea__count ${
                  countState === 'error'
                    ? 'ui-textarea__count--error'
                    : countState === 'warning'
                      ? 'ui-textarea__count--warning'
                      : ''
                }`}
              >
                {charCount}
                {maxLength && ` / ${maxLength}`}
              </span>
            )}
          </div>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
