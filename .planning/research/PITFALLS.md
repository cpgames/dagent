# Canvas Animation Pitfalls in React/Electron

Research document for implementing synthwave/retrowave animated canvas backgrounds in DAGent (Electron + React + TypeScript).

## Critical Pitfalls

### 1. Memory Leaks

**Uncleared Animation Frames**
The most common memory leak occurs when `requestAnimationFrame` is not properly cancelled:
```javascript
// BAD - Memory leak: animation continues after unmount
useEffect(() => {
  const animate = () => {
    // draw logic
    requestAnimationFrame(animate);
  };
  animate();
}, []);

// GOOD - Proper cleanup
useEffect(() => {
  const requestRef = { current: null };
  const animate = () => {
    // draw logic
    requestRef.current = requestAnimationFrame(animate);
  };
  requestRef.current = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(requestRef.current);
}, []);
```

**Particle/Object Accumulation**
Particles or animated objects that pile up without being efficiently removed cause garbage collection problems. Always maintain a fixed pool or implement proper lifecycle management for animated entities.

**Canvas Mount/Unmount Cycles**
Repeatedly mounting/unmounting canvas elements causes memory to grow rapidly as resources are not garbage collected. Canvas literally forces a context loss on unmount - this is standard practice to prevent leaks, but can cause issues if not handled.

**Closures Holding References**
Large data structures referenced in animation callbacks can be kept alive by closures:
```javascript
// BAD - Large array kept alive by closure
const bigData = new Array(10000).fill(complexObject);
const animate = () => {
  // bigData is kept alive even if not used
};
```

**Event Listener Accumulation**
Never-removed event listeners (resize, scroll, etc.) continue to hold references:
```javascript
// Always clean up event listeners
useEffect(() => {
  const handleResize = () => { /* ... */ };
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

### 2. Performance Issues

**Frame Budget Violation**
At 60fps, you have only 16.67ms per frame. Touching the DOM during animation often blows this budget immediately.

**Full Canvas Redraws**
Clearing and redrawing the entire canvas every frame is expensive:
```javascript
// BAD - Full clear every frame
ctx.clearRect(0, 0, canvas.width, canvas.height);

// BETTER - Clear only changed regions
ctx.clearRect(dirtyRegion.x, dirtyRegion.y, dirtyRegion.w, dirtyRegion.h);
```

**Sub-Pixel Rendering**
Non-integer coordinates force anti-aliasing calculations:
```javascript
// BAD - Sub-pixel coordinates
ctx.drawImage(img, 10.5, 20.3);

// GOOD - Rounded coordinates
ctx.drawImage(img, Math.floor(10.5), Math.floor(20.3));
```

**Uncached Repeated Drawings**
Drawing the same static elements repeatedly wastes cycles:
```javascript
// Cache static elements on offscreen canvas
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');
// Draw complex static background once
drawComplexBackground(offscreenCtx);

// In animation loop, just blit the cached result
ctx.drawImage(offscreenCanvas, 0, 0);
```

---

## React-Specific Issues

### 1. useEffect vs useLayoutEffect Timing

**The Problem:**
A new animation frame can be requested before `useEffect` cleanup runs, causing the animation to "escape" cleanup logic.

```javascript
// BAD - Timing issue with useEffect
useEffect(() => {
  let frameId;
  const animate = () => {
    frameId = requestAnimationFrame(animate);
  };
  animate();
  return () => cancelAnimationFrame(frameId);
}, []);

// GOOD - useLayoutEffect runs synchronously
useLayoutEffect(() => {
  let frameId;
  const animate = () => {
    frameId = requestAnimationFrame(animate);
  };
  animate();
  return () => cancelAnimationFrame(frameId);
}, []);
```

`useLayoutEffect` runs synchronously after DOM updates, preventing the browser from re-painting between component render and cleanup.

### 2. State Updates in Animation Loop

**The Problem:**
Using `setState` in animation loops triggers re-renders, which can cause performance issues or infinite loops.

```javascript
// BAD - State update causes re-render
const [position, setPosition] = useState(0);
useEffect(() => {
  const animate = () => {
    setPosition(p => p + 1); // Re-render every frame!
    requestAnimationFrame(animate);
  };
  animate();
}, []);

// GOOD - Use refs for animation state
const positionRef = useRef(0);
useEffect(() => {
  const animate = () => {
    positionRef.current += 1;
    // Draw using ref value
    requestAnimationFrame(animate);
  };
  animate();
}, []);
```

### 3. Dependency Array Mistakes

**Empty Array Required for Animation Loops:**
```javascript
// BAD - Recreates animation on every prop change
useEffect(() => {
  const animate = () => { /* ... */ };
  requestAnimationFrame(animate);
  return () => cancelAnimationFrame(frameId);
}, [someProp]); // Creates multiple animation loops!

