import type { Layer, LayerContext } from './types';
import { getVerticalFade } from './types';

/**
 * Internal star representation.
 */
interface Star {
  /** Normalized x position (0 to 1, multiply by width) */
  x: number;
  /** Normalized y position (0 to 1, multiply by height) */
  y: number;
  /** Core star radius (constant 1.5px) */
  radius: number;
  /** Glow radius for radial gradient (varies 8-20px) */
  glowRadius: number;
  /** Phase offset for desynchronized flicker animation */
  phase: number;
  /** Color hue factor (0 to 1, for purple to cyan variation) */
  hue: number;
  /** Current lifetime in ms */
  life: number;
  /** Total lifetime for this star (fade in + visible + fade out) */
  maxLife: number;
  /** Fade in duration in ms */
  fadeInDuration: number;
  /** Fade out duration in ms */
  fadeOutDuration: number;
}

/**
 * StarsLayer creates a twinkling starfield with spawning/despawning stars in purple-to-cyan gradient.
 *
 * Features:
 * - Maximum 75 stars at any time
 * - Stars spawn with fade-in, live, then fade-out and despawn
 * - Consistent core size (1.0px radius)
 * - Varied radial glow radius (5-13px) for visual diversity
 * - Distribution biased toward top of canvas (using Math.pow for y)
 * - Slow sinusoidal glow using sin(time * 0.0008 + phase)
 * - Base opacity 0.3 with glow amplitude 0.4 (range: 0.3-0.7)
 * - Color variation from purple (200, 180, 255) to cyan (100, 200, 255)
 */
export class StarsLayer implements Layer {
  private stars: Star[] = [];
  private time = 0;
  private readonly MAX_STARS = 75; // Reduced by half (was 150)
  private readonly SPAWN_CHANCE = 0.015; // 1.5% chance per frame to spawn a star

  init(_ctx: CanvasRenderingContext2D, _context: LayerContext): void {
    // Canvas dimensions are accessed via context parameter in render

    // Start with some initial stars at various life stages
    const initialCount = Math.floor(this.MAX_STARS * 0.5); // Start with 50% capacity
    for (let i = 0; i < initialCount; i++) {
      this.spawnStar(true); // true = skip initial fade-in
    }
  }

  private spawnStar(skipFadeIn = false): void {
    const fadeInDuration = 2000; // 2 seconds fade in
    const visibleDuration = 8000 + Math.random() * 4000; // 8-12 seconds visible
    const fadeOutDuration = 2000; // 2 seconds fade out
    const maxLife = fadeInDuration + visibleDuration + fadeOutDuration;

    this.stars.push({
      x: Math.random(),
      y: Math.pow(Math.random(), 1.5), // Bias toward top (0)
      radius: 1.0, // Smaller core size (was 1.5px)
      glowRadius: 5 + Math.random() * 8, // Smaller glow: 5-13px (was 8-20px)
      phase: Math.random() * Math.PI * 2,
      hue: Math.random(), // 0 to 1 for color variation
      life: skipFadeIn ? fadeInDuration + Math.random() * visibleDuration : 0,
      maxLife,
      fadeInDuration,
      fadeOutDuration,
    });
  }

  update(deltaTime: number): void {
    this.time += deltaTime;

    // Update existing stars
    for (const star of this.stars) {
      star.life += deltaTime;
    }

    // Remove dead stars
    this.stars = this.stars.filter(star => star.life < star.maxLife);

    // Spawn new stars if below max
    if (this.stars.length < this.MAX_STARS && Math.random() < this.SPAWN_CHANCE) {
      this.spawnStar();
    }
  }

  render(ctx: CanvasRenderingContext2D, context: LayerContext): void {
    const { width, height } = context;

    for (const star of this.stars) {
      // Calculate lifecycle fade (fade in -> full -> fade out)
      let lifeFade = 1;
      if (star.life < star.fadeInDuration) {
        // Fading in: 0 -> 1
        lifeFade = star.life / star.fadeInDuration;
      } else if (star.life > star.maxLife - star.fadeOutDuration) {
        // Fading out: 1 -> 0
        const fadeOutProgress = star.life - (star.maxLife - star.fadeOutDuration);
        lifeFade = 1 - (fadeOutProgress / star.fadeOutDuration);
      }

      // Calculate slow glow opacity: base 0.3, amplitude 0.4, range [0.3, 0.7]
      // sin returns [-1, 1], so (sin + 1) / 2 gives [0, 1]
      // Then: 0.3 + 0.4 * [0, 1] = [0.3, 0.7]
      const glow = Math.sin(this.time * 0.0008 + star.phase);
      const baseOpacity = 0.3 + 0.4 * ((glow + 1) / 2);

      // Apply vertical gradient mask: fade out towards bottom
      // Stars at top (y=0) have full opacity, at bottom (y=height) have 0 opacity
      const centerY = star.y * height;
      const verticalFade = getVerticalFade(centerY, height);

      // Combine all opacity factors
      const opacity = baseOpacity * verticalFade * lifeFade;

      // Skip rendering if completely transparent
      if (opacity <= 0) continue;

      // Interpolate color from purple (200, 180, 255) to cyan (100, 200, 255)
      const r = Math.floor(200 - star.hue * 100); // 200 -> 100
      const g = Math.floor(180 + star.hue * 20);  // 180 -> 200
      const b = 255; // Constant

      const centerX = star.x * width;

      // Draw radial glow gradient
      const gradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, star.glowRadius
      );
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity})`);
      gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${opacity * 0.5})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      ctx.beginPath();
      ctx.arc(centerX, centerY, star.glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw bright core
      ctx.beginPath();
      ctx.arc(centerX, centerY, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      ctx.fill();
    }
  }

  reset(): void {
    this.time = 0;
  }
}
