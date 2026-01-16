---
phase: 81-polish-accessibility
plan: 02
status: complete
---

# Summary: Reduced Motion & Focus States

## What Was Done

Added global reduced motion support and ensured consistent focus-visible styles across all UI components for improved accessibility.

## Changes Made

### Global Styles (main.css)

Added to the end of `src/renderer/src/assets/main.css`:

1. **Focus reset and global focus-visible**:
   - `:focus { outline: none; }` - removes default outline
   - `:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }` - adds consistent cyan outline for keyboard navigation

2. **Interactive element focus styles**:
   - Applied consistent focus-visible to `a`, `button`, `[role="button"]`, `[tabindex]`, `input`, `select`, `textarea`

3. **Reduced motion media query**:
   - `@media (prefers-reduced-motion: reduce)` - disables animations and transitions globally when user prefers reduced motion
   - Sets `animation-duration`, `animation-iteration-count`, `transition-duration` to near-zero
   - Disables smooth scroll behavior

### Component CSS Fixes

**Select.css**: Changed `:focus` to `:focus-visible` and added outline styling to match other components.

### Audited Components (Already Correct)

- **Checkbox.css**: Has `.ui-checkbox__input:focus-visible + .ui-checkbox__box` ✓
- **Radio.css**: Has `.ui-radio__input:focus-visible + .ui-radio__circle` ✓
- **Toggle.css**: Has `.ui-toggle__input:focus-visible + .ui-toggle__track` ✓
- **Tabs.css**: Has `.ui-tabs__trigger:focus-visible` ✓

## Verification

- [x] `npm run build` succeeds without errors
- [x] main.css contains `@media (prefers-reduced-motion: reduce)` block
- [x] main.css contains global `:focus-visible` styles
- [x] All UI component CSS files have `:focus-visible` rules
- [x] No hardcoded blue focus colors remain

## Files Modified

- `src/renderer/src/assets/main.css`
- `src/renderer/src/components/UI/Select.css`
