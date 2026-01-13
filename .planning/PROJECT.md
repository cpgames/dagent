# DAGent

## What This Is

A standalone Electron desktop application for dependency-aware AI agent orchestration. DAGent solves the fundamental problem with parallel AI coding agents: when multiple agents work on dependent tasks simultaneously, they produce incompatible outputs. DAGent ensures tasks execute in dependency order, with context flowing from completed work to dependent tasks.

## Core Value

Tasks execute in correct dependency order with context handoff between agents - the DAG execution engine must work correctly or nothing else matters.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet - ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Electron desktop application shell (cross-platform: Windows, macOS, Linux)
- [ ] Three main views: Kanban, DAG Graph, and Context
- [ ] DAG-based task dependency management with topological execution
- [ ] Agent pool with harness/task/merge agent types
- [ ] Intention-approval workflow between task agents and harness
- [ ] Git worktree-based isolation for task branches
- [ ] Feature and task branch management
- [ ] Real-time DAG visualization with React Flow
- [ ] Node dialog for editing task details
- [ ] Feature-level and node-level chat interfaces
- [ ] Graph versioning with undo/redo (20 versions)
- [ ] Locking behavior for nodes and connections
- [ ] JSON file storage in .dagent directories
- [ ] Authentication priority chain (Claude CLI, OAuth, API key)
- [ ] Play/Stop execution controls
- [ ] Merge agent for branch integration with conflict resolution

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Multi-user / collaboration - single user only for v1, adds complexity without core value
- Cloud sync / backup - local-only storage keeps architecture simple
- Plugin system - no extensibility in v1, focus on core functionality first
- Mobile support - desktop-only as per spec

## Context

This project has a complete specification document (`DAGENT_SPEC.md`) covering all aspects of the application. The codebase has been mapped (`.planning/codebase/`) identifying the planned architecture, stack, and concerns.

Key reference material:
- `DAGENT_SPEC.md` - Complete specification (1174 lines)
- `.planning/codebase/ARCHITECTURE.md` - System design patterns
- `.planning/codebase/STACK.md` - Technology decisions
- `.planning/codebase/CONCERNS.md` - Implementation risks and challenges

The spec references "Automaker" as a prior project with patterns to reuse (Electron shell, Kanban, auth) but explicitly notes its git worktree implementation should be rebuilt from scratch.

## Constraints

- **Tech stack**: Electron + React + TypeScript + Zustand + React Flow + Tailwind + simple-git - as specified in DAGENT_SPEC.md section 12.3
- **Platform priority**: Windows-first development and testing
- **Architecture**: Must follow spec's multi-process model (main + renderer + agent processes)
- **Storage**: JSON files in .dagent directories, no external database

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Full spec implementation | User wants complete application, not subset | - Pending |
| DAG execution engine as core | This is the differentiator - must work first | - Pending |
| Windows-first development | User's primary platform | - Pending |

---
*Last updated: 2026-01-13 after initialization*
