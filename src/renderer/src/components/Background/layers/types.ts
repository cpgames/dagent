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
