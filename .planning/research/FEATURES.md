# Synthwave/Retrowave Canvas Background Research

Research findings for implementing a unified synthwave canvas background system with starfield, horizon glow, perspective grid, shooting stars, and terrain silhouettes.

## Table Stakes (Must-Have for Synthwave Aesthetic)

### 1. Color Palette

The synthwave aesthetic is defined by specific color ranges:

| Element | Primary Colors | Hex Values |
|---------|---------------|------------|
| Sky gradient | Deep purple to pink | `#1b2853` -> `#162b79` -> `#f222ff` |
| Sun | Yellow to orange to pink | `#ffd319`, `#ff901f`, `#ff2975` |
| Grid lines | Cyan/magenta neon | `#00f0ff`, `#ff2975`, `#00e4ff` |
| Horizon glow | Hot pink/magenta | `#f222ff`, `#ff2975`, `#e92077` |
| Stars | White with slight tint | `#ffffff`, `#f9ceff` |
| Mountains | Dark silhouette | `#000000`, `#0a0a0a` with cyan edge glow |

**Canonical Synthwave Sunset Palette:**
- `#ffd319` - Bright yellow (sun center)
- `#ff901f` - Orange (sun mid)
- `#ff2975` - Neon pink (sun outer/horizon)
- `#f222ff` - Vibrant magenta (sky accent)
- `#8c1eff` - Deep blue-purple (upper sky)

### 2. Perspective Grid

Essential characteristics:
- **Perspective**: `50vh` to `100vh` (CSS) or FOV 60-90 degrees (canvas)
- **Rotation**: `rotateX(45deg)` to `rotateX(60deg)` for horizon tilt
- **Grid spacing**: 30-50px base cell size
- **Line color**: Cyan `rgba(0,240,255,0.7)` or magenta `rgba(255,41,117,0.7)`
- **Glow effect**: `shadowBlur: 10-20` with matching shadowColor
- **Animation**: Grid moves toward viewer at 30-60px/second

### 3. Starfield

Minimum requirements:
- **Star count**: 100-400 stars (360 is a good default)
- **Size range**: 0.5px to 2.2px radius
- **Opacity**: 0.4 base with 0.5 flicker amplitude (range: 0.4-0.9)
- **Distribution**: Random across canvas, denser toward top
- **Flicker**: Sinusoidal animation at `sin(time * 0.0015 + offset)`

### 4. Horizon Glow

The bottom horizon must have:
- **Radial gradient**: Center at horizon line, expanding upward
- **Colors**: Pink `#ff2975` or magenta `#f222ff` fading to transparent
- **Blend mode**: Color Dodge or Linear Dodge for intensity
- **Position**: Anchored to horizon line (typically 60-70% from top)

### 5. Basic Sun (if included)

- **Gradient**: Radial from yellow center to pink/orange edge
- **Colors**: `#faf09d` (center) -> `#fc9093` (mid) -> `#e92077` (edge)
- **Position**: Centered horizontally, sitting on horizon
- **Size**: 200-400px diameter depending on viewport

## Differentiators (Optional Enhancements)

### 1. Segmented/Striped Sun

The iconic synthwave sun has horizontal black stripes:
- **Stripe count**: 5-10 horizontal bars
- **Stripe thickness**: Increases toward bottom (perspective effect)
- **Stripe spacing**: Variable, closer at top, wider at bottom
- **Animation**: Stripes can animate downward slowly
- **Implementation**: Linear gradient with transparent gaps or clip-path

### 2. Shooting Stars/Meteors

Premium visual enhancement:
- **Spawn frequency**: 1% chance per frame (`Math.random() < 0.01`)
- **Velocity**: 3-5px/frame horizontal, 1-2.5px/frame vertical
- **Trail length**: 35-50px gradient fade
- **Opacity**: Fades from 1.0 at head to 0 at tail
- **Color**: White `#ffffff` or slight cyan tint `#00f0ff`
- **Max concurrent**: 1-3 at a time to avoid clutter

### 3. Terrain Silhouettes

Mountain/city silhouettes add depth:
- **Layers**: 2-3 parallax layers at different depths
- **Generation**: Sine wave superposition or Perlin noise
- **Color**: Pure black `#000000` with optional edge glow
- **Edge glow**: Cyan `#00e4ff` outer glow, Color Dodge blend
- **Movement**: Slower layers move slower (parallax)

