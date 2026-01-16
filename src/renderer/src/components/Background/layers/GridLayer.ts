import type { Layer, LayerContext } from './types';

/**
 * GridLayer renders a perspective grid with curved horizontal lines
 * and vertical lines converging to a vanishing point.
 *
 * Features:
 * - Curved horizontal lines using quadratic bezier curves
 * - Smooth scrolling animation toward viewer using delta time
 * - Cyan color for horizontal lines (#00f0ff)
 * - Magenta color for vertical lines (#ff00ff)
 * - Perspective compression with exponential t^1.5 factor
 */
export class GridLayer implements Layer {
  // Configuration constants
  private readonly lineCount = 15;
  private readonly verticalLineCount = 21; // Odd for center line
  private readonly scrollSpeed = 0.05;

  // State
  private scrollOffset = 0;
  private baseSpacing = 0;

  init(_ctx: CanvasRenderingContext2D, context: LayerContext): void {
    this.baseSpacing = context.height / this.lineCount;
  }

  update(_deltaTime: number): void {
    // Static grid - no animation
    // this.scrollOffset += deltaTime * this.scrollSpeed;
    // if (this.baseSpacing > 0) {
    //   this.scrollOffset = this.scrollOffset % this.baseSpacing;
    // }
  }

  render(ctx: CanvasRenderingContext2D, context: LayerContext): void {
    const { width, height } = context;

    // Calculate key positions
    const horizonY = 0; // Top of canvas
    const viewerY = height; // Bottom of canvas
    const centerX = width / 2;

    // Vanishing point at horizon center
    const vanishingPointX = centerX;
    const vanishingPointY = horizonY;

    // Recalculate base spacing if dimensions changed
    const baseSpacing = height / this.lineCount;
    const scrollOffset = this.scrollOffset % baseSpacing;

    // Draw horizontal curved lines (cyan)
    for (let i = 0; i <= this.lineCount + 1; i++) {
      // Calculate y position with perspective (exponential for depth effect)
      const t = (i * baseSpacing + scrollOffset) / height;
      const perspectiveT = Math.pow(t, 1.5); // Perspective compression
      const y = horizonY + perspectiveT * (viewerY - horizonY);

      // Skip lines outside visible range
      if (y < horizonY || y > viewerY) continue;

      // Calculate opacity (fade toward horizon)
      const opacity = Math.min(1, (y - horizonY) / (height * 0.3)) * 0.8;
      ctx.strokeStyle = `rgba(0, 240, 255, ${opacity})`;

      // Line width increases closer to viewer (1 to 2.5px)
      ctx.lineWidth = 1 + (y / height) * 1.5;

      // Draw curved line using quadratic bezier
      // Curvature amount increases closer to viewer
      const curveAmount = (y / height) * 100;

      ctx.beginPath();
      ctx.moveTo(0, y + curveAmount);
      ctx.quadraticCurveTo(centerX, y - curveAmount * 0.5, width, y + curveAmount);
      ctx.stroke();
    }

    // Draw vertical lines (magenta) converging to vanishing point
    ctx.lineWidth = 1;

    for (let i = 0; i < this.verticalLineCount; i++) {
      // Calculate x position at bottom (viewer level)
      const t = i / (this.verticalLineCount - 1);
      const bottomX = t * width;

      // Opacity based on distance from center
      const distFromCenter = Math.abs(bottomX - centerX) / (width / 2);
      const opacity = 0.6 * (1 - distFromCenter * 0.3);
      ctx.strokeStyle = `rgba(255, 0, 255, ${opacity})`;

      ctx.beginPath();
      ctx.moveTo(vanishingPointX, vanishingPointY);
      ctx.lineTo(bottomX, viewerY);
      ctx.stroke();
    }
  }

  reset(): void {
    this.scrollOffset = 0;
  }
}
