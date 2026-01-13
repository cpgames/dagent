# Roadmap: DAGent

## Overview

Build a complete Electron desktop application for dependency-aware AI agent orchestration. Starting with project foundation and data model, then implementing the core DAG execution engine and git integration, followed by the agent coordination system, and finally the UI views and polish.

## Domain Expertise

None

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation** - Electron + React + TypeScript project setup
- [x] **Phase 2: Data Model & Storage** - Core types, JSON persistence, .dagent structure
- [x] **Phase 3: DAG Engine** - Dependency resolution, topological ordering, state machine
- [x] **Phase 4: Git Integration** - Worktree management, branch operations, merge handling
- [x] **Phase 5: Agent System** - Harness/task/merge agents, intention-approval workflow
- [x] **Phase 6: UI Views** - Kanban, DAG graph, Context views, node dialogs
- [x] **Phase 7: Polish & Integration** - Auth, chat, undo/redo, error handling

## Phase Details

### Phase 1: Foundation
**Goal**: Working Electron app with React + TypeScript, Tailwind styling, basic window management
**Depends on**: Nothing (first phase)
**Research**: Likely (Electron + Vite setup patterns)
**Research topics**: electron-vite or electron-forge setup, Tailwind integration with Electron
**Plans**: TBD

Plans:
- [x] 01-01: Project scaffolding and build configuration
- [x] 01-02: Electron main/renderer process structure
- [x] 01-03: Basic window and IPC setup

### Phase 2: Data Model & Storage
**Goal**: TypeScript interfaces matching spec, JSON read/write, directory management
**Depends on**: Phase 1
**Research**: Unlikely (standard TypeScript patterns)
**Plans**: TBD

Plans:
- [x] 02-01: Core type definitions (Feature, Task, Connection, DAGGraph)
- [x] 02-02: JSON file operations and .dagent directory structure
- [x] 02-03: Zustand stores for state management

### Phase 3: DAG Engine
**Goal**: Dependency resolution algorithm, task status transitions, execution ordering
**Depends on**: Phase 2
**Research**: Unlikely (graph algorithms, internal logic)
**Plans**: TBD

Plans:
- [x] 03-01: Topological sort and dependency resolution
- [x] 03-02: Task state machine (blocked -> ready -> running -> merging -> completed/failed)
- [x] 03-03: Execution orchestration and ready task identification

### Phase 4: Git Integration
**Goal**: Worktree creation/deletion, branch management, merge operations via simple-git
**Depends on**: Phase 2
**Research**: Likely (simple-git API, worktree patterns)
**Research topics**: simple-git worktree commands, branch naming conventions, merge conflict detection
**Plans**: TBD

Plans:
- [x] 04-01: Git manager with simple-git setup
- [x] 04-02: Worktree lifecycle (create, delete, list)
- [x] 04-03: Branch operations and merge handling

### Phase 5: Agent System
**Goal**: Agent pool, harness coordination, task/merge agent spawning, intention-approval IPC
**Depends on**: Phase 3, Phase 4
**Research**: Likely (Claude API integration, child process management)
**Research topics**: @anthropic-ai/sdk usage, Node.js child_process patterns for agent spawning
**Plans**: TBD

Plans:
- [x] 05-01: Agent pool and process management
- [x] 05-02: Harness agent implementation
- [x] 05-03: Task agent with intention-approval workflow
- [x] 05-04: Merge agent for branch integration

### Phase 6: UI Views
**Goal**: Kanban board, DAG graph with React Flow, Context editor, node dialogs
**Depends on**: Phase 2, Phase 3
**Research**: Likely (React Flow integration)
**Research topics**: React Flow custom nodes, drag-to-connect, Zustand integration
**Plans**: TBD

Plans:
- [x] 06-01: App layout and navigation (tab structure)
- [x] 06-02: Kanban view with feature cards
- [x] 06-03: DAG view with React Flow graph
- [x] 06-04: Node dialog and Context view
- [x] 06-05: Feature chat sidebar

### Phase 7: Polish & Integration
**Goal**: Auth flow, chat interfaces, undo/redo, error handling, execution controls
**Depends on**: Phase 5, Phase 6
**Research**: Likely (Claude CLI credential detection)
**Research topics**: Claude CLI config file locations, OAuth token handling

Plans:
- [x] 07-01: Authentication priority chain
- [x] 07-02: Play/Stop execution controls
- [x] 07-03: Graph versioning and undo/redo
- [x] 07-04: Error handling and status displays

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-01-13 |
| 2. Data Model & Storage | 3/3 | Complete | 2026-01-13 |
| 3. DAG Engine | 3/3 | Complete | 2026-01-13 |
| 4. Git Integration | 3/3 | Complete | 2026-01-13 |
| 5. Agent System | 4/4 | Complete | 2026-01-13 |
| 6. UI Views | 5/5 | Complete | 2026-01-13 |
| 7. Polish & Integration | 4/4 | Complete | 2026-01-13 |

**Milestone 1: Complete** - All 7 phases executed successfully.
