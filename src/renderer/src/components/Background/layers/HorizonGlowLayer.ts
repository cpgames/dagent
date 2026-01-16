import type { Layer, LayerContext } from './types';

/**
 * HorizonGlowLayer renders a pulsing radial gradient glow at the horizon.
 *
 * Features:
 * - Radial gradient centered at horizon (65% from top)
 * - Height spans 30% of canvas (from 50% to 80% vertically)
 * - Sinusoidal pulsing between intensity 0.3 and 0.8
 * - Hot pink/magenta color (#ff2975)
 * - Uses 'lighter' blend mode for glow intensity
 */
export class HorizonGlowLayer implements Layer {
  private time = 0;

  // Configuration
  private readonly color = '#ff006e';
  private readonly positionY = 0.85; // 85% from top (lower horizon line to match reference)
  private readonly heightFraction = 0.08; // Thin glow band (8% of canvas height)
  private readonly minIntensity = 0.8;
  private readonly maxIntensity = 1.0;
  private readonly pulseSpeed = 0.0005; // radians/ms for slower, subtle pulsing

  init(_ctx: CanvasRenderingContext2D, _context: LayerContext): void {
    // No initialization needed - gradient computed each frame
  }

  update(deltaTime: number): void {
    this.time += deltaTime;
  }

  render(ctx: CanvasRenderingContext2D, context: LayerContext): void {
    const { width, height } = context;

    // Calculate pulsing intensity using sinusoidal animation
    // sin returns [-1, 1], map to [0, 1], then scale to [minIntensity, maxIntensity]
    const pulse = Math.sin(this.time * this.pulseSpeed);
    const normalizedPulse = (pulse + 1) / 2; // [0, 1]
    const intensity = this.minIntensity + normalizedPulse * (this.maxIntensity - this.minIntensity);

    // Save context for blend mode
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Radial gradient centered at horizon
    const centerX = width / 2;
    const centerY = height * this.positionY;
    const radiusX = width * 0.8; // Wide horizontal spread
    const radiusY = height * this.heightFraction;

    // Create radial gradient
    const gradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, Math.max(radiusX, radiusY)
    );

    // Color stops for thin gradient band
    gradient.addColorStop(0, this.hexToRgba(this.color, intensity));
    gradient.addColorStop(0.5, this.hexToRgba(this.color, intensity * 0.8));
    gradient.addColorStop(1, this.hexToRgba(this.color, 0));

    // Draw elliptical glow using scale transform
    ctx.translate(centerX, centerY);
    ctx.scale(radiusX / radiusY, 1);
    ctx.translate(-centerX, -centerY);

    ctx.fillStyle = gradient;
    ctx.fillRect(centerX - radiusY, centerY - radiusY, radiusY * 2, radiusY * 2);

    ctx.restore();
  }

  reset(): void {
    this.time = 0;
  }

  /**
   * Convert hex color to rgba string with specified alpha.
   */
  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
