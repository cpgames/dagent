import type { Layer, LayerContext } from './types';

/**
 * TerrainLayer renders sharp mountain silhouettes on the left and right sides.
 *
 * Features:
 * - Mountains start at 25% from left and 75% from right
 * - Sharp peaked edges (not rounded)
 * - Black silhouettes with cyan edge glow
 * - Static positioning (no animation)
 * - Peaks grow higher towards outer edges
 */
export class TerrainLayer implements Layer {
  private readonly CYAN_GLOW = '#00f0ff';
  private readonly GLOW_WIDTH = 2;

  private leftMountain: number[] = [];
  private rightMountain: number[] = [];
  private width = 0;
  private height = 0;

  init(_ctx: CanvasRenderingContext2D, context: LayerContext): void {
    this.width = context.width;
    this.height = context.height;

    const horizonY = this.height * 0.85;
    const mountainWidth = this.width * 0.25; // Mountains take 25% of width on each side
    const numPeaks = 10; // Number of sharp peaks

    // Generate left mountain profile
    this.leftMountain = this.generateSharpPeaks(
      numPeaks,
      horizonY,
      mountainWidth
    );

    // Generate right mountain profile
    this.rightMountain = this.generateSharpPeaks(
      numPeaks,
      horizonY,
      mountainWidth
    );
  }

  update(_deltaTime: number): void {
    // Static terrain - no animation
  }

  render(ctx: CanvasRenderingContext2D, _context: LayerContext): void {
    const horizonY = this.height * 0.85;
    const mountainWidth = this.width * 0.25;

    // Draw left mountain (from left edge to 25%)
    const leftStartX = 0;
    this.drawMountain(ctx, this.leftMountain, leftStartX, horizonY, mountainWidth, true);

    // Draw right mountain (from 75% to right edge)
    const rightStartX = this.width * 0.75;
    this.drawMountain(ctx, this.rightMountain, rightStartX, horizonY, mountainWidth, false);
  }

  reset(): void {
    // Nothing to reset for static terrain
  }

  /**
   * Draw a mountain silhouette with cyan glow on top edge.
   */
  private drawMountain(
    ctx: CanvasRenderingContext2D,
    profile: number[],
    startX: number,
    horizonY: number,
    width: number,
    isLeft: boolean
  ): void {
    // Draw black silhouette
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.beginPath();

    if (isLeft) {
      // Start from left screen edge at bottom
      ctx.moveTo(0, this.height);
      // Go up to first peak at left edge
      ctx.lineTo(0, profile[0]);
      // Draw peaks moving right
      for (let i = 1; i < profile.length; i++) {
        const x = startX + (i / (profile.length - 1)) * width;
        const y = profile[i];
        ctx.lineTo(x, y);
      }
      // End at horizon at 25% mark
      ctx.lineTo(startX + width, horizonY);
      // Close at bottom
      ctx.lineTo(startX + width, this.height);
    } else {
      // Start from 75% mark at horizon
      ctx.moveTo(startX, horizonY);
      // Draw peaks moving right
      for (let i = 0; i < profile.length; i++) {
        const x = startX + (i / (profile.length - 1)) * width;
        const y = profile[i];
        ctx.lineTo(x, y);
      }
      // End at right screen edge
      ctx.lineTo(this.width, profile[profile.length - 1]);
      ctx.lineTo(this.width, this.height);
      ctx.lineTo(startX, this.height);
    }

    ctx.closePath();
    ctx.fill();

    // Draw cyan glow on top edge
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = this.CYAN_GLOW;
    ctx.lineWidth = this.GLOW_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'miter'; // Sharp corners

    ctx.beginPath();
    if (isLeft) {
      ctx.moveTo(0, profile[0]);
      for (let i = 1; i < profile.length; i++) {
        const x = startX + (i / (profile.length - 1)) * width;
        const y = profile[i];
        ctx.lineTo(x, y);
      }
    } else {
      ctx.moveTo(startX, profile[0]);
      for (let i = 1; i < profile.length; i++) {
        const x = startX + (i / (profile.length - 1)) * width;
        const y = profile[i];
        ctx.lineTo(x, y);
      }
      ctx.lineTo(this.width, profile[profile.length - 1]);
    }
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Generate sharp mountain peaks that grow higher towards the edge.
   *
   * @param numPeaks - Number of sharp peaks
   * @param horizonY - Y-coordinate of horizon line
   * @param width - Width of mountain range
   * @returns Array of y-coordinates for sharp peaks
   */
  private generateSharpPeaks(
    numPeaks: number,
    horizonY: number,
    _width: number
  ): number[] {
    const points: number[] = [];

    // Generate peaks - each peak needs 2 points (up and down)
    for (let i = 0; i < numPeaks; i++) {
      const progress = i / (numPeaks - 1); // 0 to 1

      // Height starts small at edges (25%/75%) and grows towards outer edges (0%/100%)
      // Invert progress so it grows outward
      const heightFactor = 1 - progress; // 1 to 0
      const maxHeight = this.height * 0.18 * (0.3 + heightFactor * 0.7); // Grows from outer to inner

      // Random variation for each peak (60% to 100% of max height)
      const peakHeight = maxHeight * (0.6 + Math.random() * 0.4);

      // Peak point (going up)
      const peakY = horizonY - peakHeight;
      points.push(peakY);

      // Valley point (going down) - random depth
      const valleyDepth = peakHeight * (0.4 + Math.random() * 0.3);
      const valleyY = horizonY - valleyDepth;
      points.push(valleyY);
    }

    return points;
  }
}
