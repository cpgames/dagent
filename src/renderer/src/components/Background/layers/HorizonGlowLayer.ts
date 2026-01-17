import type { Layer, LayerContext } from './types';

/**
 * HorizonGlowLayer renders a very faint pulsing purple glow at the horizon.
 *
 * Features:
 * - Linear gradient band at horizon (85% from top)
 * - Very faint purple color for subtle effect
 * - Slow sinusoidal pulsing between low intensities
 * - Thin band (8% of canvas height)
 */
export class HorizonGlowLayer implements Layer {
  private time = 0;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;

  // Configuration - pink glow with color shift
  private readonly colorPink = { r: 236, g: 72, b: 153 }; // #ec4899 (hot pink)
  private readonly colorCyan = { r: 0, g: 255, b: 255 }; // #00ffff (cyan)
  private readonly positionY = 0.95; // 75% from top (25% from bottom)
  private readonly intensity = 0.759375; // Static intensity (no pulsing)
  private readonly colorShiftSpeed = 0.0002; // Very slow color shift

  init(_ctx: CanvasRenderingContext2D, context: LayerContext): void {
    // Create offscreen canvas for masking
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = context.width;
    this.offscreenCanvas.height = context.height;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
  }

  update(deltaTime: number): void {
    this.time += deltaTime;
  }

  render(ctx: CanvasRenderingContext2D, context: LayerContext): void {
    const { width, height } = context;

    if (!this.offscreenCanvas || !this.offscreenCtx) return;

    // Clear offscreen canvas
    this.offscreenCtx.clearRect(0, 0, width, height);

    // Calculate color shift using slower sinusoidal animation
    const colorShift = Math.sin(this.time * this.colorShiftSpeed);
    const normalizedColorShift = (colorShift + 1) / 2; // [0, 1]

    // Interpolate between pink and cyan
    const r = Math.floor(this.colorPink.r + (this.colorCyan.r - this.colorPink.r) * normalizedColorShift);
    const g = Math.floor(this.colorPink.g + (this.colorCyan.g - this.colorPink.g) * normalizedColorShift);
    const b = Math.floor(this.colorPink.b + (this.colorCyan.b - this.colorPink.b) * normalizedColorShift);

    // Calculate horizon position
    const centerY = height * this.positionY;
    const centerX = width / 2;
    const radius = width * 0.45;

    // Step 1: Draw the glow to offscreen canvas
    const gradient = this.offscreenCtx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, radius
    );
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${this.intensity})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    this.offscreenCtx.beginPath();
    this.offscreenCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.offscreenCtx.fillStyle = gradient;
    this.offscreenCtx.fill();

    // Step 2: Apply vertical fade mask using destination-in composite
    const maskGradient = this.offscreenCtx.createLinearGradient(0, 0, 0, height);

    // Match getVerticalFade logic:
    // - Top to 60%: full opacity (1.0)
    // - 60% to 80%: linear fade (1.0 -> 0.0)
    // - 80% to bottom: no opacity (0.0)
    const fadeEnd = height * 0.6;    // 60% - end of full opacity zone
    const fadeStart = height * 0.8;  // 80% - start of no opacity zone

    // Top to fadeEnd (60%): full white (full opacity)
    maskGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    maskGradient.addColorStop(fadeEnd / height, 'rgba(255, 255, 255, 1)');
    // fadeEnd (60%) to fadeStart (80%): linear fade from white to transparent
    maskGradient.addColorStop(fadeStart / height, 'rgba(255, 255, 255, 0)');
    // fadeStart (80%) to bottom: transparent
    maskGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    this.offscreenCtx.globalCompositeOperation = 'destination-in';
    this.offscreenCtx.fillStyle = maskGradient;
    this.offscreenCtx.fillRect(0, 0, width, height);

    // Reset composite operation
    this.offscreenCtx.globalCompositeOperation = 'source-over';

    // Step 3: Composite offscreen canvas to main canvas with screen blend mode
    ctx.save();
    ctx.globalCompositeOperation = 'lighten';
    ctx.drawImage(this.offscreenCanvas, 0, 0);
    ctx.restore();
  }

  reset(): void {
    this.time = 0;
  }
}
