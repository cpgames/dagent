# Canvas Animation Stack Research

Research for unified canvas-based animated backgrounds (synthwave/retrowave aesthetic).

**Project Context**: Electron 33 + React 19 + TypeScript 5.9 + Tailwind 4

---

## Recommended Technology Stack

### Core Recommendation: Vanilla Canvas 2D with Custom Hook

For DAGent's use case (starfield particles, horizon glow, grid lines, shooting stars, terrain silhouettes), **vanilla Canvas 2D with requestAnimationFrame** is the recommended approach.

**Why not PixiJS/WebGL?**
- Overhead not justified for ~500-1000 particles
- Canvas 2D handles this load at 60fps easily
- Simpler debugging and maintenance
- No additional bundle size (~150KB savings)
- WebGL shines at 5000+ elements; we're well under that threshold

### Technology Versions

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.x | Already installed |
| TypeScript | 5.9.x | Already installed |
| Canvas 2D API | Native | Primary rendering |
| requestAnimationFrame | Native | Animation loop |

---

## Core Libraries (Required)

### 1. Custom useAnimationFrame Hook

Write your own hook for maximum control. No external dependencies needed.

```typescript
// src/renderer/src/hooks/useAnimationFrame.ts
import { useRef, useLayoutEffect, useCallback } from 'react'

interface AnimationState {
  time: number      // Total elapsed time (seconds)
  delta: number     // Time since last frame (seconds)
}

export function useAnimationFrame(
  callback: (state: AnimationState) => void,
  isRunning: boolean = true
) {
  const requestRef = useRef<number>(0)
  const previousTimeRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const callbackRef = useRef(callback)

  // Update callback ref on each render (avoids stale closure)
  callbackRef.current = callback

  const animate = useCallback((timestamp: number) => {
    if (startTimeRef.current === 0) {
      startTimeRef.current = timestamp
      previousTimeRef.current = timestamp
    }

    const delta = (timestamp - previousTimeRef.current) / 1000
    const time = (timestamp - startTimeRef.current) / 1000
    previousTimeRef.current = timestamp

    callbackRef.current({ time, delta })
    requestRef.current = requestAnimationFrame(animate)
  }, [])

  // useLayoutEffect prevents flicker on mount/unmount
  useLayoutEffect(() => {
    if (!isRunning) return

    requestRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(requestRef.current)
  }, [isRunning, animate])
}
```

### 2. Canvas Ref Pattern

```typescript
// src/renderer/src/components/Background/SynthwaveCanvas.tsx
import { useRef, useEffect } from 'react'
import { useAnimationFrame } from '../../hooks/useAnimationFrame'

export function SynthwaveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    ctxRef.current = canvas.getContext('2d', {
      alpha: false,           // Opaque = faster
      desynchronized: true    // Reduces latency in Electron
    })

    // Handle resize
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      ctxRef.current?.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useAnimationFrame(({ time, delta }) => {
    const ctx = ctxRef.current
    if (!ctx) return

    // Clear and draw
    ctx.fillStyle = '#0a0a1a'
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)

    // Draw layers in order:
    // 1. Sky gradient
    // 2. Starfield particles
    // 3. Horizon glow
    // 4. Terrain silhouettes
    // 5. Grid lines
    // 6. Shooting stars
  })

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
```

---

## Optional Libraries (If Needed Later)

### If Performance Becomes an Issue (5000+ particles)

```bash
npm install pixi.js@^8.15.0 @pixi/react@^8.0.0
```

**PixiJS 8** - WebGL/WebGPU renderer
- Only for React 19 (perfect for DAGent)
- Tree-shakeable with `extend()` API
- Automatic batching for sprites/particles
- ~150KB additional bundle

### If Complex Easing/Tweens Needed

```bash
npm install gsap@^3.12.0
```

**GSAP** - Animation timing
- Excellent easing functions
- Timeline sequencing
- ~60KB additional bundle

---

## What NOT to Use

### Outdated/Problematic Libraries

| Library | Issue |
|---------|-------|
| `react-canvas` | Abandoned, no React 19 support |
| `@inlet/react-pixi` | Deprecated, replaced by `@pixi/react` |
| `react-pixi-fiber` | Unmaintained since 2021 |
| `paper.js` | Poor performance for animations |
| `two.js` | Limited compared to alternatives |
| `easeljs/createjs` | Effectively abandoned |