### 4. CRT/Scanline Effect

Authentic retro feel:
- **Scanlines**: 1-2px dark lines every 3-4px
- **Implementation**: Repeating linear gradient overlay
- **Opacity**: 10-30% (`rgba(0,0,0,0.1)` to `rgba(0,0,0,0.3)`)
- **Optional**: Subtle screen flicker at 0.5-1Hz

### 5. Chromatic Aberration

Color fringing at edges:
- **Offset**: 1-3px RGB channel separation
- **Location**: Strongest at screen edges
- **Implementation**: Multiple canvas layers with offset

### 6. Star Rotation

Adds dynamism to starfield:
- **Angular speed**: 0.00015 to 0.00045 radians/frame
- **Center**: Canvas center or slightly offset
- **Effect**: Slow spiral motion of entire starfield

## Effect Specifications

### Starfield Parameters

```typescript
interface StarfieldConfig {
  starCount: number;        // 100-400, default: 360
  minSize: number;          // 0.5px
  maxSize: number;          // 2.2px
  baseOpacity: number;      // 0.4
  flickerAmplitude: number; // 0.5
  flickerSpeed: number;     // 0.0015 (radians/ms)
  color: string;            // '#ffffff'
  glowBlur: number;         // 0-5px (optional)
}
```

### Grid Parameters

```typescript
interface GridConfig {
  cellSize: number;         // 30-50px
  lineWidth: number;        // 1-2px
  lineColor: string;        // 'rgba(0,240,255,0.7)'
  glowColor: string;        // '#0060ff'
  glowBlur: number;         // 10-20px
  perspective: number;      // 50-100 (vh equivalent)
  rotationX: number;        // 45-60 degrees
  scrollSpeed: number;      // 30-60 px/second
  horizonY: number;         // 0.6-0.7 (fraction of canvas height)
}
```

### Shooting Star Parameters

```typescript
interface ShootingStarConfig {
  spawnChance: number;      // 0.005-0.05, default: 0.01
  maxConcurrent: number;    // 1-3
  velocityX: [number, number]; // [3, 5] px/frame
  velocityY: [number, number]; // [1, 2.5] px/frame
  trailLength: number;      // 35-50px
  headColor: string;        // '#ffffff'
  tailColor: string;        // 'rgba(255,255,255,0)'
  lifeDecrement: number;    // Frames until removal
}
```

### Horizon Glow Parameters

```typescript
interface HorizonGlowConfig {
  color: string;            // '#ff2975' or '#f222ff'
  height: number;           // 0.2-0.4 (fraction of canvas)
  intensity: number;        // 0.3-0.8
  blendMode: string;        // 'lighter' (globalCompositeOperation)
  position: number;         // 0.6-0.7 (y position as fraction)
}
```

### Sun Parameters

```typescript
interface SunConfig {
  radius: number;           // 100-200px
  centerColor: string;      // '#faf09d'
  midColor: string;         // '#fc9093'
  edgeColor: string;        // '#e92077'
  stripes: boolean;         // Enable horizontal stripes
  stripeCount: number;      // 5-10
  stripeAnimation: boolean; // Animate stripes downward
  position: { x: number; y: number }; // Center on horizon
}
```

### Terrain Parameters

```typescript
interface TerrainConfig {
  layers: number;           // 2-3
  color: string;            // '#000000'
  edgeGlow: boolean;        // Enable cyan edge glow
  edgeGlowColor: string;    // '#00e4ff'
  edgeGlowBlur: number;     // 10-30px
  parallaxSpeeds: number[]; // [0.2, 0.5, 1.0] relative speeds
  noiseOctaves: number;     // 3-5 for varied terrain
  heightRange: [number, number]; // [0.1, 0.3] as canvas fraction
}
```

## Animation Timing Guidelines

### Frame Rate

- **Target**: 60 FPS using `requestAnimationFrame`
- **Frame time**: 16.67ms per frame
- **Delta time**: Always use time-based animation for consistency

```typescript
// Time-based movement pattern
const now = performance.now();
const deltaTime = (now - lastTime) / 1000; // seconds
const movement = speed * deltaTime; // pixels
lastTime = now;
```

### Animation Speeds

