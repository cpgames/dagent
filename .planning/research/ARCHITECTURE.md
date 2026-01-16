# Unified Canvas Render Loop Architecture for React

## Research Summary

This document explores how unified canvas render loops integrate with React component lifecycles, specifically for synthwave/retrowave animated backgrounds with multiple visual layers (stars, horizon, grid, shooting stars, terrain).

---

## System Overview

```
+------------------------------------------------------------------+
|                     React Component Tree                          |
+------------------------------------------------------------------+
|                                                                   |
|  +------------------------------------------------------------+  |
|  |              SynthwaveBackground (Container)                |  |
|  |                                                             |  |
|  |   useRef ─────────────────────┬──────────────────────────   |  |
|  |   (canvasRef)                 │                             |  |
|  |                               ▼                             |  |
|  |   useRef ─────────────> AnimationController                 |  |
|  |   (animationRef)        - frameId                           |  |
|  |                         - lastTime                          |  |
|  |                         - isRunning                         |  |
|  |                               │                             |  |
|  |   useLayoutEffect ◄──────────┘                              |  |
|  |   (animation lifecycle)                                     |  |
|  |         │                                                   |  |
|  |         ▼                                                   |  |
|  |   ┌─────────────────────────────────────────────────────┐   |  |
|  |   │              Render Loop (tick)                      │   |  |
|  |   │                                                      │   |  |
|  |   │   1. Calculate deltaTime                             │   |  |
|  |   │   2. Update layer states                             │   |  |
|  |   │   3. Clear canvas                                    │   |  |
|  |   │   4. Render layers (back to front)                   │   |  |
|  |   │   5. requestAnimationFrame(tick)                     │   |  |
|  |   └─────────────────────────────────────────────────────┘   |  |
|  |                               │                             |  |
|  |                               ▼                             |  |
|  |   ┌─────────────────────────────────────────────────────┐   |  |
|  |   │                  Layer Stack                         │   |  |
|  |   │                                                      │   |  |
|  |   │   z=5  ┌─────────────┐  ShootingStarsLayer          │   |  |
|  |   │        │  ★    ★    │  (sporadic, high motion)      │   |  |
|  |   │   z=4  ├─────────────┤  StarsLayer                  │   |  |
|  |   │        │  ·  ·  ·   │  (twinkling, low motion)      │   |  |
|  |   │   z=3  ├─────────────┤  SunLayer                    │   |  |
|  |   │        │     ◐      │  (gradient, static/pulse)     │   |  |
|  |   │   z=2  ├─────────────┤  TerrainLayer                │   |  |
|  |   │        │  ▲  ▲  ▲   │  (mountains, scrolling)       │   |  |
|  |   │   z=1  ├─────────────┤  GridLayer                   │   |  |
|  |   │        │ ╔═══════╗  │  (perspective, scrolling)     │   |  |
|  |   │   z=0  ├─────────────┤  HorizonLayer                │   |  |
|  |   │        │ ▓▓▓▓▓▓▓▓▓ │  (gradient background)        │   |  |
|  |   │        └─────────────┘                               │   |  |
|  |   └─────────────────────────────────────────────────────┘   |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

---

## Component Structure

### Single Canvas Component Pattern

The recommended architecture uses a **single canvas element** managed by one React component, with internal layer composition handled through a render loop rather than multiple canvas elements.

```typescript
// src/renderer/src/components/Background/SynthwaveBackground.tsx

import React, { useRef, useLayoutEffect, useCallback } from 'react';

interface SynthwaveBackgroundProps {
  width: number;
  height: number;
  paused?: boolean;
}

interface AnimationState {
  frameId: number;
  lastTime: number;
  isRunning: boolean;
}

