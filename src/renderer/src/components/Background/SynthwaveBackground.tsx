import React from 'react';
import { Starfield } from './Starfield';
import { Horizon } from './Horizon';
import './SynthwaveBackground.css';

export interface SynthwaveBackgroundProps {
  /** Enable starfield animation */
  stars?: boolean;
  /** Enable horizon glow */
  horizon?: boolean;
  /** Show grid lines on horizon */
  grid?: boolean;
  /** Additional class name */
  className?: string;
}

/**
 * Synthwave background container component.
 *
 * Combines Starfield and Horizon components to create
 * the full synthwave aesthetic background.
 */
export const SynthwaveBackground: React.FC<SynthwaveBackgroundProps> = ({
  stars = true,
  horizon = true,
  grid = false,
  className = '',
}) => {
  const classes = ['synthwave-background', className].filter(Boolean).join(' ');

  return (
    <div className={classes} aria-hidden="true">
      {stars && <Starfield />}
      {horizon && <Horizon showGrid={grid} />}
    </div>
  );
};

SynthwaveBackground.displayName = 'SynthwaveBackground';
