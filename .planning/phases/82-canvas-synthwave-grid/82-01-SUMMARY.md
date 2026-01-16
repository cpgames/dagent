---
phase: 82-canvas-synthwave-grid
plan: 01
status: complete
---

## Summary

Created a canvas-based synthwave grid component to replace the CSS-based perspective grid, featuring curved horizontal lines using quadratic bezier curves and smooth scrolling animation toward the viewer.

## Changes Made

- **src/renderer/src/components/Background/SynthwaveGrid.tsx**: New canvas-based grid component with:
  - Canvas element filling bottom 45vh of viewport
  - Curved horizontal lines using quadratic bezier curves matching horizon ellipse curvature
  - Vertical lines converging to vanishing point at horizon center
  - Cyan (#00f0ff) for horizontal lines, magenta (#ff00ff) for vertical lines
  - Line opacity fading toward horizon for depth effect
  - Smooth scrolling animation using requestAnimationFrame
  - Reduced motion support (static fallback when prefers-reduced-motion is set)
  - Configurable props: speed, lineCount, className

- **src/renderer/src/components/Background/SynthwaveGrid.css**: Canvas container styling with fixed positioning, pointer-events: none, and z-index below Horizon.

- **src/renderer/src/components/Background/SynthwaveBackground.tsx**: Updated to import and render SynthwaveGrid when grid prop is true, passing showGrid={false} to Horizon (grid now canvas-based).

- **src/renderer/src/components/Background/Horizon.tsx**: Simplified by removing SVG filter definitions (no longer needed). Deprecated showGrid prop with JSDoc annotation.

- **src/renderer/src/components/Background/Horizon.css**: Removed SVG filter styles. Added deprecation comment to CSS grid styles (kept for backwards compatibility).

## Verification

- [x] `npm run build` succeeds without errors
- [x] SynthwaveGrid.tsx exists with canvas rendering logic (144 lines)
- [x] Grid lines are curved (quadratic bezier matching horizon)
- [x] Animation scrolls grid toward viewer smoothly
- [x] Reduced motion support works (static fallback)
- [x] Horizon glow effects still render correctly
- [x] SynthwaveGrid.css exists (17 lines)
