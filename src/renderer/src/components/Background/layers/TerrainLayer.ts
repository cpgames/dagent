import type { Layer, LayerContext } from './types';

/**
 * TerrainLayer renders mountain/city silhouettes on the left and right sides.
 *
 * Features:
 * - Mountains positioned on left and right edges
 * - Black silhouettes with cyan edge glow
 * - Static positioning (no animation)
 * - Peaks rise from horizon line
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
    const mountainWidth = this.width * 0.3; // Mountains take 30% of width on each side
    const numPoints = 15;

    // Generate left mountain profile
    this.leftMountain = this.generateMountainProfile(
      numPoints,
      horizonY,
      this.height * 0.25, // Peak height variation
      0,
      mountainWidth
    );

    // Generate right mountain profile
    this.rightMountain = this.generateMountainProfile(
      numPoints,
      horizonY,
      this.height * 0.25,
      this.width - mountainWidth,
      this.width
    );
  }

  update(_deltaTime: number): void {
    // Static terrain - no animation
  }

  render(ctx: CanvasRenderingContext2D, _context: LayerContext): void {
    const horizonY = this.height * 0.85;

    // Draw left mountain
    this.drawMountain(ctx, this.leftMountain, 0, horizonY);

    // Draw right mountain
    this.drawMountain(ctx, this.rightMountain, this.width - this.width * 0.3, horizonY);
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
    horizonY: number
  ): void {
    const numPoints = profile.length;
    const mountainWidth = this.width * 0.3;

    // Draw black silhouette
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.beginPath();
    ctx.moveTo(startX, this.height); // Bottom-left

    // Draw mountain profile
    for (let i = 0; i < numPoints; i++) {
      const x = startX + (i / (numPoints - 1)) * mountainWidth;
      const y = profile[i];
      ctx.lineTo(x, y);
    }

    // Complete the shape
    ctx.lineTo(startX + mountainWidth, this.height); // Bottom-right
    ctx.closePath();
    ctx.fill();

    // Draw cyan glow on top edge
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = this.CYAN_GLOW;
    ctx.lineWidth = this.GLOW_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = startX + (i / (numPoints - 1)) * mountainWidth;
      const y = profile[i];
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Generate a mountain profile with varied peaks.
   *
   * @param numPoints - Number of points in the profile
   * @param horizonY - Y-coordinate of horizon line
   * @param variation - Maximum height variation from horizon
   * @param startX - Starting X position
   * @param endX - Ending X position
   * @returns Array of y-coordinates representing mountain peaks
   */
  private generateMountainProfile(
    numPoints: number,
    horizonY: number,
    variation: number,
    startX: number,
    endX: number
  ): number[] {
    const points: number[] = [];
    const isLeftSide = startX === 0;

    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);

      // Start and end at horizon
      let edgeFactor: number;
      if (isLeftSide) {
        // Left side: start at horizon, peak in middle-right, end lower
        edgeFactor = Math.sin(t * Math.PI * 0.8);
      } else {
        // Right side: start lower, peak in middle-left, end at horizon
        edgeFactor = Math.sin((1 - t) * Math.PI * 0.8);
      }

      // Add some randomness for natural look
      const noise = (Math.random() - 0.5) * 0.2;
      const heightFactor = edgeFactor * (1 + noise);

      // Calculate y-coordinate (lower values = higher on screen)
      const y = horizonY - heightFactor * variation;

      points.push(Math.max(horizonY * 0.6, y)); // Don't go too high
    }

    // Ensure edges start/end near horizon
    points[0] = horizonY - variation * 0.1;
    points[numPoints - 1] = horizonY - variation * 0.2;

    return points;
  }
}
