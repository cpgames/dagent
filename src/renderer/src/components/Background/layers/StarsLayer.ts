import type { Layer, LayerContext } from './types';

/**
 * Internal star representation.
 */
interface Star {
  /** Normalized x position (0 to 1, multiply by width) */
  x: number;
  /** Normalized y position (0 to 1, multiply by height) */
  y: number;
  /** Star radius in pixels (0.5 to 2.2) */
  radius: number;
  /** Phase offset for desynchronized flicker animation */
  phase: number;
}

/**
 * StarsLayer creates a twinkling starfield with 360 stars.
 *
 * Features:
 * - Exactly 360 star objects created on init
 * - Random sizes between 0.5px and 2.2px radius
 * - Distribution biased toward top of canvas (using Math.pow for y)
 * - Sinusoidal opacity flicker using sin(time * 0.0015 + phase)
 * - Base opacity 0.4 with flicker amplitude 0.5 (range: 0.4-0.9)
 * - White color (#ffffff)
 */
export class StarsLayer implements Layer {
  private stars: Star[] = [];
  private time = 0;

  init(_ctx: CanvasRenderingContext2D, _context: LayerContext): void {
    // Only generate stars once
    if (this.stars.length > 0) return;

    this.stars = Array.from({ length: 360 }, () => ({
      x: Math.random(),
      y: Math.pow(Math.random(), 1.5), // Bias toward top (0)
      radius: 0.5 + Math.random() * 1.7, // 0.5 to 2.2
      phase: Math.random() * Math.PI * 2,
    }));
  }

  update(deltaTime: number): void {
    this.time += deltaTime;
  }

  render(ctx: CanvasRenderingContext2D, context: LayerContext): void {
    const { width, height } = context;

    for (const star of this.stars) {
      // Calculate flicker opacity: base 0.4, amplitude 0.5, range [0.4, 0.9]
      // sin returns [-1, 1], so (sin + 1) / 2 gives [0, 1]
      // Then: 0.4 + 0.5 * [0, 1] = [0.4, 0.9]
      const flicker = Math.sin(this.time * 0.0015 + star.phase);
      const opacity = 0.4 + 0.5 * (flicker + 1) / 2;

      ctx.beginPath();
      ctx.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.fill();
    }
  }

  reset(): void {
    this.time = 0;
  }
}
