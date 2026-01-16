import React, { forwardRef, createContext, useContext } from 'react';
import './Radio.css';

/* ═══════════════════════════════════════════════════════════════════════════
 * RadioGroup Context
 * ═══════════════════════════════════════════════════════════════════════════ */

interface RadioGroupContextValue {
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

/* ═══════════════════════════════════════════════════════════════════════════
 * RadioGroup Component
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface RadioGroupProps {
  /** Name attribute for all radios in group */
  name: string;
  /** Currently selected value (controlled) */
  value?: string;
  /** Default selected value (uncontrolled) */
  defaultValue?: string;
  /** Called when selection changes */
  onChange?: (value: string) => void;
  /** Radio buttons */
  children: React.ReactNode;
  /** Layout orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Disable all radios in group */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
}

/**
 * RadioGroup component that provides context for Radio buttons.
 *
 * Ensures only one radio can be selected at a time within the group.
 */
export function RadioGroup({
  name,
  value,
  defaultValue,
  onChange,
  children,
  orientation = 'vertical',
  disabled = false,
  className = '',
}: RadioGroupProps): React.JSX.Element {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const handleChange = (newValue: string): void => {
    if (!isControlled) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
  };

  const groupClasses = [
    'ui-radio-group',
    `ui-radio-group--${orientation}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <RadioGroupContext.Provider
      value={{
        name,
        value: currentValue,
        onChange: handleChange,
        disabled,
      }}
    >
      <div className={groupClasses} role="radiogroup">
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Radio Component
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Radio size */
  size?: 'sm' | 'md' | 'lg';
  /** Optional label text */
  label?: string;
}

/**
 * Radio component with synthwave styling.
 *
 * Features circular button with cyan inner dot when selected.
 * Use within a RadioGroup for automatic name/value management.
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  (
    {
      size = 'md',
      label,
      value,
      disabled: propDisabled = false,
      className = '',
      onChange,
      ...props
    },
    ref
  ) => {
    const groupContext = useContext(RadioGroupContext);

    // Use group context if available
    const name = groupContext?.name ?? props.name;
    const isChecked = groupContext ? groupContext.value === value : props.checked;
    const disabled = propDisabled || groupContext?.disabled;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
      onChange?.(e);
      if (groupContext && value !== undefined) {
        groupContext.onChange?.(String(value));
      }
    };

    const wrapperClasses = [
      'ui-radio',
      `ui-radio--${size}`,
      disabled && 'ui-radio--disabled',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <label className={wrapperClasses}>
        <input
          ref={ref}
          type="radio"
          className="ui-radio__input"
          name={name}
          value={value}
          checked={isChecked}
          disabled={disabled}
          onChange={handleChange}
          {...props}
        />
        <span className="ui-radio__circle">
          <span className="ui-radio__dot" />
        </span>
        {label && <span className="ui-radio__label">{label}</span>}
      </label>
    );
  }
);

Radio.displayName = 'Radio';
