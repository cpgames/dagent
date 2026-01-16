import React from 'react';
import './Horizon.css';

export interface HorizonProps {
  /**
   * Show perspective grid lines (deprecated - grid now handled by SynthwaveGrid)
   * @deprecated Use SynthwaveGrid component instead
   */
  showGrid?: boolean;
  /** Horizon position from bottom (px) */
  position?: number;
  /** Additional class name */
  className?: string;
}

/**
 * Glowing horizon line component.
 *
 * Creates the synthwave sunset/horizon aesthetic with
 * gradient line, sky glow, and reflection effects.
 * Note: Grid lines are now rendered by SynthwaveGrid component.
 */
export const Horizon: React.FC<HorizonProps> = ({
  showGrid = false,
  position = 150,
  className = '',
}) => {
  const classes = ['horizon', className].filter(Boolean).join(' ');

  const style = position !== 150
    ? { '--horizon-offset': `${position}px` } as React.CSSProperties
    : undefined;

  return (
    <div
      className={classes}
      data-position={position !== 150 ? '' : undefined}
      style={style}
      aria-hidden="true"
    >
      <div className="horizon__sky" />
      <div className="horizon__line" />
      <div className="horizon__reflection" />
      {/* Grid is deprecated - use SynthwaveGrid component instead */}
      {showGrid && <div className="horizon__grid" />}
    </div>
  );
};

Horizon.displayName = 'Horizon';
