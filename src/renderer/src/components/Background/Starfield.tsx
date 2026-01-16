import React from 'react';
import './Starfield.css';

export interface StarfieldProps {
  /** Number of star layers (1-3) */
  layers?: 1 | 2 | 3;
  /** Additional class name */
  className?: string;
}

/**
 * Animated starfield background using CSS box-shadow technique.
 *
 * Creates multiple layers of twinkling stars with different
 * animation speeds for depth effect.
 */
export const Starfield: React.FC<StarfieldProps> = ({
  layers = 3,
  className = '',
}) => {
  const classes = ['starfield', className].filter(Boolean).join(' ');

  return (
    <div className={classes} aria-hidden="true">
      {layers >= 1 && <div className="starfield__layer starfield__layer--1" />}
      {layers >= 2 && <div className="starfield__layer starfield__layer--2" />}
      {layers >= 3 && <div className="starfield__layer starfield__layer--3" />}
    </div>
  );
};

Starfield.displayName = 'Starfield';
