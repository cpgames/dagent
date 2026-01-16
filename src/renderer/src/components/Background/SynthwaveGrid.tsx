import React, { useRef, useEffect, useCallback, useState } from 'react';
import './SynthwaveGrid.css';

export interface SynthwaveGridProps {
  /** Animation speed multiplier (default 1) */
  speed?: number;
  /** Number of horizontal lines (default 15) */
  lineCount?: number;
  /** Additional class name */
  className?: string;
}

/**
 * Canvas-based synthwave grid component.
 *
 * Renders a perspective grid with curved horizontal lines
 * that follow the horizon's elliptical curvature, with
 * smooth scrolling animation toward the viewer.
 */
export const SynthwaveGrid: React.FC<SynthwaveGridProps> = ({
  speed = 1,
  lineCount = 15,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Draw the grid on canvas
  const draw = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);

    const horizonY = 0; // Top of canvas is the horizon
    const viewerY = height; // Bottom is closest to viewer
    const centerX = width / 2;

    // Vanishing point at horizon center
    const vanishingPointX = centerX;
    const vanishingPointY = horizonY;

    // Calculate the spacing between horizontal lines with perspective
    // Lines closer to viewer are more spaced out
    const baseSpacing = height / lineCount;
    const scrollOffset = offsetRef.current % baseSpacing;

    // Draw horizontal curved lines (cyan)
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
    ctx.lineWidth = 1;

    for (let i = 0; i <= lineCount + 1; i++) {
      // Calculate y position with perspective (exponential for depth effect)
      const t = (i * baseSpacing + scrollOffset) / height;
      const perspectiveT = Math.pow(t, 1.5); // Perspective compression
      const y = horizonY + perspectiveT * (viewerY - horizonY);

      if (y < horizonY || y > viewerY) continue;

      // Calculate opacity (fade toward horizon)
      const opacity = Math.min(1, (y - horizonY) / (height * 0.3)) * 0.8;
      ctx.strokeStyle = `rgba(0, 240, 255, ${opacity})`;
      ctx.lineWidth = 1 + (y / height) * 1.5; // Thicker lines closer to viewer

      // Draw curved line using quadratic bezier
      // Curvature matches the elliptical horizon
      const curveAmount = (y / height) * 100; // More curve closer to viewer

      ctx.beginPath();
      ctx.moveTo(0, y + curveAmount);
      ctx.quadraticCurveTo(centerX, y - curveAmount * 0.5, width, y + curveAmount);
      ctx.stroke();
    }

    // Draw vertical lines (magenta) converging to vanishing point
    const verticalLineCount = 21; // Odd number for center line
    ctx.lineWidth = 1;

    for (let i = 0; i < verticalLineCount; i++) {
      // Calculate x position at bottom (viewer level)
      const t = i / (verticalLineCount - 1);
      const bottomX = t * width;

      // Lines converge to vanishing point
      // Opacity based on distance from center
      const distFromCenter = Math.abs(bottomX - centerX) / (width / 2);
      const opacity = 0.6 * (1 - distFromCenter * 0.3);
      ctx.strokeStyle = `rgba(255, 0, 255, ${opacity})`;

      ctx.beginPath();
      ctx.moveTo(vanishingPointX, vanishingPointY);
      ctx.lineTo(bottomX, viewerY);
      ctx.stroke();
    }
  }, [lineCount]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle resize
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      draw(ctx, rect.width, rect.height);
    };

    resize();
    window.addEventListener('resize', resize);

    // Animation
    let lastTime = 0;
    const animate = (time: number) => {
      if (!reducedMotion) {
        const delta = time - lastTime;
        lastTime = time;

        // Scroll toward viewer (increase offset)
        offsetRef.current += delta * 0.05 * speed;

        const rect = canvas.getBoundingClientRect();
        draw(ctx, rect.width, rect.height);
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    // Initial draw for reduced motion
    if (reducedMotion) {
      const rect = canvas.getBoundingClientRect();
      draw(ctx, rect.width, rect.height);
    }

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [draw, speed, reducedMotion]);

  const classes = ['synthwave-grid', className].filter(Boolean).join(' ');

  return (
    <canvas
      ref={canvasRef}
      className={classes}
      aria-hidden="true"
    />
  );
};

SynthwaveGrid.displayName = 'SynthwaveGrid';
