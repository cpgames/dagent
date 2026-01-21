# Requirements: DAGent Feature State Machine Refactor

**Defined:** 2026-01-20
**Core Value:** Tasks execute in correct dependency order with context handoff between agents - the DAG execution engine must work correctly or nothing else matters.

**Milestone:** v3.2 - Feature State Machine & Non-Blocking Creation

## v1 Requirements

Requirements for the feature state machine refactor. Each maps to roadmap phases.

### State Machine & Types

- [x] **STATE-01**: User-created features start in `not_started` status immediately (no worktree created)
- [x] **STATE-02**: Feature status follows explicit 9-state machine: not_started → creating_worktree → investigating → questioning → planning → ready → in_progress → completed → archived
- [x] **STATE-03**: State transitions are validated (only valid state transitions allowed, no invalid jumps)
- [x] **STATE-04**: Feature storage schema (feature.json) supports all 9 states with proper typing

### Kanban View

- [x] **KANBAN-01**: Kanban displays 4 columns: Backlog, In Progress, Completed, Archived (Planning and Needs Attention columns removed)
- [x] **KANBAN-02**: Kanban listens to `feature:status-changed` events for real-time column updates
- [x] **KANBAN-03**: Features map to columns via function: `not_started` → Backlog, `completed` → Completed, `archived` → Archived, all other states → In Progress
- [x] **KANBAN-04**: Feature cards in Backlog column show "Start" button to trigger worktree creation

### Feature Creation

- [x] **CREATE-01**: User can create feature instantly via dialog with `not_started` status (no worktree yet)
- [x] **CREATE-02**: Feature creation dialog closes immediately after feature created (non-blocking)
- [x] **CREATE-03**: New features appear in Backlog column automatically after creation
- [x] **CREATE-04**: Worktree creation is deferred until user clicks Start button

### Worktree Management

- [x] **WORKTREE-01**: Clicking Start button in Kanban card triggers worktree creation and status transition to `creating_worktree`
- [x] **WORKTREE-02**: Worktree creation runs in background (non-blocking UI, user can continue working)
- [x] **WORKTREE-03**: Feature cards show visual progress indicators during `creating_worktree` state
- [x] **WORKTREE-04**: Status automatically transitions to `investigating` when worktree creation completes

### PM Agent Planning Phases

- [x] **PM-01**: PM agent explores codebase during `investigating` state and creates initial spec with assumptions/questions
- [x] **PM-02**: PM agent enters `questioning` state to ask user questions one-by-one
- [x] **PM-03**: PM agent updates spec with user answers during `questioning` state
- [x] **PM-04**: PM agent enters `planning` state after all questions answered
- [x] **PM-05**: PM agent creates tasks from spec during `planning` state
- [x] **PM-06**: Status automatically transitions to `ready` after PM creates all tasks

### Spec & Chat Integration

- [x] **SPEC-01**: Feature spec updates live in real-time during PM conversation (investigating/questioning/planning phases)
- [x] **SPEC-02**: Chat store routes messages to PM agent for features in investigating/questioning/planning states
- [x] **SPEC-03**: PM agent conversations persist across state transitions
- [x] **SPEC-04**: FeatureSpecViewer component shows spec changes in real-time during planning phases

### UI Context Awareness

- [x] **UI-01**: DAG header shows different buttons/badges based on feature state (investigating/questioning/planning indicators)
- [x] **UI-02**: Start button behavior changes based on feature status (disabled/enabled/different actions)
- [x] **UI-03**: Feature cards show visual progress indicators for current planning phase
- [x] **UI-04**: Feature cards show state-specific icons (spinner for investigating, question mark for questioning, etc.)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Migration & Backwards Compatibility

- **MIG-01**: Automatic migration of existing features from old statuses to new state machine
- **MIG-02**: Migration script with dry-run mode to preview changes before applying
- **MIG-03**: Rollback mechanism if migration fails

### Enhanced PM Agent

- **PM-07**: PM agent can ask multiple questions at once (batch questioning)
- **PM-08**: PM agent can suggest spec revisions based on codebase analysis
- **PM-09**: PM agent provides confidence scores for task complexity estimates

### Advanced UI Features

- **UI-05**: Timeline view showing feature progression through state machine
- **UI-06**: Undo/redo for state transitions (rollback to previous state)
- **UI-07**: Bulk state transitions for multiple features at once
- **UI-08**: Custom state machine visualization (flowchart of states/transitions)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-migration in v1 | Focus on new feature flow first; existing features stay on old system until v2 |
| Multiple PM agents | Single PM agent sufficient for v1; parallel planning adds complexity |
| Custom state machines | Fixed 9-state machine for v1; user-defined states deferred to future |
| State machine branching | Linear progression only; no parallel paths or conditional states |
| Planning pause/resume | Once planning starts, must complete; pause/resume adds complexity |
| Needs Attention column | Removed entirely; failed tasks stay in current state with warning icons |

## Traceability

Which phases cover which requirements. Updated by create-roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STATE-01 | Phase v3.2-01 | Complete |
| STATE-02 | Phase v3.2-01 | Complete |
| STATE-03 | Phase v3.2-01 | Complete |
| STATE-04 | Phase v3.2-01 | Complete |
| CREATE-01 | Phase v3.2-02 | Complete |
| CREATE-02 | Phase v3.2-02 | Complete |
| CREATE-03 | Phase v3.2-02 | Complete |
| CREATE-04 | Phase v3.2-02 | Complete |
| WORKTREE-01 | Phase v3.2-03 | Complete |
| WORKTREE-02 | Phase v3.2-03 | Complete |
| WORKTREE-03 | Phase v3.2-03 | Complete |
| WORKTREE-04 | Phase v3.2-03 | Complete |
| KANBAN-01 | Phase v3.2-04 | Complete |
| KANBAN-02 | Phase v3.2-04 | Complete |
| KANBAN-03 | Phase v3.2-04 | Complete |
| KANBAN-04 | Phase v3.2-04 | Complete |
| PM-01 | Phase v3.2-05 | Complete |
| PM-02 | Phase v3.2-05 | Complete |
| PM-03 | Phase v3.2-05 | Complete |
| PM-04 | Phase v3.2-05 | Complete |
| PM-05 | Phase v3.2-05 | Complete |
| PM-06 | Phase v3.2-05 | Complete |
| SPEC-01 | Phase v3.2-05 | Complete |
| SPEC-02 | Phase v3.2-05 | Complete |
| SPEC-03 | Phase v3.2-05 | Complete |
| SPEC-04 | Phase v3.2-05 | Complete |
| UI-01 | Phase v3.2-06 | Complete |
| UI-02 | Phase v3.2-06 | Complete |
| UI-03 | Phase v3.2-06 | Complete |
| UI-04 | Phase v3.2-06 | Complete |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-20*
*Last updated: 2026-01-20 after Phase v3.2-06 completion (milestone complete)*
