---
phase: 71-base-ui-buttons
plan: 01
status: complete
started: 2026-01-16
completed: 2026-01-16
subsystem: renderer/components/UI
requires:
  - 70-theme-infrastructure
provides:
  - Button component with primary/secondary/ghost/danger variants
  - IconButton component for icon-only actions
  - Input component with text/number support
  - Textarea component with auto-resize
affects:
  - 72-base-ui-controls
  - 73-base-ui-layout
  - 75-migrate-layout (will use Button/Input)
  - All subsequent component migration phases
tech_stack:
  patterns:
    - CSS custom properties for all styling
    - forwardRef for DOM access
    - Variant/size props pattern
    - CSS modules (non-scoped, BEM-style naming)
key_decisions:
  - "BEM-style class naming: .ui-button--primary, .ui-button--sm"
  - "Tailwind only for layout utilities, not colors"
  - "forwardRef on all components for ref forwarding"
  - "IconButton requires label prop for accessibility"
key_files:
  - src/renderer/src/components/UI/Button.tsx
  - src/renderer/src/components/UI/Button.css
  - src/renderer/src/components/UI/IconButton.tsx
  - src/renderer/src/components/UI/Input.tsx
  - src/renderer/src/components/UI/Input.css
  - src/renderer/src/components/UI/Textarea.tsx
  - src/renderer/src/components/UI/Textarea.css
  - src/renderer/src/components/UI/index.ts
---

# Phase 71-01: Base UI - Buttons & Inputs

## Objective

Create reusable Button, Input, and Textarea components that use the CSS custom properties from Phase 70.

## Accomplishments

### Task 1: Button Component

Created `src/renderer/src/components/UI/Button.tsx` and `Button.css`:

**Features:**
- 4 variants: `primary`, `secondary`, `ghost`, `danger`
- 3 sizes: `sm`, `md`, `lg`
- Loading state with spinner animation
- Left/right icon support
- Full-width option
- Disabled state
- Focus-visible outline for accessibility

**CSS Variables Used:**
- `--btn-primary-bg`, `--btn-primary-text`, `--btn-primary-border`, `--btn-primary-hover-bg`, `--btn-primary-glow`
- `--btn-secondary-*` variants
- `--btn-ghost-*` variants
- `--color-error`, `--glow-error` for danger variant
- `--radius-md`, `--space-*`, `--transition-fast`

### Task 2: IconButton Component

Created `src/renderer/src/components/UI/IconButton.tsx`:

**Features:**
- Square button for icon-only actions
- 3 variants: `primary`, `secondary`, `ghost`
- 3 sizes: `sm`, `md`, `lg`
- Required `label` prop for accessibility (aria-label)
- Uses same Button.css for styling

### Task 3: Input Component

Created `src/renderer/src/components/UI/Input.tsx` and `Input.css`:

**Features:**
- 3 sizes: `sm`, `md`, `lg`
- Error state with red border and optional error message
- Left/right icon support
- Clickable right icon (for clear buttons, etc.)
- Focus glow effect using `--input-focus-glow`
- Hidden number spinners for cleaner look

**CSS Variables Used:**
- `--input-bg`, `--input-text`, `--input-placeholder`, `--input-border`
- `--input-focus-border`, `--input-focus-glow`
- `--color-error`, `--color-error-dim`
- `--text-muted`, `--text-primary`

### Task 4: Textarea Component

Created `src/renderer/src/components/UI/Textarea.tsx` and `Textarea.css`:

**Features:**
- 3 sizes: `sm`, `md`, `lg`
- Auto-resize option (grows with content)
- Min/max rows configuration
- Character count display with warning/error states
- Error state with message
- Same styling as Input for consistency

### Task 5: Barrel Export

Created `src/renderer/src/components/UI/index.ts`:

```typescript
export { Button, type ButtonProps } from './Button';
export { IconButton, type IconButtonProps } from './IconButton';
export { Input, type InputProps } from './Input';
export { Textarea, type TextareaProps } from './Textarea';
```

## Usage Examples

```tsx
import { Button, Input, Textarea, IconButton } from '@/components/UI';

// Buttons
<Button variant="primary">Save</Button>
<Button variant="secondary" size="sm">Cancel</Button>
<Button variant="danger" loading>Deleting...</Button>
<Button variant="ghost" leftIcon={<Icon />}>With Icon</Button>

// Icon Button
<IconButton label="Close" variant="ghost">
  <XIcon />
</IconButton>

// Input
<Input placeholder="Enter name..." />
<Input size="lg" error errorMessage="Required field" />
<Input leftIcon={<SearchIcon />} rightIcon={<ClearIcon />} onRightIconClick={handleClear} />

// Textarea
<Textarea placeholder="Description..." autoResize minRows={3} maxRows={10} />
<Textarea showCount maxLength={500} />
```

## Verification

- [x] Button renders with 4 variants: primary, secondary, ghost, danger
- [x] Button supports 3 sizes: sm, md, lg
- [x] Button shows loading spinner when loading=true
- [x] IconButton renders square with accessible label
- [x] Input renders with focus glow effect
- [x] Input shows error state with red border
- [x] Textarea supports autoResize prop
- [x] All components use CSS custom properties (no hardcoded colors)
- [x] Barrel export exposes all components
- [x] `npm run build` passes without errors

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/src/components/UI/Button.tsx` | Created - Button component |
| `src/renderer/src/components/UI/Button.css` | Created - Button/IconButton styles |
| `src/renderer/src/components/UI/IconButton.tsx` | Created - IconButton component |
| `src/renderer/src/components/UI/Input.tsx` | Created - Input component |
| `src/renderer/src/components/UI/Input.css` | Created - Input styles |
| `src/renderer/src/components/UI/Textarea.tsx` | Created - Textarea component |
| `src/renderer/src/components/UI/Textarea.css` | Created - Textarea styles |
| `src/renderer/src/components/UI/index.ts` | Created - Barrel export |

## Next Phase Readiness

Phase 72 (Base UI - Controls) can now:
- Follow the same patterns established here
- Use the same CSS variable naming conventions
- Build Checkbox, Radio, Toggle, Slider, Select components
