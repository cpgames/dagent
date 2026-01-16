---
phase: 73-base-ui-layout
plan: 01
status: complete
started: 2026-01-16
completed: 2026-01-16
subsystem: renderer/components/UI
requires:
  - 70-theme-infrastructure
  - 71-base-ui-buttons
  - 72-base-ui-controls
provides:
  - Card component with glass effect and variants
  - Badge component with 5 semantic color variants
  - Dialog component with backdrop, focus trap, and Portal
  - Tabs component with keyboard navigation and Context
  - Tooltip component with hover positioning
affects:
  - 74-background-system
  - All subsequent component migration phases
tech_stack:
  patterns:
    - CSS custom properties for all styling
    - forwardRef for DOM access
    - Compound components pattern (Card.Header, Dialog.Body, etc.)
    - React Context for Tabs state management
    - React Portal for Dialog rendering
    - BEM-style CSS class naming
key_decisions:
  - "Card uses compound components (Header/Body/Footer) for structure"
  - "Dialog uses React Portal to render at document body"
  - "Dialog traps focus and supports Escape key to close"
  - "Tabs use Context API for controlled/uncontrolled state"
  - "Tabs support keyboard navigation (Arrow keys, Home/End)"
  - "Tooltip uses cloneElement to attach event handlers to children"
key_files:
  - src/renderer/src/components/UI/Card.tsx
  - src/renderer/src/components/UI/Card.css
  - src/renderer/src/components/UI/Badge.tsx
  - src/renderer/src/components/UI/Badge.css
  - src/renderer/src/components/UI/Dialog.tsx
  - src/renderer/src/components/UI/Dialog.css
  - src/renderer/src/components/UI/Tabs.tsx
  - src/renderer/src/components/UI/Tabs.css
  - src/renderer/src/components/UI/Tooltip.tsx
  - src/renderer/src/components/UI/Tooltip.css
  - src/renderer/src/components/UI/index.ts
---

# Phase 73-01: Base UI - Layout

## Objective

Create layout components (Card, Badge, Dialog, Tabs, Tooltip) with synthwave styling using CSS custom properties from Phase 70.

## Accomplishments

### Task 1: Card Component

Created `src/renderer/src/components/UI/Card.tsx` and `Card.css`:

**Features:**
- 3 variants: `default`, `elevated`, `outline`
- 4 padding sizes: `none`, `sm`, `md`, `lg`
- Glass effect: backdrop-filter blur, semi-transparent background
- Hoverable state with border glow
- Clickable state with focus-visible outline
- Compound components: CardHeader, CardBody, CardFooter

**CSS Variables Used:**
- `--card-bg`, `--card-border`, `--card-hover-border`
- `--bg-elevated`, `--bg-surface`
- `--glow-border-secondary`, `--border-subtle`

### Task 2: Badge Component

Created `src/renderer/src/components/UI/Badge.tsx` and `Badge.css`:

**Features:**
- 5 variants: `default`, `success`, `warning`, `error`, `info`
- 2 sizes: `sm`, `md`
- Optional dot indicator before text
- Optional icon support
- Pill shape with no text wrap

**CSS Variables Used:**
- `--badge-success-bg/text`, `--badge-progress-bg/text` (warning)
- `--badge-error-bg/text`, `--badge-blocked-bg/text` (info)
- `--bg-hover`, `--text-secondary`

### Task 3: Dialog Component

Created `src/renderer/src/components/UI/Dialog.tsx` and `Dialog.css`:

**Features:**
- 4 sizes: `sm` (400px), `md` (500px), `lg` (700px), `full` (90vw)
- React Portal for rendering at document body
- Backdrop with blur effect
- Focus trap within dialog
- Close on Escape key (configurable)
- Close on backdrop click (configurable)
- Compound components: DialogHeader, DialogBody, DialogFooter
- Entry animations (fade backdrop, scale dialog)

**CSS Variables Used:**
- `--dialog-bg`, `--dialog-border`, `--dialog-backdrop`
- `--glow-border-secondary`, `--shadow-xl`
- `--z-modal`

### Task 4: Tabs Component

Created `src/renderer/src/components/UI/Tabs.tsx` and `Tabs.css`:

**Features:**
- 2 variants: `underline` (default), `pills`
- Controlled/uncontrolled modes
- React Context for state management
- Keyboard navigation (Arrow keys, Home, End)
- ARIA attributes for accessibility
- Compound components: Tabs, TabsList, TabsTrigger, TabsContent

