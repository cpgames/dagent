import type { Layer, LayerContext } from './types';

/**
 * Internal shooting star representation.
 */
interface ShootingStar {
  /** Current x position in pixels */
  x: number;
  /** Current y position in pixels */
  y: number;
  /** Velocity x in pixels per ms (negative for leftward movement) */
  vx: number;
  /** Velocity y in pixels per ms (positive for downward movement) */
  vy: number;
  /** Trail length in pixels (80-120) */
  trailLength: number;
  /** Current opacity (fades out gradually over lifetime) */
  opacity: number;
  /** Remaining lifetime in ms */
  life: number;
  /** Initial lifetime for opacity calculation */
  maxLife: number;
}

/**
 * ShootingStarsLayer renders animated shooting stars with gradient trails.
 *
 * Features:
 * - Random spawn at ~0.3% chance per frame (fewer stars)
 * - Maximum 2 shooting stars visible at any time
 * - Gradient trail 80-120px in length (longer trails)
 * - Stars move diagonally across upper portion of viewport
 * - Fade out gradually over entire lifetime
 */
export class ShootingStarsLayer implements Layer {
  private stars: ShootingStar[] = [];
  private readonly MAX_STARS = 2;
  private readonly SPAWN_CHANCE = 0.003;
  private canvasWidth = 0;
  private canvasHeight = 0;

  init(_ctx: CanvasRenderingContext2D, context: LayerContext): void {
    // Store dimensions for spawning
    this.canvasWidth = context.width;
    this.canvasHeight = context.height;
  }

  update(deltaTime: number): void {
    // Spawn logic: if below max and random chance hits
    if (this.stars.length < this.MAX_STARS && Math.random() < this.SPAWN_CHANCE) {
      this.spawnStar();
    }

    // Update each star
    for (const star of this.stars) {
      // Move by velocity * deltaTime
      star.x += star.vx * deltaTime;
      star.y += star.vy * deltaTime;

      // Decrease life
      star.life -= deltaTime;

      // Calculate opacity - fade out gradually over entire lifetime
      star.opacity = Math.max(0, star.life / star.maxLife);
    }

    // Remove dead or off-screen stars
    this.stars = this.stars.filter(
      (star) =>
        star.life > 0 &&
        star.x > -50 &&
        star.y < this.canvasHeight + 50
    );
  }

  render(ctx: CanvasRenderingContext2D, _context: LayerContext): void {
    for (const star of this.stars) {
      // Calculate angle from velocity
      const angle = Math.atan2(-star.vy, -star.vx);

      // Calculate trail end position (behind the head)
      const tailX = star.x + star.trailLength * Math.cos(angle);
      const tailY = star.y + star.trailLength * Math.sin(angle);

      // Create linear gradient from tail (transparent) to head (bright purple/magenta)
      const gradient = ctx.createLinearGradient(tailX, tailY, star.x, star.y);
      gradient.addColorStop(0, `rgba(138, 43, 226, 0)`); // Transparent purple
      gradient.addColorStop(0.5, `rgba(186, 85, 211, ${star.opacity * 0.6})`); // Medium orchid
      gradient.addColorStop(1, `rgba(255, 0, 255, ${star.opacity})`); // Bright magenta at head

      // Draw trail line
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(star.x, star.y);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Draw bright circle at head
      ctx.beginPath();
      ctx.arc(star.x, star.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 0, 255, ${star.opacity})`; // Bright magenta
      ctx.fill();
    }
  }

  reset(): void {
    this.stars = [];
  }

  /**
   * Spawn a new shooting star at a random position in upper viewport.
   */
  private spawnStar(): void {
    // Spawn position: random x across width, y in upper 20%
    const x = Math.random() * this.canvasWidth;
    const y = Math.random() * this.canvasHeight * 0.2;

    // Velocity: slower, leftward and downward
    const vx = -0.15 - Math.random() * 0.1; // -0.15 to -0.25 px/ms (50% slower)
    const vy = 0.08 + Math.random() * 0.05; // 0.08 to 0.13 px/ms (50% slower)

    // Trail length: 80-120px (longer trails)
    const trailLength = 80 + Math.random() * 40;

    // Life: 4000-6000ms (longer lifetime for gradual fade)
    const life = 4000 + Math.random() * 2000;

    this.stars.push({
      x,
      y,
      vx,
      vy,
      trailLength,
      opacity: 1,
      life,
      maxLife: life,
    });
  }
}