export const SynthwaveBackground: React.FC<SynthwaveBackgroundProps> = ({
  width,
  height,
  paused = false
}) => {
  // Canvas element reference
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animation state (mutable, doesn't trigger re-renders)
  const animationRef = useRef<AnimationState>({
    frameId: 0,
    lastTime: 0,
    isRunning: false
  });

  // Layer instances (persistent across renders)
  const layersRef = useRef<Layer[]>([]);

  // Initialize layers once
  useLayoutEffect(() => {
    layersRef.current = [
      new HorizonLayer(),
      new GridLayer(),
      new TerrainLayer(),
      new SunLayer(),
      new StarsLayer(),
      new ShootingStarsLayer()
    ];
  }, []);

  // Main render loop
  const tick = useCallback((currentTime: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const animation = animationRef.current;
    const deltaTime = currentTime - animation.lastTime;
    animation.lastTime = currentTime;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Update and render each layer
    for (const layer of layersRef.current) {
      layer.update(deltaTime, currentTime);
      layer.render(ctx, width, height);
    }

    // Schedule next frame
    if (animation.isRunning) {
      animation.frameId = requestAnimationFrame(tick);
    }
  }, [width, height]);

  // Animation lifecycle management
  useLayoutEffect(() => {
    const animation = animationRef.current;

    if (!paused) {
      animation.isRunning = true;
      animation.lastTime = performance.now();
      animation.frameId = requestAnimationFrame(tick);
    }

    // Cleanup: cancel animation frame on unmount or pause
    return () => {
      animation.isRunning = false;
      cancelAnimationFrame(animation.frameId);
    };
  }, [paused, tick]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-label="Synthwave animated background"
    />
  );
};
```

### Why useLayoutEffect Over useEffect

For animations, `useLayoutEffect` is preferred because it runs **synchronously after DOM mutations** but **before the browser paints**. This prevents a timing issue where `useEffect`'s cleanup might run after a new animation frame has already been scheduled.

```typescript
// BAD: useEffect cleanup runs asynchronously
useEffect(() => {
  const frameId = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(frameId);
  // New frame may be scheduled before cleanup runs!
}, []);

// GOOD: useLayoutEffect cleanup runs synchronously
useLayoutEffect(() => {
  const frameId = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(frameId);
  // Cleanup guaranteed before new frame
}, []);
```

---

## Render Loop Architecture

### Delta Time Pattern

Frame rates vary across devices (30fps to 144fps). Use elapsed time instead of frame counts for consistent animation speed:

```typescript
interface RenderLoopConfig {
  lastTime: number;
  accumulatedTime: number;
  fixedTimeStep: number; // e.g., 1000/60 for 60fps physics
}

const tick = (currentTime: number) => {
  const deltaTime = currentTime - config.lastTime;
  config.lastTime = currentTime;

  // Option 1: Variable timestep (smooth visuals)
  layers.forEach(layer => layer.update(deltaTime));

  // Option 2: Fixed timestep (deterministic physics)
  config.accumulatedTime += deltaTime;
  while (config.accumulatedTime >= config.fixedTimeStep) {
    layers.forEach(layer => layer.fixedUpdate(config.fixedTimeStep));
    config.accumulatedTime -= config.fixedTimeStep;
  }

  // Render
  layers.forEach(layer => layer.render(ctx));

  requestAnimationFrame(tick);
};
```

### Animation Loop Lifecycle

```
Component Mount
      │
      ▼
┌─────────────────────┐
│  Initialize Layers  │
│  (useLayoutEffect)  │
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│  Start Animation    │◄────────┐
│  (RAF scheduled)    │         │
└─────────────────────┘         │
      │                         │
      ▼                         │
┌─────────────────────┐         │
│      tick()         │         │
│  ┌───────────────┐  │         │
│  │ Calculate dt  │  │         │
│  └───────┬───────┘  │         │
│          ▼          │         │
│  ┌───────────────┐  │         │
│  │ Update layers │  │         │
│  └───────┬───────┘  │         │
│          ▼          │         │
│  ┌───────────────┐  │         │
│  │ Clear canvas  │  │         │
│  └───────┬───────┘  │         │
│          ▼          │         │
│  ┌───────────────┐  │         │
│  │ Render layers │  │         │
│  └───────┬───────┘  │         │
│          ▼          │         │
│  ┌───────────────┐  │         │
│  │ Schedule RAF  │──┼─────────┘
│  └───────────────┘  │
└─────────────────────┘
      │
      ▼ (on unmount/pause)
┌─────────────────────┐
│ cancelAnimationFrame│
│    (cleanup)        │
└─────────────────────┘
```

---

## Layer Composition Pattern

### Layer Interface

```typescript
// src/renderer/src/components/Background/layers/types.ts

export interface Layer {
  /** Update layer state based on elapsed time */
  update(deltaTime: number, currentTime: number): void;

  /** Render layer to canvas context */
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  /** Optional: Reset layer state */
  reset?(): void;

  /** Optional: Resize handler */
  resize?(width: number, height: number): void;
}

export interface LayerConfig {
  enabled: boolean;
  opacity: number;
  speed: number;
}
```

### Layer Implementation Example

```typescript
// src/renderer/src/components/Background/layers/GridLayer.ts

import { Layer } from './types';

export class GridLayer implements Layer {
  private scrollOffset = 0;
  private speed = 0.05; // units per millisecond

  // Grid configuration
  private gridSize = 50;
  private horizonY = 0.4; // 40% from top
  private vanishingPointX = 0.5; // center

  // Colors
  private lineColor = '#ff00ff';
  private lineWidth = 1;

  update(deltaTime: number, currentTime: number): void {
    // Scroll the grid forward
    this.scrollOffset = (this.scrollOffset + deltaTime * this.speed) % this.gridSize;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const horizonY = height * this.horizonY;
    const vpX = width * this.vanishingPointX;

    ctx.save();
    ctx.strokeStyle = this.lineColor;
    ctx.lineWidth = this.lineWidth;

    // Draw horizontal lines (with perspective)
    const numLines = 20;
    for (let i = 0; i <= numLines; i++) {
      const t = (i / numLines + this.scrollOffset / this.gridSize) % 1;
      const y = horizonY + Math.pow(t, 2) * (height - horizonY);

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw vertical lines (converging to vanishing point)
    const numVerticals = 15;
    for (let i = -numVerticals; i <= numVerticals; i++) {
      const bottomX = vpX + i * this.gridSize;

      ctx.beginPath();
      ctx.moveTo(vpX, horizonY);
      ctx.lineTo(bottomX, height);
      ctx.stroke();
    }

    ctx.restore();
  }
}
```

### Stars Layer with Entity Management

```typescript
// src/renderer/src/components/Background/layers/StarsLayer.ts

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

export class StarsLayer implements Layer {
  private stars: Star[] = [];
  private initialized = false;

  private initStars(width: number, height: number): void {
    const numStars = 100;
    this.stars = Array.from({ length: numStars }, () => ({
      x: Math.random() * width,
      y: Math.random() * height * 0.4, // Upper 40% only
      size: Math.random() * 2 + 0.5,
      brightness: Math.random(),
      twinkleSpeed: Math.random() * 0.002 + 0.001,
      twinklePhase: Math.random() * Math.PI * 2
    }));
    this.initialized = true;
  }

  update(deltaTime: number, currentTime: number): void {
    // Update twinkle animation
    for (const star of this.stars) {
      star.twinklePhase += star.twinkleSpeed * deltaTime;
      star.brightness = 0.5 + 0.5 * Math.sin(star.twinklePhase);
    }
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.initialized) {
      this.initStars(width, height);
    }

    for (const star of this.stars) {
      const alpha = star.brightness * 0.8 + 0.2;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  resize(width: number, height: number): void {
    // Reinitialize stars on resize
    this.initStars(width, height);
  }
}
```

### Shooting Stars Layer (Sporadic Events)

```typescript
// src/renderer/src/components/Background/layers/ShootingStarsLayer.ts

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  opacity: number;
  life: number;
  maxLife: number;
}

export class ShootingStarsLayer implements Layer {
  private shootingStars: ShootingStar[] = [];
  private timeSinceLastSpawn = 0;
  private spawnInterval = 3000; // Average 3 seconds between spawns
  private maxActive = 3;

  update(deltaTime: number, currentTime: number): void {
    // Spawn logic
    this.timeSinceLastSpawn += deltaTime;
    if (
      this.timeSinceLastSpawn > this.spawnInterval * (0.5 + Math.random()) &&
      this.shootingStars.length < this.maxActive
    ) {
      this.spawnShootingStar();
      this.timeSinceLastSpawn = 0;
    }

    // Update existing shooting stars
    for (const star of this.shootingStars) {
      star.x += star.vx * deltaTime;
      star.y += star.vy * deltaTime;
      star.life += deltaTime;
      star.opacity = 1 - star.life / star.maxLife;
    }

    // Remove expired
    this.shootingStars = this.shootingStars.filter(s => s.life < s.maxLife);
  }

  private spawnShootingStar(): void {
    this.shootingStars.push({
      x: Math.random() * 800,
      y: Math.random() * 100,
      vx: 0.3 + Math.random() * 0.2,
      vy: 0.15 + Math.random() * 0.1,
      length: 50 + Math.random() * 50,
      opacity: 1,
      life: 0,
      maxLife: 1500 + Math.random() * 1000
    });
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    for (const star of this.shootingStars) {
      const gradient = ctx.createLinearGradient(
        star.x - star.vx * star.length,
        star.y - star.vy * star.length,
        star.x,
        star.y
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, 0)`);
      gradient.addColorStop(1, `rgba(255, 255, 255, ${star.opacity})`);

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(star.x - star.vx * star.length, star.y - star.vy * star.length);
      ctx.lineTo(star.x, star.y);
      ctx.stroke();
    }
  }
}
```

---

## State Management for Animation

### Ref-Based State (No Re-renders)

Animation state should **never** trigger React re-renders. Use `useRef` for all frame-by-frame mutable values:

```typescript
// GOOD: Animation state in refs
const animationRef = useRef({
  frameId: 0,
  lastTime: 0,
  isRunning: false,
  scrollOffset: 0,
  entities: [] as Entity[]
});

// BAD: Animation state in useState (causes re-renders every frame!)
const [scrollOffset, setScrollOffset] = useState(0);
```

### React State for Configuration

Use `useState` only for values that should trigger visual updates outside the canvas:

```typescript
interface BackgroundConfig {
  paused: boolean;
  layerVisibility: Record<string, boolean>;
  colorScheme: 'synthwave' | 'outrun' | 'neon';
  animationSpeed: number;
}

const [config, setConfig] = useState<BackgroundConfig>({
  paused: false,
  layerVisibility: {
    horizon: true,
    grid: true,
    terrain: true,
    sun: true,
    stars: true,
    shootingStars: true
  },
  colorScheme: 'synthwave',
  animationSpeed: 1.0
});

// Apply config changes to layers
useEffect(() => {
  layersRef.current.forEach(layer => {
    if ('setSpeed' in layer) {
      layer.setSpeed(config.animationSpeed);
    }
  });
}, [config.animationSpeed]);
```

### Syncing React State with Animation

When you need to sync animation state with React (e.g., for UI display), do it sparingly:

```typescript
// Only sync when animation starts/stops, not every frame
const [isPlaying, setIsPlaying] = useState(true);

const handlePlayPause = useCallback(() => {
  const animation = animationRef.current;
  animation.isRunning = !animation.isRunning;
  setIsPlaying(animation.isRunning); // Sync to React

  if (animation.isRunning) {
    animation.lastTime = performance.now();
    animation.frameId = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(animation.frameId);
  }
}, [tick]);
```

---

## Performance Optimization

### Canvas Context Settings

```typescript
// Disable alpha for opaque backgrounds (performance boost)
const ctx = canvas.getContext('2d', { alpha: false });

// Round coordinates to avoid sub-pixel rendering
const x = Math.floor(entity.x);
const y = Math.floor(entity.y);
```

### Layer Caching with OffscreenCanvas

For static or slowly-changing layers, render to an offscreen canvas and composite:

```typescript
export class CachedLayer implements Layer {
  private cache: OffscreenCanvas | null = null;
  private dirty = true;

  markDirty(): void {
    this.dirty = true;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Create/resize cache if needed
    if (!this.cache || this.cache.width !== width || this.cache.height !== height) {
      this.cache = new OffscreenCanvas(width, height);
      this.dirty = true;
    }

    // Only redraw to cache if dirty
    if (this.dirty) {
      const cacheCtx = this.cache.getContext('2d')!;
      this.renderToCache(cacheCtx, width, height);
      this.dirty = false;
    }

    // Blit cache to main canvas
    ctx.drawImage(this.cache, 0, 0);
  }

  protected renderToCache(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
    // Override in subclass
  }
}
```

### Batch Rendering

Minimize context state changes by batching similar operations:

```typescript
render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  // BAD: State changes every star
  for (const star of this.stars) {
    ctx.fillStyle = star.color;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // GOOD: Group by color, single state change
  const starsByColor = groupBy(this.stars, 'color');
  for (const [color, stars] of Object.entries(starsByColor)) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const star of stars) {
      ctx.moveTo(star.x + star.size, star.y);
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    }
    ctx.fill(); // Single fill for all same-colored stars
  }
}
```

---

## Complete File Structure

```
src/renderer/src/components/Background/
├── SynthwaveBackground.tsx      # Main component
├── SynthwaveBackground.css      # Styling
├── types.ts                     # Shared types
├── hooks/
│   ├── useAnimationLoop.ts      # Custom hook for RAF management
│   └── useCanvasContext.ts      # Hook for canvas context
└── layers/
    ├── types.ts                 # Layer interface
    ├── Layer.ts                 # Base layer class
    ├── HorizonLayer.ts          # Gradient background
    ├── SunLayer.ts              # Neon sun with glow
    ├── GridLayer.ts             # Perspective grid
    ├── TerrainLayer.ts          # Mountain silhouettes
    ├── StarsLayer.ts            # Twinkling stars
    └── ShootingStarsLayer.ts    # Sporadic shooting stars
```

---

## Sources

### React + Canvas Animation Patterns
- [Using requestAnimationFrame with React Hooks | CSS-Tricks](https://css-tricks.com/using-requestanimationframe-with-react-hooks/)
- [Animation with Canvas and requestAnimationFrame() in React | DEV Community](https://dev.to/ptifur/animation-with-canvas-and-requestanimationframe-in-react-5ccj)
- [RequestAnimationFrame and UseEffect vs UseLayoutEffect | Jakub Arnold's Blog](https://blog.jakuba.net/request-animation-frame-and-use-effect-vs-use-layout-effect/)
- [React TypeScript Canvas Animation Gist](https://gist.github.com/dsebastien/417025e685e7f1ddf52056eac7cdf3a7)

### Canvas Layer Architecture
- [HTML5 Canvas Layer Management | Konva](https://konvajs.org/docs/performance/Layer_Management.html)
- [Using Multiple HTML5 Canvases as Layers | Unknown Kadath](https://html5.litten.com/using-multiple-html5-canvases-as-layers/)
- [Optimizing canvas | MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [OffscreenCanvas | web.dev](https://web.dev/articles/offscreen-canvas)

### Synthwave/Retrowave Implementations
- [Building a Vaporwave scene with Three.js | Maxime Heckel](https://blog.maximeheckel.com/posts/vaporwave-3d-scene-with-threejs/)
- [Synthwave Vibes Canvas | Greg Tatum](https://gregtatum.com/interactive/2021/canvas-013-synthwave-vibes/)
- [retrowave-scene | GitHub](https://github.com/Moukrea/retrowave-scene)

### TypeScript Canvas Patterns
- [How to Compose Canvas Animations in TypeScript | freeCodeCamp](https://www.freecodecamp.org/news/how-to-compose-canvas-animations-in-typescript-9368dfa29028)
- [JavaScript Canvas Sprite Animation | Viacheslav Demianov](https://demyanov.dev/javascript-canvas-sprite-animation)
- [SpriteJS | GitHub](https://github.com/spritejs/spritejs)