| Element | Speed | Unit |
|---------|-------|------|
| Grid scroll | 30-60 | px/second |
| Star flicker | 0.0015 | radians/ms |
| Star rotation | 0.00015-0.00045 | radians/frame |
| Shooting star | 180-300 | px/second |
| Terrain parallax (far) | 5-10 | px/second |
| Terrain parallax (near) | 20-40 | px/second |
| Sun stripe descent | 2-5 | px/second |

### Easing and Smoothness

- **Flicker**: Sinusoidal (`Math.sin()`) for natural pulsing
- **Grid movement**: Linear (constant speed toward viewer)
- **Shooting stars**: Linear trajectory, opacity fades linearly
- **Parallax**: Linear, different rates per layer

### Performance Optimization

1. **Layer separation**: Use multiple canvas elements stacked with z-index
   - Background (static or slow): stars, sky gradient
   - Midground: grid, sun, terrain
   - Foreground: shooting stars, effects

2. **Offscreen rendering**: Pre-render static elements to offscreen canvas

3. **Particle limits**:
   - Stars: 100-400 max
   - Shooting stars: 1-3 concurrent
   - Avoid >500 particles total

4. **Throttling**: Skip frames if performance drops below 30 FPS

5. **GPU optimization**: Use `will-change: transform` for CSS layers

### Z-Index Layer Order (bottom to top)

```
1. Sky gradient background (CSS or canvas)
2. Stars layer
3. Sun (behind horizon)
4. Horizon glow
5. Grid
6. Far terrain silhouette
7. Near terrain silhouette
8. Shooting stars
9. CRT/scanline overlay (if used)
```

## Implementation Notes

### Canvas Glow Effect

```javascript
// Neon glow using shadowBlur
ctx.shadowColor = '#00f0ff';
ctx.shadowBlur = 15;
ctx.strokeStyle = 'rgba(0,240,255,0.8)';
ctx.lineWidth = 2;
// Draw shape - glow will be applied
```

### Multi-pass Glow (brighter effect)

```javascript
// Draw multiple passes for intense glow
for (let i = 5; i >= 1; i--) {
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = i * 2;
  ctx.strokeStyle = glowColor;
  drawShape(ctx);
}
ctx.globalAlpha = 1;
ctx.lineWidth = 1;
ctx.strokeStyle = '#ffffff';
drawShape(ctx); // Bright center
```

### Time-based Flicker

```javascript
const flickerOpacity = baseOpacity +
  Math.sin(Date.now() * flickerSpeed + starIndex) * flickerAmplitude;
```

## Sources

- [GitHub - Retrowave Scene (Three.js)](https://github.com/Moukrea/retrowave-scene)
- [Greg Tatum - Synthwave Vibes Canvas](https://gregtatum.com/interactive/2021/canvas-013-synthwave-vibes/)
- [Speckyboy - CSS & JavaScript Synthwave Snippets](https://speckyboy.com/css-javascript-snippets-synthwave/)
- [DEV Community - Synthwave CSS+HTML Tutorial](https://dev.to/bitquarkapps/synthwave-css-html-1dcn)
- [GitHub Gist - CSS 3D Grid OutRun Design](https://gist.github.com/codingdudecom/1f9c416339fb7dcb7cef12170d411be6)
- [Color-Hex - Synthwave Sunset Palette](https://www.color-hex.com/color-palette/57266)
- [GitHub - Grok Shooting Stars](https://github.com/UsmanDevCraft/grok-shooting-stars)
- [DEV Community - GROK-Inspired Starfield Tutorial](https://dev.to/usman_awan/how-i-built-a-grok-inspired-starfield-shooting-stars-using-html-canvas-3872)
- [Shadcn.io - React Shooting Stars Background](https://www.shadcn.io/background/shooting-stars)
- [MDN - Canvas shadowBlur](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/shadowBlur)
- [Ashley Sheridan - Animated Glowing Lines in Canvas](https://www.ashleysheridan.co.uk/blog/Animated+Glowing+Lines+in+Canvas)
- [KIRUPA - Creating Motion Trails](https://www.kirupa.com/canvas/creating_motion_trails.htm)
- [IBM Developer - Canvas Layering Optimization](https://developer.ibm.com/tutorials/wa-canvashtml5layering/)
- [GitHub - fantasyui-com/synthwave](https://github.com/fantasyui-com/synthwave)
