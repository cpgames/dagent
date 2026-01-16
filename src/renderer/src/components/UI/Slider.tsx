import React, { forwardRef } from 'react';
import './Slider.css';

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Slider size */
  size?: 'sm' | 'md' | 'lg';
  /** Show current value next to slider */
  showValue?: boolean;
  /** Format the displayed value */
  formatValue?: (value: number) => string;
}

/**
 * Slider (range input) component with synthwave styling.
 *
 * Features gradient track from magenta to cyan with draggable thumb.
 */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      size = 'md',
      showValue = false,
      formatValue,
      disabled = false,
      className = '',
      value,
      defaultValue,
      min = 0,
      max = 100,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState(
      defaultValue !== undefined ? Number(defaultValue) : Number(min)
    );

    const isControlled = value !== undefined;
    const currentValue = isControlled ? Number(value) : internalValue;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
      const newValue = Number(e.target.value);
      if (!isControlled) {
        setInternalValue(newValue);
      }
      props.onChange?.(e);
    };

    const displayValue = formatValue ? formatValue(currentValue) : String(currentValue);

    const sliderClasses = [
      'ui-slider',
      `ui-slider--${size}`,
      disabled && 'ui-slider--disabled',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const slider = (
      <input
        ref={ref}
        type="range"
        className={sliderClasses}
        disabled={disabled}
        value={currentValue}
        min={min}
        max={max}
        onChange={handleChange}
        {...props}
      />
    );

    if (showValue) {
      return (
        <div className="ui-slider-wrapper">
          <div className="ui-slider-container">
            {slider}
            <span className="ui-slider__value">{displayValue}</span>
          </div>
        </div>
      );
    }

    return slider;
  }
);

Slider.displayName = 'Slider';