// GOOD - Initialize once, use refs for dynamic values
const somePropRef = useRef(someProp);
useEffect(() => {
  somePropRef.current = someProp;
}, [someProp]);

useEffect(() => {
  const animate = () => {
    // Use somePropRef.current
  };
  requestAnimationFrame(animate);
  return () => cancelAnimationFrame(frameId);
}, []); // Run once
```

### 4. Recommended Custom Hook Pattern

```typescript
const useAnimationFrame = (callback: (deltaTime: number) => void) => {
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();

  const animate = useCallback((time: number) => {
    if (previousTimeRef.current !== undefined) {
      const deltaTime = time - previousTimeRef.current;
      callback(deltaTime);
    }
    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  }, [callback]);

  useLayoutEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [animate]);
};
```

---

## Electron-Specific Issues

### 1. GPU Process Crashes

**Symptoms:**
- Canvas elements go completely blank
- Draw calls succeed without error but nothing renders
- Exit code `-1073741819` on Windows (DirectX initialization issue)

**Causes:**
- DirectX resource initialization issues (especially in Electron v28+)
- Multiple pages placing too high GPU demand
- GPU switching on laptops (integrated vs discrete)
- Resource constraints / low GPU memory

**Detection:**
```javascript
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  console.error('WebGL context lost');
});

canvas.addEventListener('webglcontextrestored', () => {
  console.log('WebGL context restored - reinitialize');
  reinitializeCanvas();
});
```

### 2. Canvas Performance Degradation by Version

Historical issues to be aware of:
- **Electron 1.8.x**: `drawImage` extremely slow on Linux
- **Electron 2.0.x**: 5-8x slowdown on macOS compared to 1.6.x
- **Electron 4.x**: UI choppy compared to 2.0.x (GPU rendering possibly disabled)
- **Electron v28**: Chromium 120 changed rendering pipeline significantly

**Mitigation:**
- Test canvas performance after Electron upgrades
- Check `chrome://gpu` for hardware acceleration status
- Consider fallback rendering modes

### 3. Hardware Acceleration Issues

**Symptoms:**
- Canvas shows "Software only, hardware acceleration unavailable"
- Choppy animations despite capable hardware
- High CPU usage instead of GPU

**Diagnostic:**
```javascript
// Check GPU status in main process
const { app } = require('electron');
app.on('ready', () => {
  console.log(app.getGPUFeatureStatus());
});
```

**Flags to consider:**
```javascript
// In main process before app ready
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
// Or disable if causing issues:
app.disableHardwareAcceleration();
```

### 4. Renderer Process Considerations

**Main Thread Blocking:**
Canvas rendering in the renderer process can block UI interactions. For smooth 60fps:
- Use `requestIdleCallback()` for non-critical operations
- Consider OffscreenCanvas with Web Workers for heavy rendering
- Avoid synchronous IPC during animation

**OffscreenCanvas (When Applicable):**
```javascript
// Transfer canvas to worker for dedicated thread
const offscreen = canvas.transferControlToOffscreen();
worker.postMessage({ canvas: offscreen }, [offscreen]);
```

**Note:** OffscreenCanvas + WebGL not supported in Safari.

### 5. Context Loss on Window Events

Context can be lost when:
- Window is minimized/restored
- Display settings change
- User switches GPU (laptop power modes)
- System wakes from sleep

---

## Accessibility Concerns

### 1. Reduced Motion Preference

**WCAG Requirement:**
Users with vestibular disorders, ADHD, epilepsy, or migraines may need reduced/no motion. Affects 70+ million people globally.

**CSS Detection:**
```css
@media (prefers-reduced-motion: reduce) {
  .animated-background {
    animation: none;
  }
}
```

**JavaScript Detection (Required for Canvas):**
```javascript
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

// Listen for changes
const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
mediaQuery.addEventListener('change', (e) => {
  if (e.matches) {
    stopAnimation();
    showStaticBackground();
  } else {
    startAnimation();
  }
});
```

### 2. Implementation Strategies

**Option A: Static Alternative**
Replace animated canvas with static image when reduced motion preferred.

**Option B: Minimal Motion**
Reduce animation intensity (slower, less movement) rather than removing entirely:
```javascript
const animationSpeed = prefersReducedMotion ? 0.1 : 1.0;
```

**Option C: User Control**
Provide explicit pause/play controls regardless of system preference:
```javascript
// WCAG 2.2.2 "Pause, Stop, Hide" compliance
<button onClick={() => setAnimating(!animating)}>
  {animating ? 'Pause Background' : 'Play Background'}
</button>
```

