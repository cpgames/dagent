import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { useAnimationFrame } from './hooks/useAnimationFrame';
import { useReducedMotion } from './hooks/useReducedMotion';
import type { Layer, LayerContext } from './layers/types';
import './UnifiedCanvas.css';

export interface UnifiedCanvasProps {
  /** Array of layers to render (back to front) */
  layers: Layer[];
  /** Additional CSS class name */
  className?: string;
  /** Optional static background image URL */
  backgroundImage?: string;
}

/**
 * Base canvas component for unified background rendering.
 *
 * Features:
 * - Renders multiple layers with consistent animation timing
 * - Handles canvas resize with ResizeObserver (100ms debounce)
 * - Scales for devicePixelRatio for crisp HiDPI rendering
 * - Respects prefers-reduced-motion for accessibility
 * - When reduced motion: renders once statically, skips animation
 */
export const UnifiedCanvas: React.FC<UnifiedCanvasProps> = ({
  layers,
  className = '',
  backgroundImage,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<LayerContext>({ width: 0, height: 0, dpr: 1 });
  const initializedRef = useRef(false);

  const reducedMotion = useReducedMotion();

  // Initialize layers with current context
  const initializeLayers = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const context = contextRef.current;

    // Initialize each layer
    for (const layer of layers) {
      layer.init(ctx, context);
    }

    initializedRef.current = true;

    // Render once immediately after init
    ctx.clearRect(0, 0, context.width, context.height);
    for (const layer of layers) {
      layer.render(ctx, context);
    }
  }, [layers]);

  // Handle canvas resize
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Set canvas buffer size for HiDPI
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    // Update context dimensions (in CSS pixels)
    contextRef.current = {
      width: rect.width,
      height: rect.height,
      dpr,
    };

    // Get context and scale for DPR
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    // Reinitialize layers on resize
    initializeLayers();
  }, [initializeLayers]);

  // Setup ResizeObserver with debounce
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize events (100ms per PERF-03)
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        handleResize();
      }, 100);
    });

    resizeObserver.observe(canvas);

    // Initial resize
    handleResize();

    return () => {
      resizeObserver.disconnect();
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [handleResize]);

  // Animation callback
  const animate = useCallback(
    (deltaTime: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const context = contextRef.current;

      // Update all layers
      for (const layer of layers) {
        layer.update(deltaTime);
      }

      // Clear and render all layers
      ctx.clearRect(0, 0, context.width, context.height);
      for (const layer of layers) {
        layer.render(ctx, context);
      }
    },
    [layers]
  );

  // Use animation frame hook, paused when reduced motion is preferred
  useAnimationFrame(animate, reducedMotion);

  const classes = useMemo(
    () => ['unified-canvas', className].filter(Boolean).join(' '),
    [className]
  );

  // If backgroundImage is provided, render it as a static image behind the canvas
  if (backgroundImage) {
    return (
      <div className="unified-canvas-container">
        <img
          src={backgroundImage}
          alt=""
          className="unified-canvas-background"
          aria-hidden="true"
        />
        <canvas
          ref={canvasRef}
          className={classes}
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={classes}
      aria-hidden="true"
    />
  );
};

UnifiedCanvas.displayName = 'UnifiedCanvas';