### Antipatterns to Avoid

1. **setInterval for animation** - Use requestAnimationFrame instead
2. **Redrawing unchanged regions** - Only redraw what moves
3. **Creating objects in render loop** - Pre-allocate particles
4. **Using useEffect for RAF** - Use useLayoutEffect to prevent flicker
5. **Forgetting cleanup** - Always cancelAnimationFrame on unmount
6. **Re-creating context every frame** - Cache the 2D context

---

## Performance Optimization Patterns

### 1. Object Pooling for Particles

```typescript
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
  active: boolean
}

class ParticlePool {
  private particles: Particle[] = []
  private activeCount = 0

  constructor(maxSize: number) {
    for (let i = 0; i < maxSize; i++) {
      this.particles.push({
        x: 0, y: 0, vx: 0, vy: 0,
        size: 1, alpha: 1, active: false
      })
    }
  }

  spawn(): Particle | null {
    const particle = this.particles.find(p => !p.active)
    if (particle) {
      particle.active = true
      this.activeCount++
    }
    return particle ?? null
  }

  release(particle: Particle) {
    particle.active = false
    this.activeCount--
  }

  forEach(fn: (p: Particle) => void) {
    for (const p of this.particles) {
      if (p.active) fn(p)
    }
  }
}
```

### 2. Layered Canvas Pattern

For complex scenes, use multiple stacked canvases:

```typescript
// Static layer (terrain, grid) - redraw only on resize
// Dynamic layer (particles, shooting stars) - redraw every frame

<div className="background-stack">
  <canvas ref={staticRef} className="layer static" />
  <canvas ref={dynamicRef} className="layer dynamic" />
</div>
```

### 3. Visibility-based Pause

```typescript
useEffect(() => {
  const handleVisibility = () => {
    setIsRunning(!document.hidden)
  }
  document.addEventListener('visibilitychange', handleVisibility)
  return () => document.removeEventListener('visibilitychange', handleVisibility)
}, [])
```

---

## Electron-Specific Considerations

### Hardware Acceleration

Ensure hardware acceleration is enabled in Electron:

```typescript
// main/index.ts
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
```

### OffscreenCanvas (Optional - Advanced)

For very heavy animations, consider OffscreenCanvas in a Web Worker:

```typescript
// Transfers canvas rendering to background thread
const offscreen = canvas.transferControlToOffscreen()
worker.postMessage({ canvas: offscreen }, [offscreen])
```

**Caveats:**
- Safari support is limited
- Communication overhead may negate benefits for simple animations
- Only worthwhile for CPU-bound rendering (10000+ particles)

---

## Installation Commands

### Minimal (Recommended)

No additional packages needed. Use built-in APIs.

### With Optional Enhancements

```bash
# If you need PixiJS later (WebGL rendering)
npm install pixi.js@^8.15.0 @pixi/react@^8.0.0

# If you need advanced animation timing
npm install gsap@^3.12.0

# If you want a pre-built RAF hook (optional, small)
npm install use-animation-frame@^0.2.1
```

---

## Implementation Priority

1. **Phase 1**: Custom useAnimationFrame hook
2. **Phase 2**: Single unified canvas component
3. **Phase 3**: Particle system with object pooling
4. **Phase 4**: Layer rendering (sky, stars, grid, terrain)
5. **Phase 5**: Shooting star system
6. **Optional**: Add PixiJS if performance issues arise (unlikely)

---

## References

- [Canvas Animation with React Hooks (CSS-Tricks)](https://css-tricks.com/using-requestanimationframe-with-react-hooks/)
- [useLayoutEffect for RAF (Jakub Arnold)](https://blog.jakuba.net/request-animation-frame-and-use-effect-vs-use-layout-effect/)
- [PixiJS v8 React Integration](https://pixijs.com/blog/pixi-react-v8-live)
- [Canvas Performance Optimization (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [WebGL vs Canvas 2D Performance](https://semisignal.com/a-look-at-2d-vs-webgl-canvas-performance/)
- [OffscreenCanvas (web.dev)](https://web.dev/articles/offscreen-canvas)
- [Starfield Visualization Tutorial](https://kaeruct.github.io/posts/2024/08/31/starfield-visualization-js/)
- [Canvas Engines Benchmark](https://benchmarks.slaylines.io/)
