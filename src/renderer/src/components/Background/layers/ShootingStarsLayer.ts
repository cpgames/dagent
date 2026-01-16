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
  /** Trail length in pixels (35-50) */
  trailLength: number;
  /** Current opacity (fades out near end of life) */
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
 * - Random spawn at ~1% chance per frame
 * - Maximum 3 shooting stars visible at any time
 * - Gradient trail 35-50px in length
 * - Stars move diagonally across upper portion of viewport
 * - Fade out in last 500ms of life
 */
export class ShootingStarsLayer implements Layer {
  private stars: ShootingStar[] = [];
  private readonly MAX_STARS = 3;
  private readonly SPAWN_CHANCE = 0.01;
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

      // Calculate opacity - fade out in last 500ms
      if (star.life <= 500) {
        star.opacity = Math.max(0, star.life / 500);
      }
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

      // Create linear gradient from tail (transparent) to head (bright)
      const gradient = ctx.createLinearGradient(tailX, tailY, star.x, star.y);
      gradient.addColorStop(0, `rgba(255, 255, 255, 0)`);
      gradient.addColorStop(1, `rgba(255, 255, 255, ${star.opacity})`);

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
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
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

    // Velocity: leftward and downward
    const vx = -0.3 - Math.random() * 0.2; // -0.3 to -0.5 px/ms
    const vy = 0.15 + Math.random() * 0.1; // 0.15 to 0.25 px/ms

    // Trail length: 35-50px
    const trailLength = 35 + Math.random() * 15;

    // Life: 2000-3000ms
    const life = 2000 + Math.random() * 1000;

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
