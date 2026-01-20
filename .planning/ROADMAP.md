# Roadmap: DAGent

## Overview

v3.2 Feature State Machine Refactor transforms how features move from creation through planning to execution. Features now start instantly in Backlog (no worktree), transition through explicit PM planning phases (investigating → questioning → planning), and display in a simplified 4-column Kanban driven by status events.

## Milestones

- ✅ **v1.0 MVP** - Phases 1-4 (shipped 2026-01-06)
- ✅ **v1.1-v1.8** - Feature evolution (shipped 2026-01-09 through 2026-01-12)
- ✅ **v2.1-v2.7** - Ralph Loop, Specs, Canvas (shipped 2026-01-13 through 2026-01-16)
- ✅ **v3.0** - Session & Checkpoint Architecture (shipped 2026-01-17)
- ✅ **v3.1** - Task Analysis Orchestrator (shipped 2026-01-18)
- 🚧 **v3.2 Feature State Machine** - Phases v3.2-01 through v3.2-06 (in progress)

## Phases

- [x] **Phase v3.2-01: State Machine Foundation** - Core state machine with 9-state lifecycle
- [x] **Phase v3.2-02: Non-Blocking Feature Creation** - Instant creation, deferred worktree
- [x] **Phase v3.2-03: Background Worktree Management** - Async worktree with progress tracking
- [ ] **Phase v3.2-04: Event-Driven Kanban Refactor** - 4-column layout with real-time updates
- [ ] **Phase v3.2-05: PM Planning Phase Integration** - Investigation, questioning, planning workflow
- [ ] **Phase v3.2-06: Context-Aware UI Polish** - State-specific indicators and controls

## Phase Details

### Phase v3.2-01: State Machine Foundation
**Goal**: Core feature state machine with validated transitions and storage schema

**Depends on**: Nothing (first phase)

**Requirements**: STATE-01, STATE-02, STATE-03, STATE-04

**Success Criteria** (what must be TRUE):
  1. Feature can exist in `not_started` status without worktree
  2. Feature transitions follow explicit 9-state machine (not_started → creating_worktree → investigating → questioning → planning → ready → in_progress → completed → archived)
  3. Invalid state transitions are rejected (e.g., cannot jump from not_started directly to completed)
  4. Feature.json schema validates against all 9 states with proper TypeScript typing

**Research**: Unlikely (internal type system, existing feature infrastructure)

**Plans**: 2 plans in 2 waves (completed)

---

### Phase v3.2-02: Non-Blocking Feature Creation
**Goal**: Instant feature creation with deferred worktree

**Depends on**: Phase v3.2-01 (needs state machine types)

**Requirements**: CREATE-01, CREATE-02, CREATE-03, CREATE-04

**Success Criteria** (what must be TRUE):
  1. User creates feature via dialog and dialog closes immediately
  2. New feature appears in Backlog with `not_started` status
  3. No worktree exists yet after creation
  4. User can create multiple features rapidly without waiting

**Research**: Unlikely (modifying existing NewFeatureDialog component)

**Plans**: 2 plans in 2 waves (completed)

---

### Phase v3.2-03: Background Worktree Management
**Goal**: Asynchronous worktree creation with progress tracking

**Depends on**: Phase v3.2-02 (needs instant creation flow)

**Requirements**: WORKTREE-01, WORKTREE-02, WORKTREE-03, WORKTREE-04

**Success Criteria** (what must be TRUE):
  1. User clicks Start button in Kanban and worktree creation begins
  2. UI remains responsive during worktree creation (non-blocking)
  3. Feature card shows progress indicator while in `creating_worktree` state
  4. Status automatically transitions to `investigating` when worktree ready

**Research**: Unlikely (extending existing worktree infrastructure)

**Plans**: 2 plans in 2 waves (completed)

---

### Phase v3.2-04: Event-Driven Kanban Refactor
**Goal**: Four-column Kanban with real-time event-driven updates

**Depends on**: Phase v3.2-03 (needs all states working)

**Requirements**: KANBAN-01, KANBAN-02, KANBAN-03, KANBAN-04

**Success Criteria** (what must be TRUE):
  1. Kanban displays exactly 4 columns: Backlog, In Progress, Completed, Archived
  2. Features automatically move between columns when status changes (no manual refresh)
  3. Status-to-column mapping works: `not_started` → Backlog, `completed` → Completed, `archived` → Archived, all others → In Progress
  4. Planning and Needs Attention columns no longer exist

**Research**: Unlikely (refactoring existing KanbanView component)

**Plans**: TBD

---

### Phase v3.2-05: PM Planning Phase Integration
**Goal**: PM agent investigation, questioning, and planning workflow

**Depends on**: Phase v3.2-04 (needs Kanban to show planning states)

**Requirements**: PM-01, PM-02, PM-03, PM-04, PM-05, PM-06, SPEC-01, SPEC-02, SPEC-03, SPEC-04

**Success Criteria** (what must be TRUE):
  1. PM agent explores codebase during `investigating` state and creates initial spec
  2. PM agent transitions to `questioning` state and asks user questions one-by-one
  3. Feature spec updates in real-time during conversation (visible in FeatureSpecViewer)
  4. Chat routes to PM agent when feature is in investigating/questioning/planning states
  5. PM agent creates tasks during `planning` state after questions answered
  6. Status transitions to `ready` after PM completes task creation

**Research**: Unlikely (extending existing PM agent and chat infrastructure)

**Plans**: TBD

---

### Phase v3.2-06: Context-Aware UI Polish
**Goal**: State-specific indicators and controls across UI

**Depends on**: Phase v3.2-05 (needs all states and workflows working)

**Requirements**: UI-01, UI-02, UI-03, UI-04

**Success Criteria** (what must be TRUE):
  1. DAG header shows different buttons/badges for investigating/questioning/planning states
  2. Start button behavior changes based on feature status (enabled for not_started, different actions for other states)
  3. Feature cards show visual indicators for current planning phase (spinner, progress, etc.)
  4. Feature cards display state-specific icons (question mark for questioning, spinner for investigating, etc.)

**Research**: Unlikely (UI polish using existing component patterns)

**Plans**: TBD

---

## Progress

**Execution Order:**
Phases execute sequentially: v3.2-01 → v3.2-02 → v3.2-03 → v3.2-04 → v3.2-05 → v3.2-06

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| v3.2-01. State Machine Foundation | v3.2 | 2/2 | Complete | 2026-01-20 |
| v3.2-02. Non-Blocking Creation | v3.2 | 2/2 | Complete | 2026-01-20 |
| v3.2-03. Worktree Management | v3.2 | 2/2 | Complete | 2026-01-20 |
| v3.2-04. Kanban Refactor | v3.2 | 0/TBD | Not started | - |
| v3.2-05. PM Planning Integration | v3.2 | 0/TBD | Not started | - |
| v3.2-06. UI Polish | v3.2 | 0/TBD | Not started | - |

---
*Last updated: 2026-01-20 after Phase v3.2-03 completion*