### 3. What NOT to Do

- Don't remove ALL animation - some motion aids understanding
- Don't ignore the preference entirely
- Don't make motion essential to using the application

---

## Prevention Strategies

### 1. Architecture Patterns

**Single Canvas Instance:**
```typescript
// Use context to share single canvas across app
const CanvasContext = createContext<HTMLCanvasElement | null>(null);

// Never unmount the canvas, route content instead
function App() {
  return (
    <CanvasBackground>
      <Router>
        <Routes />
      </Router>
    </CanvasBackground>
  );
}
```

**Layer Separation:**
```typescript
// Separate static and dynamic content
const layers = {
  background: createOffscreenCanvas(), // Static gradient/sky
  grid: createOffscreenCanvas(),        // Animated grid
  effects: createOffscreenCanvas(),     // Particles/glow
};
```

### 2. Performance Monitoring

```typescript
// Track frame timing
let lastFrameTime = performance.now();
let frameCount = 0;
let fps = 60;

const animate = (currentTime: number) => {
  const deltaTime = currentTime - lastFrameTime;

  // Skip frame if too fast (>120fps)
  if (deltaTime < 8) {
    requestAnimationFrame(animate);
    return;
  }

  // Track FPS
  frameCount++;
  if (frameCount % 60 === 0) {
    fps = 1000 / deltaTime;
    if (fps < 30) {
      console.warn('Low FPS detected:', fps);
      reduceAnimationComplexity();
    }
  }

  lastFrameTime = currentTime;
  // ... render
};
```

### 3. Synthwave-Specific Optimizations

**Grid Animation:**
```typescript
// Cache grid lines, only update offset
const gridOffset = useRef(0);
const cachedGrid = useMemo(() => {
  // Pre-render grid to offscreen canvas
  return renderGridToOffscreen();
}, []);

const animate = () => {
  gridOffset.current = (gridOffset.current + speed) % gridSpacing;
  // Draw cached grid with offset transform
  ctx.drawImage(cachedGrid, 0, gridOffset.current);
};
```

**Glow Effects:**
```typescript
// Pre-render glow to avoid repeated shadow blur
const glowCanvas = document.createElement('canvas');
const glowCtx = glowCanvas.getContext('2d');
glowCtx.shadowBlur = 20;
glowCtx.shadowColor = '#ff00ff';
// Draw shape once with glow
glowCtx.fillStyle = '#ff00ff';
glowCtx.fillRect(10, 10, 100, 100);

// In animation loop, just blit the pre-rendered glow
ctx.drawImage(glowCanvas, x, y);
```

**Color Palette Constants:**
```typescript
// Avoid creating gradient objects every frame
const gradientCache = new Map<string, CanvasGradient>();

function getCachedGradient(ctx: CanvasRenderingContext2D, key: string): CanvasGradient {
  if (!gradientCache.has(key)) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0a0a0a');
    gradient.addColorStop(0.5, '#1a0033');
    gradient.addColorStop(1, '#ff006e');
    gradientCache.set(key, gradient);
  }
  return gradientCache.get(key)!;
}
```

### 4. Resource Cleanup Checklist

```typescript
useLayoutEffect(() => {
  const canvas = canvasRef.current;
  const ctx = canvas?.getContext('2d');
  let frameId: number;
  let resizeObserver: ResizeObserver;

  // Setup
  const animate = () => {
    // ... render
    frameId = requestAnimationFrame(animate);
  };

  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(canvas);

  frameId = requestAnimationFrame(animate);

  // Cleanup - order matters!
  return () => {
    // 1. Stop animation
    cancelAnimationFrame(frameId);

    // 2. Remove observers/listeners
    resizeObserver.disconnect();

    // 3. Clear any cached resources
    gradientCache.clear();

    // 4. Nullify references
    // (context will be lost on canvas unmount automatically)
  };
}, []);
```

---

## Recovery Strategies

### 1. WebGL/Canvas Context Loss Recovery

```typescript
function useCanvasWithRecovery(canvasRef: RefObject<HTMLCanvasElement>) {
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleContextLost = (e: Event) => {
      e.preventDefault(); // Allow recovery
      setContextLost(true);
      console.error('Canvas context lost - pausing animation');
    };

    const handleContextRestored = () => {
      setContextLost(false);
      console.log('Canvas context restored - reinitializing');
      reinitializeResources();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, []);

  return { contextLost };
}
```

### 2. Performance Degradation Recovery

