# Project Milestones: DAGent

## v1.2 UX Overhaul (Shipped: 2026-01-13)

**Delivered:** Major UX restructure with vertical sidebar layout, project selection, working AI chat with persistence, git branch management, and layout polish.

**Phases completed:** 11-15 (10 plans total)

**Key accomplishments:**

- Layout restructure with vertical right sidebar for views (Kanban/DAG/Context)
- Bottom status bar with auth indicator and git status
- Project selection dialog on startup (open existing or create new)
- Recent projects list with quick switching
- Feature chat with AI integration (Claude API) and message persistence
- Git branch monitoring with dirty indicator, ahead/behind counts
- Branch switcher dropdown for checkout operations
- Layout alignment fixes for proper sizing and overflow handling

**Stats:**

- 32 source files modified
- ~2,700 lines of TypeScript added
- 5 phases, 10 plans executed
- 66 commits

**Git range:** `64527de` -> `73bee6d`

**What's next:** Advanced features (multi-agent execution, conflict resolution, deployment packaging)

---

## v1.1 Critical Fixes (Shipped: 2026-01-13)

**Delivered:** Authentication fixes, feature creation workflow, and UI polish with loading states, error handling, and dirty tracking.

**Phases completed:** 8-10 (10 plans total)

**Key accomplishments:**

- Authentication initialization on app startup
- Credential detection for Windows paths and Claude CLI
- Auth status UI with indicator and authentication dialog
- Feature creation backend with storage, IPC, and git worktree
- NewFeatureDialog component with validation
- Loading states for DAG mutations and save operations
- Error display with toasts and inline banners
- Dirty state tracking with unsaved changes warning
- Layout fixes and disabled button affordance

**Stats:**

- ~850 lines of TypeScript added
- 3 phases, 10 plans executed

**Git range:** `6567ca6` -> `64527de`

**What's next:** v1.2 UX Overhaul

---

## v1.0 MVP (Shipped: 2026-01-13)

**Delivered:** Complete Electron desktop application for dependency-aware AI agent orchestration with DAG-based task execution, git worktree isolation, and React Flow visualization.

**Phases completed:** 1-7 (25 plans total)

**Key accomplishments:**

- Electron + React + TypeScript foundation with electron-vite and Tailwind CSS v4
- DAG execution engine with topological sort and task state machine
- Git integration with worktree-based task isolation
- Agent system with harness/task/merge agent coordination
- React Flow DAG visualization with custom task nodes
- Authentication priority chain and execution controls
- Graph versioning with 20-version undo/redo
- Error handling with toast notifications

**Stats:**

- 89 source files created
- ~9,043 lines of TypeScript
- 7 phases, 25 plans executed
- Completed in single session

**Git range:** `f091d72` -> `6567ca6`

**What's next:** Testing, deployment packaging, user documentation

---
