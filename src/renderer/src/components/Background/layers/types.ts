/**
 * Context provided to layers for rendering.
 * Contains canvas dimensions and device pixel ratio.
 */
export interface LayerContext {
  /** Canvas width in CSS pixels */
  width: number;
  /** Canvas height in CSS pixels */
  height: number;
  /** Device pixel ratio for crisp HiDPI rendering */
  dpr: number;
}

/**
 * Interface that all canvas layers must implement.
 *
 * Layers maintain their own internal state and are responsible for:
 * - Initializing any data structures needed for rendering
 * - Updating animation state based on elapsed time
 * - Rendering themselves to the provided canvas context
 */
export interface Layer {
  /**
   * Initialize layer state.
   * Called once on mount and again on resize.
   *
   * @param ctx - Canvas 2D rendering context
   * @param context - Canvas dimensions and DPR
   */
  init(ctx: CanvasRenderingContext2D, context: LayerContext): void;

  /**
   * Update layer state based on elapsed time.
   * Called every frame before render.
   *
   * @param deltaTime - Time elapsed since last frame in milliseconds
   */
  update(deltaTime: number): void;

  /**
   * Render layer to canvas context.
   * Called every frame after update.
   *
   * @param ctx - Canvas 2D rendering context
   * @param context - Canvas dimensions and DPR
   */
  render(ctx: CanvasRenderingContext2D, context: LayerContext): void;

  /**
   * Optional: Reset layer state to initial values.
   * Useful when animation restarts or settings change.
   */
  reset?(): void;
}

/**
 * Calculate vertical fade factor for masking.
 * Fade out bottom 20%, then ramp up to full opacity at 40%, stay full above that.
 *
 * @param y - Vertical position in pixels
 * @param height - Canvas height in pixels
 * @returns Fade factor from 0 to 1
 */
export function getVerticalFade(y: number, height: number): number {
  const fadeStart = height * 0.8; // Start fading at 80% down (20% from bottom)
  const fadeEnd = height * 0.6; // Full opacity at 60% down (40% from bottom)

  if (y <= fadeEnd) {
    return 1; // Full opacity above 60% (top 60%)
  } else if (y >= fadeStart) {
    return 0; // No opacity below 80% (bottom 20%)
  } else {
    // Linear fade between 60% and 80%
    return 1 - ((y - fadeEnd) / (fadeStart - fadeEnd));
  }
}