**CSS Variables Used:**
- `--accent-primary` (active tab indicator)
- `--text-muted`, `--text-secondary`, `--text-inverse`
- `--bg-hover`, `--bg-surface`

### Task 5: Tooltip Component

Created `src/renderer/src/components/UI/Tooltip.tsx` and `Tooltip.css`:

**Features:**
- 4 positions: `top` (default), `bottom`, `left`, `right`
- Configurable delay before showing
- Arrow pointing to trigger element
- Multiline support
- Keyboard accessibility (focus/blur)
- Entry animation (fade + translate)

**CSS Variables Used:**
- `--bg-elevated`, `--border-subtle`
- `--text-primary`, `--shadow-md`
- `--z-tooltip`

### Barrel Export Update

Updated `src/renderer/src/components/UI/index.ts`:

```typescript
// Layout
export { Card, CardHeader, CardBody, CardFooter, type CardProps, ... } from './Card';
export { Badge, type BadgeProps } from './Badge';
export { Dialog, DialogHeader, DialogBody, DialogFooter, type DialogProps, ... } from './Dialog';
export { Tabs, TabsList, TabsTrigger, TabsContent, type TabsProps, ... } from './Tabs';
export { Tooltip, type TooltipProps } from './Tooltip';
```

## Usage Examples

```tsx
import {
  Card, CardHeader, CardBody, CardFooter,
  Badge,
  Dialog, DialogHeader, DialogBody, DialogFooter,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Tooltip
} from '@/components/UI';

// Card with glass effect
<Card variant="elevated" padding="lg" hoverable>
  <CardHeader>Settings</CardHeader>
  <CardBody>Card content here...</CardBody>
  <CardFooter>
    <Button variant="secondary">Cancel</Button>
    <Button variant="primary">Save</Button>
  </CardFooter>
</Card>

// Badge
<Badge variant="success" dot>Complete</Badge>
<Badge variant="error">Failed</Badge>
<Badge variant="info" size="sm">New</Badge>

// Dialog
<Dialog open={isOpen} onClose={handleClose} size="md">
  <DialogHeader title="Confirm Action" description="This cannot be undone." />
  <DialogBody>Are you sure?</DialogBody>
  <DialogFooter>
    <Button variant="ghost" onClick={handleClose}>Cancel</Button>
    <Button variant="danger" onClick={handleConfirm}>Delete</Button>
  </DialogFooter>
</Dialog>

// Tabs
<Tabs defaultValue="general" variant="underline">
  <TabsList>
    <TabsTrigger value="general">General</TabsTrigger>
    <TabsTrigger value="advanced">Advanced</TabsTrigger>
    <TabsTrigger value="help" disabled>Help</TabsTrigger>
  </TabsList>
  <TabsContent value="general">General settings...</TabsContent>
  <TabsContent value="advanced">Advanced settings...</TabsContent>
</Tabs>

// Tooltip
<Tooltip content="Save changes" position="top">
  <Button variant="primary">Save</Button>
</Tooltip>
```

## Verification

- [x] Card.tsx exists with glass effect and hover states
- [x] Badge.tsx exists with 5 status variants
- [x] Dialog.tsx opens/closes with backdrop and focus trap
- [x] Tabs.tsx switches content with keyboard support
- [x] Tooltip.tsx shows on hover with positioning
- [x] All components use CSS custom properties (no hardcoded colors)
- [x] All components exported from index.ts
- [x] `npm run build` succeeds without errors

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/src/components/UI/Card.tsx` | Created - Card container component |
| `src/renderer/src/components/UI/Card.css` | Created - Card styles with glass effect |
| `src/renderer/src/components/UI/Badge.tsx` | Created - Badge status component |
| `src/renderer/src/components/UI/Badge.css` | Created - Badge styles |
| `src/renderer/src/components/UI/Dialog.tsx` | Created - Modal dialog component |
| `src/renderer/src/components/UI/Dialog.css` | Created - Dialog styles |
| `src/renderer/src/components/UI/Tabs.tsx` | Created - Tabs navigation component |
| `src/renderer/src/components/UI/Tabs.css` | Created - Tabs styles |
| `src/renderer/src/components/UI/Tooltip.tsx` | Created - Tooltip component |
| `src/renderer/src/components/UI/Tooltip.css` | Created - Tooltip styles |
| `src/renderer/src/components/UI/index.ts` | Updated - Added all layout component exports |

## Next Phase Readiness

Phase 74 (Background System) can now:
- Follow the same patterns established here
- Use existing Dialog/Card components if needed
- Build SynthwaveBackground, Starfield, Horizon components
