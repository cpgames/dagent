import type { Layer, LayerContext } from './types';

/**
 * SkyLayer renders a vertical gradient from deep purple to pink.
 *
 * The gradient creates the synthwave sky backdrop with:
 * - Top: Deep purple (#1b2853)
 * - Middle: Purple-blue (#162b79) at ~50%
 * - Bottom: Hot pink (#f222ff) at horizon
 *
 * This is a static layer - no animation needed.
 */
export class SkyLayer implements Layer {
  private gradient: CanvasGradient | null = null;

  init(ctx: CanvasRenderingContext2D, context: LayerContext): void {
    // Create gradient from top (0) to bottom (height)
    this.gradient = ctx.createLinearGradient(0, 0, 0, context.height);
    this.gradient.addColorStop(0, '#1b2853'); // Deep purple at top
    this.gradient.addColorStop(0.5, '#162b79'); // Purple-blue middle
    this.gradient.addColorStop(1, '#f222ff'); // Pink at bottom
  }

  update(_deltaTime: number): void {
    // Static gradient - no update needed
  }

  render(ctx: CanvasRenderingContext2D, context: LayerContext): void {
    if (!this.gradient) return;
    ctx.fillStyle = this.gradient;
    ctx.fillRect(0, 0, context.width, context.height);
  }
}
