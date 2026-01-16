import React from 'react';
import './Horizon.css';

export interface HorizonProps {
  /** Show perspective grid lines */
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
 * gradient line, sky glow, and optional perspective grid.
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
      {showGrid && <div className="horizon__grid" />}
    </div>
  );
};

Horizon.displayName = 'Horizon';
