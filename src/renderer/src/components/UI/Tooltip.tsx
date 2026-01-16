import React, { useState, useRef, useCallback, cloneElement } from 'react';
import './Tooltip.css';

interface TriggerProps {
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
}

export interface TooltipProps {
  /** Tooltip content */
  content: React.ReactNode;
  /** Trigger element (must accept ref) */
  children: React.ReactElement<TriggerProps>;
  /** Tooltip position */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay before showing (ms) */
  delay?: number;
  /** Allow multiline content */
  multiline?: boolean;
  /** Additional class name for tooltip content */
  className?: string;
}

/**
 * Tooltip component for hover hints.
 *
 * Wraps a trigger element and shows tooltip on hover.
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 200,
  multiline = false,
  className = '',
}) => {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  }, [delay]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setVisible(false);
  }, []);

  // Handle keyboard accessibility
  const handleFocus = useCallback(() => {
    showTooltip();
  }, [showTooltip]);

  const handleBlur = useCallback(() => {
    hideTooltip();
  }, [hideTooltip]);

  // Clone child with event handlers
  const trigger = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      showTooltip();
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hideTooltip();
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      handleFocus();
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      handleBlur();
      children.props.onBlur?.(e);
    },
  });

  const contentClasses = [
    'ui-tooltip__content',
    `ui-tooltip__content--${position}`,
    visible && 'ui-tooltip__content--visible',
    multiline && 'ui-tooltip__content--multiline',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className="ui-tooltip">
      {trigger}
      <span className={contentClasses} role="tooltip" aria-hidden={!visible}>
        {content}
        <span className="ui-tooltip__arrow" />
      </span>
    </span>
  );
};

Tooltip.displayName = 'Tooltip';