```typescript
// Adaptive quality based on performance
const qualityLevels = {
  high: { particleCount: 500, gridLines: 50, glowEnabled: true },
  medium: { particleCount: 200, gridLines: 30, glowEnabled: true },
  low: { particleCount: 50, gridLines: 15, glowEnabled: false },
};

let currentQuality = 'high';
let lowFpsCount = 0;

const checkPerformance = (fps: number) => {
  if (fps < 30) {
    lowFpsCount++;
    if (lowFpsCount > 30) { // 30 consecutive low frames
      downgradeQuality();
      lowFpsCount = 0;
    }
  } else {
    lowFpsCount = 0;
  }
};

const downgradeQuality = () => {
  if (currentQuality === 'high') currentQuality = 'medium';
  else if (currentQuality === 'medium') currentQuality = 'low';
  applyQualitySettings(qualityLevels[currentQuality]);
};
```

### 3. Memory Leak Detection

```typescript
// Development-only memory monitoring
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    if (performance.memory) {
      const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
      const usedMB = usedJSHeapSize / 1024 / 1024;
      const limitMB = jsHeapSizeLimit / 1024 / 1024;

      if (usedMB > limitMB * 0.8) {
        console.warn(`High memory usage: ${usedMB.toFixed(2)}MB / ${limitMB.toFixed(2)}MB`);
      }
    }
  }, 5000);
}
```

### 4. Fallback to Static Background

```typescript
function CanvasBackground() {
  const [canvasSupported, setCanvasSupported] = useState(true);
  const [tooSlow, setTooSlow] = useState(false);

  // Fallback conditions
  const useFallback = !canvasSupported || tooSlow || prefersReducedMotion;

  if (useFallback) {
    return (
      <div
        className="static-synthwave-bg"
        style={{
          background: 'linear-gradient(to bottom, #0a0a0a, #1a0033, #ff006e)',
        }}
      />
    );
  }

  return <AnimatedCanvas onError={() => setCanvasSupported(false)} />;
}
```

---

## Sources

### Memory Leaks
- [Memory Leaks in JavaScript & React - DEV Community](https://dev.to/fazal_mansuri_/memory-leaks-in-javascript-react-the-hidden-enemy-74p)
- [Konva - How to Avoid Memory Leaks](https://konvajs.org/docs/performance/Avoid_Memory_Leaks.html)
- [Illyriad - Fix Memory Leaks: Animating HTML5 Canvas](https://www.illyriad.co.uk/blog/2011/09/fix-memory-leaks-animating-html5-canvas/)

### React + Canvas
- [CSS-Tricks - Using requestAnimationFrame with React Hooks](https://css-tricks.com/using-requestanimationframe-with-react-hooks/)
- [RequestAnimationFrame and UseEffect vs UseLayoutEffect](https://blog.jakuba.net/request-animation-frame-and-use-effect-vs-use-layout-effect/)
- [30 Seconds of Code - useRequestAnimationFrame hook](https://www.30secondsofcode.org/react/s/use-request-animation-frame/)

### Electron Issues
- [Electron Performance Documentation](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Electron Issue #12042 - Canvas Performance Degradation](https://github.com/electron/electron/issues/12042)
- [Electron Issue #17386 - Canvases Blank After GPU Crash](https://github.com/electron/electron/issues/17386)
- [Fixing Electron v28 Rendering Issues](https://markaicode.com/electron-v28-rendering-issues-fixed/)

### Canvas Optimization
- [MDN - Optimizing Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [MDN - Animation Performance and Frame Rate](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Animation_performance_and_frame_rate)
- [Remy Sharp - Optimising a Canvas Animation](https://remysharp.com/2015/07/13/optimising-a-canvas-animation)
- [Chris Courses - Standardize Framerate for Different Monitors](https://chriscourses.com/blog/standardize-your-javascript-games-framerate-for-different-monitors)

### Accessibility
- [Josh W. Comeau - Accessible Animations with prefers-reduced-motion](https://www.joshwcomeau.com/react/prefers-reduced-motion/)
- [MDN - prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)
- [W3C - WCAG C39: Using prefers-reduced-motion](https://www.w3.org/WAI/WCAG21/Techniques/css/C39)
- [Tatiana Mac - No-Motion-First Approach](https://www.tatianamac.com/posts/prefers-reduced-motion)

### WebGL Context Recovery
- [Khronos - Handling Context Lost](https://www.khronos.org/webgl/wiki/HandlingContextLost)
- [MDN - webglcontextrestored event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextrestored_event)

### OffscreenCanvas & Workers
- [MDN - OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [NewInWeb - Improved Performance with OffscreenCanvas](https://newinweb.com/2018/09/10/offscreen-canvas/)
- [react-three-offscreen](https://github.com/pmndrs/react-three-offscreen)
