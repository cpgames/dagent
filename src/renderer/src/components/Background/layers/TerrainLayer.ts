import type { Layer, LayerContext } from './types';

/**
 * Internal terrain profile representation for each parallax layer.
 */
interface TerrainProfile {
  /** Y-coordinates representing terrain height at each point */
  points: number[];
  /** Horizontal scroll speed in pixels per millisecond */
  scrollSpeed: number;
  /** Opacity of this terrain layer (0-1) */
  opacity: number;
}

/**
 * TerrainLayer renders parallax mountain/city silhouettes with optional cyan edge glow.
 *
 * Features:
 * - 3 parallax terrain layers moving at different speeds
 * - Black silhouettes with varying opacity for depth effect
 * - Optional cyan glow on terrain edges for synthwave aesthetic
 * - Seamless wrapping for infinite scrolling
 */
export class TerrainLayer implements Layer {
  // Configuration constants
  private readonly NUM_LAYERS = 3;
  private readonly CYAN_GLOW = '#00f0ff';
  private readonly GLOW_WIDTH = 2;

  // State
  private profiles: TerrainProfile[] = [];
  private scrollOffsets: number[] = [];
  private width = 0;
  private height = 0;

  init(_ctx: CanvasRenderingContext2D, context: LayerContext): void {
    // Store dimensions
    this.width = context.width;
    this.height = context.height;

    // Initialize scroll offsets
    this.scrollOffsets = [0, 0, 0];

    // Generate 3 terrain profiles with different characteristics
    this.profiles = [
      // Near layer (index 0): most visible, fastest scroll
      {
        points: this.generateTerrainProfile(
          30 + Math.floor(Math.random() * 11), // 30-40 points
          this.height * 0.75, // baseHeight
          this.height * 0.15  // variation
        ),
        scrollSpeed: 0.02,
        opacity: 0.9,
      },
      // Mid layer (index 1): medium opacity, medium scroll
      {
        points: this.generateTerrainProfile(
          25 + Math.floor(Math.random() * 11), // 25-35 points
          this.height * 0.78,
          this.height * 0.12
        ),
        scrollSpeed: 0.015,
        opacity: 0.6,
      },
      // Far layer (index 2): faint, slowest scroll
      {
        points: this.generateTerrainProfile(
          20 + Math.floor(Math.random() * 11), // 20-30 points
          this.height * 0.82,
          this.height * 0.08
        ),
        scrollSpeed: 0.01,
        opacity: 0.3,
      },
    ];
  }

  update(deltaTime: number): void {
    // Update scroll offset for each layer
    for (let i = 0; i < this.NUM_LAYERS; i++) {
      this.scrollOffsets[i] += deltaTime * this.profiles[i].scrollSpeed;
      // Wrap using modulo for seamless scrolling
      this.scrollOffsets[i] %= this.width;
    }
  }

  render(ctx: CanvasRenderingContext2D, _context: LayerContext): void {
    // Render far to near (so near layers render on top)
    for (let i = this.NUM_LAYERS - 1; i >= 0; i--) {
      const profile = this.profiles[i];
      const scrollOffset = this.scrollOffsets[i];
      const numPoints = profile.points.length;

      // Set fill style for black silhouette
      ctx.fillStyle = `rgba(0, 0, 0, ${profile.opacity})`;

      // Begin terrain shape path
      ctx.beginPath();
      ctx.moveTo(0, this.height); // Start at bottom-left

      // Draw terrain profile with scroll offset
      // Draw both visible segment and wrapped segment for seamless scrolling
      for (let segment = 0; segment < 2; segment++) {
        const offsetX = segment * this.width - scrollOffset;

        for (let j = 0; j < numPoints; j++) {
          const x = offsetX + (j / (numPoints - 1)) * this.width;
          const y = profile.points[j];

          if (segment === 0 && j === 0) {
            ctx.lineTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      }

      // Close path by drawing to bottom-right and back to start
      ctx.lineTo(this.width * 2 - scrollOffset, this.height);
      ctx.lineTo(0, this.height);
      ctx.closePath();

      // Fill the terrain shape
      ctx.fill();

      // Optional cyan glow on top edge
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = this.CYAN_GLOW;
      ctx.lineWidth = this.GLOW_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Stroke just the top edge
      ctx.beginPath();
      for (let segment = 0; segment < 2; segment++) {
        const offsetX = segment * this.width - scrollOffset;

        for (let j = 0; j < numPoints; j++) {
          const x = offsetX + (j / (numPoints - 1)) * this.width;
          const y = profile.points[j];

          if (segment === 0 && j === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();

      ctx.restore();
    }
  }

  reset(): void {
    this.scrollOffsets = [0, 0, 0];
  }

  /**
   * Generate a terrain profile with varied peaks and valleys.
   *
   * @param numPoints - Number of points in the terrain profile
   * @param baseHeight - Base y-coordinate (higher values = lower on screen)
   * @param variation - Maximum variation from baseHeight
   * @returns Array of y-coordinates representing terrain height
   */
  private generateTerrainProfile(
    numPoints: number,
    baseHeight: number,
    variation: number
  ): number[] {
    const points: number[] = [];

    // Use sine waves and random noise for varied terrain
    const frequency1 = (Math.PI * 2) / numPoints;
    const frequency2 = (Math.PI * 4) / numPoints;

    for (let i = 0; i < numPoints; i++) {
      // Combine two sine waves of different frequencies
      const wave1 = Math.sin(i * frequency1);
      const wave2 = Math.sin(i * frequency2) * 0.5;
      const noise = (Math.random() - 0.5) * 0.3;

      // Calculate y-coordinate (baseHeight + variation pattern)
      const y = baseHeight + (wave1 + wave2 + noise) * variation;

      points.push(y);
    }

    // Ensure first and last points match for seamless wrapping
    points[numPoints - 1] = points[0];

    return points;
  }
}
