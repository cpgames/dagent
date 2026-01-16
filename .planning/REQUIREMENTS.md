# Requirements: v2.7 Canvas Background System

## Overview

Unify all background rendering into a single canvas layer with enhanced visual effects, replacing the current CSS-based background components with a performant canvas-based system.

## v1 Requirements (This Milestone)

### Canvas Infrastructure (INFRA)

| ID | Requirement | Priority |
|----|-------------|----------|
| INFRA-01 | Custom useAnimationFrame hook with delta time and pause support | Must |
| INFRA-02 | Base canvas component with resize handling and DPR support | Must |
| INFRA-03 | Layer interface (init/update/render) for composable effects | Must |
| INFRA-04 | Reduced motion detection and static fallback | Must |

### Visual Effects (VFX)

| ID | Requirement | Priority |
|----|-------------|----------|
| VFX-01 | Sky gradient layer (deep purple to pink) | Must |
| VFX-02 | Starfield layer with 360 stars and sinusoidal flicker | Must |
| VFX-03 | Horizon glow layer with pulsing intensity animation | Must |
| VFX-04 | Perspective grid layer with curved lines (migrate from SynthwaveGrid) | Must |
| VFX-05 | Shooting stars layer with trails (1% spawn, max 3 concurrent) | Must |
| VFX-06 | Terrain silhouettes layer with 2-3 parallax depths | Must |

### Integration (INT)

| ID | Requirement | Priority |
|----|-------------|----------|
| INT-01 | Unified canvas replaces all CSS background components | Must |
| INT-02 | Single requestAnimationFrame loop for all layers | Must |
| INT-03 | CSS component cleanup (remove deprecated Starfield, Horizon CSS) | Must |

### Performance (PERF)

| ID | Requirement | Priority |
|----|-------------|----------|
| PERF-01 | Object pooling for stars and shooting stars | Should |
| PERF-02 | Context caching with GPU context loss handling | Should |
| PERF-03 | ResizeObserver with 100ms debounce | Should |

## v2 Requirements (Future)

| ID | Requirement | Notes |
|----|-------------|-------|
| VFX-F01 | Segmented/striped sun element | Deferred - adds complexity |
| VFX-F02 | CRT scanline overlay | Deferred - may impact readability |
| VFX-F03 | Chromatic aberration at edges | Deferred - polish feature |
| PERF-F01 | Lite mode for low-power devices | Deferred - assess need first |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 83 | Complete |
| INFRA-02 | Phase 83 | Complete |
| INFRA-03 | Phase 83 | Complete |
| INFRA-04 | Phase 83 | Complete |
| VFX-01 | Phase 84 | Complete |
| VFX-02 | Phase 84 | Complete |
| VFX-03 | Phase 85 | Complete |
| VFX-04 | Phase 86 | Complete |
| VFX-05 | Phase 87 | Complete |
| VFX-06 | Phase 88 | Pending |
| INT-01 | Phase 89 | Pending |
| INT-02 | Phase 89 | Pending |
| INT-03 | Phase 89 | Pending |
| PERF-01 | Phase 89 | Pending |
| PERF-02 | Phase 89 | Pending |
| PERF-03 | Phase 89 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0
