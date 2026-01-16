# Canvas Background System Research Summary

Research synthesis for v2.7 milestone: unified canvas-based synthwave background.

---

## Executive Summary

**Recommendation:** Vanilla Canvas 2D with custom React hooks. No external libraries required.

The research confirms that Canvas 2D is the optimal choice for DAGent's background system (~500-1000 particles). WebGL/PixiJS would add ~150KB bundle overhead without meaningful performance benefits at this scale. The existing SynthwaveGrid component (Phase 82) already demonstrates the pattern.

**Key architectural decision:** Single unified canvas with layer-based composition, not multiple stacked canvases. This simplifies the render loop and reduces overhead.

---

## Technology Stack

| Component | Recommendation | Rationale |
|-----------|----------------|-----------|
| Rendering | Canvas 2D API | Sufficient for <1000 particles at 60fps |
| Animation | Custom `useAnimationFrame` hook | Full control, no dependencies |
| Lifecycle | `useLayoutEffect` | Prevents RAF timing issues on unmount |
| Particles | Object pooling | Avoids GC pressure during animation |
| State | useRef for mutable data | Prevents unnecessary re-renders |

**No new dependencies required.**

---

## Visual Effects Specifications

### Must-Have (Table Stakes)

1. **Starfield**: 360 stars, 0.5-2.2px radius, sinusoidal flicker
2. **Perspective Grid**: 30-50px cells, cyan/magenta lines, scroll toward viewer
3. **Horizon Glow**: Pink/magenta radial gradient, 60-70% down viewport
4. **Sky Gradient**: Deep purple (#1b2853) to pink (#f222ff)

### User-Requested Enhancements

1. **Shooting Stars**: 1% spawn chance, 35-50px trails, max 3 concurrent
2. **Pulsing Horizon**: Sinusoidal intensity modulation (0.3-0.8 range)
3. **Terrain Silhouettes**: 2-3 parallax layers, black with cyan edge glow

### Optional (Future)

- Segmented/striped sun
- CRT scanline overlay
- Chromatic aberration

---

## Architecture Pattern

### Unified Canvas Component

```
UnifiedSynthwaveBackground
├── useAnimationFrame (single RAF loop)
├── Layers (render order):
│   1. Sky gradient (static, redraw on resize only)
│   2. Starfield (update flicker each frame)
│   3. Horizon glow (pulse animation)
│   4. Grid (scroll animation)
│   5. Terrain silhouettes (parallax scroll)
│   6. Shooting stars (spawn/update/remove)
└── Accessibility: prefers-reduced-motion fallback
```

### Layer Interface

Each visual layer implements:
- `init(ctx, width, height)` - Initialize/reset state
- `update(delta)` - Update positions/animations
- `render(ctx)` - Draw to canvas

This allows layers to be developed and tested independently, then composed.

---

## Critical Implementation Notes

### From Pitfalls Research

1. **RAF Cleanup**: Use `useLayoutEffect`, not `useEffect`, to cancel animation frame before React commits DOM changes
2. **Object Pooling**: Pre-allocate particle arrays (stars, shooting stars) to avoid GC during animation
3. **Delta Time**: All movement must be time-based (`distance = speed * deltaTime`) for consistent animation across frame rates
4. **Context Caching**: Store canvas context in useRef, check for null (Electron GPU context loss)
5. **Resize Handling**: Use ResizeObserver, debounce to 100ms, account for devicePixelRatio

### Electron-Specific

- Enable GPU rasterization: `app.commandLine.appendSwitch('enable-gpu-rasterization')`
- Handle context loss gracefully (re-initialize on recovery)
- Test with DevTools Performance panel for frame drops

---

## Roadmap Implications

### Suggested Phase Structure

| Phase | Focus | Complexity |
|-------|-------|------------|
| 83 | Core infrastructure (useAnimationFrame hook, base canvas component, layer system) | Medium |
| 84 | Migrate starfield to canvas layer (replace CSS) | Low |
| 85 | Migrate horizon glow to canvas layer (add pulsing) | Low |
| 86 | Integrate existing grid into unified canvas | Medium |
| 87 | Add shooting star system | Medium |
| 88 | Add terrain silhouettes with parallax | Medium |
| 89 | Performance optimization & accessibility polish | Low |

**Total: 7 phases**

### Migration Strategy

1. Build new unified canvas component alongside existing CSS components
2. Migrate layers one at a time, testing each
3. Remove CSS components only after canvas equivalents are verified
4. Keep reduced-motion fallback throughout

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Technology choice | High | Canvas 2D is well-suited, proven in Phase 82 |
| Architecture pattern | High | Layer composition is standard for game-like rendering |
| Performance targets | High | 500-1000 particles is well within Canvas 2D limits |
| Visual specifications | High | Synthwave aesthetics are well-documented |
| Electron integration | Medium | GPU context loss is rare but must be handled |
| Timeline risk | Low | Each phase is isolated and testable |

---

## Open Questions

1. **Sun element**: Include segmented sun in scope, or defer to future milestone?
2. **CRT effects**: Scanlines add authenticity but may impact readability - include?
3. **Mobile/low-power**: Should there be a "lite" mode for reduced GPU usage?

These can be addressed during `/gsd:define-requirements`.

---

## References

See detailed research in:
- [STACK.md](./STACK.md) - Technology recommendations
- [FEATURES.md](./FEATURES.md) - Visual effect specifications
- [ARCHITECTURE.md](./ARCHITECTURE.md) - React + canvas patterns
- [PITFALLS.md](./PITFALLS.md) - Common mistakes and prevention
