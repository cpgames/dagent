# DAGent

## What This Is

A standalone Electron desktop application for dependency-aware AI agent orchestration. DAGent solves the fundamental problem with parallel AI coding agents: when multiple agents work on dependent tasks simultaneously, they produce incompatible outputs. DAGent ensures tasks execute in dependency order, with context flowing from completed work to dependent tasks.

## Core Value

Tasks execute in correct dependency order with context handoff between agents - the DAG execution engine must work correctly or nothing else matters.

## Current State (v1.0 MVP)

Shipped 2026-01-13. Full implementation complete:
- 89 source files, ~9,043 LOC TypeScript
- 7 phases, 25 plans executed
- All core features implemented per DAGENT_SPEC.md

## Requirements

### Validated

- [x] Electron desktop application shell (cross-platform) - v1.0
- [x] Three main views: Kanban, DAG Graph, and Context - v1.0
- [x] DAG-based task dependency management with topological execution - v1.0
- [x] Agent pool with harness/task/merge agent types - v1.0
- [x] Intention-approval workflow between task agents and harness - v1.0
- [x] Git worktree-based isolation for task branches - v1.0
- [x] Feature and task branch management - v1.0
- [x] Real-time DAG visualization with React Flow - v1.0
- [x] Node dialog for editing task details - v1.0
- [x] Feature-level chat interface - v1.0
- [x] Graph versioning with undo/redo (20 versions) - v1.0
- [x] JSON file storage in .dagent directories - v1.0
- [x] Authentication priority chain (Claude CLI, OAuth, API key) - v1.0
- [x] Play/Stop execution controls - v1.0
- [x] Merge agent for branch integration - v1.0
- [x] Error handling with toast notifications - v1.0

### Active

- [ ] Node-level chat (scoped AI for individual tasks)
- [ ] Locking behavior for nodes and connections
- [ ] Re-evaluate dependencies button functionality
- [ ] Claude CLI credential auto-detection (complex)
- [ ] Merge conflict resolution UI

### Out of Scope

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

## Constraints

- **Tech stack**: Electron + React + TypeScript + Zustand + React Flow + Tailwind + simple-git - as specified in DAGENT_SPEC.md section 12.3
- **Platform priority**: Windows-first development and testing
- **Architecture**: Must follow spec's multi-process model (main + renderer + agent processes)
- **Storage**: JSON files in .dagent directories, no external database

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| electron-vite over electron-forge | Vite-native integration, faster builds | Good |
| Tailwind CSS v4 | Latest version, @tailwindcss/vite plugin | Good |
| @xyflow/react v12 | React Flow for DAG visualization | Good |
| Zustand for state | Simple, TypeScript-friendly | Good |
| simple-git for git ops | Well-maintained, full feature set | Good |
| @shared path alias | Types shared between main/renderer | Good |

---
*Last updated: 2026-01-13 after v1.0 milestone*
