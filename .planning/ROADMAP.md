# Roadmap: DAGent

## Overview

Build a complete Electron desktop application for dependency-aware AI agent orchestration. Starting with project foundation and data model, then implementing the core DAG execution engine and git integration, followed by the agent coordination system, and finally the UI views and polish.

## Domain Expertise

None

## Milestones

### v1.4 Agent System Overhaul (Active)

Major overhaul of the agent system with unified chat UI, configurable agent roles, intelligent task management, and universal context access.

| Phase | Description | Plans | Status |
|-------|-------------|-------|--------|
| 19. Centralized Chat Component | Unified ChatPanel with agent name, clear button | 2-3 | Planned |
| 20. Agents View | Sidebar view for agent configuration and status | 2-3 | Planned |
| 21. Task Creation from Chat | PM Agent creates tasks with dependency inference | 2 | Planned |
| 22. PM Agent CRUD Operations | Full task management via PM Agent | 2 | Planned |
| 23. Feature Deletion | Safe deletion with cleanup | 1-2 | Planned |
| 24. Universal Context Access | Codebase/project context for all agents | 2 | Planned |

**Total:** 6 phases, ~12-16 plans

See [v1.4-ROADMAP.md](milestones/v1.4-ROADMAP.md) for details.

## Completed Milestones

<details>
<summary>v1.3 Claude Agent SDK Migration (Phases 16-18) - SHIPPED 2026-01-13</summary>

- [x] **Phase 16: Agent SDK Integration** - Install SDK, AgentService wrapper, IPC (3/3 plans)
- [x] **Phase 17: Agent Tools & Permissions** - Tool presets, ToolUsageDisplay (2/2 plans)
- [x] **Phase 18: Task Agent Migration** - Harness, Task, Merge agent SDK migration (3/3 plans)

**Total:** 3 phases, 8 plans

</details>

<details>
<summary>v1.2 UX Overhaul (Phases 11-15) - SHIPPED 2026-01-13</summary>

- [x] **Phase 11: Layout Restructure** - Vertical sidebar, status bar (3/3 plans)
- [x] **Phase 12: Project Selection** - Dialog, wizard, recent projects (3/3 plans)
- [x] **Phase 13: Feature Chat** - Persistence, AI integration, context (3/3 plans)
- [x] **Phase 14: Git Branch Management** - Status monitoring, branch switcher (2/2 plans)
- [x] **Phase 15: Alignment & Polish** - Layout fixes, final polish (2/2 plans)

**Total:** 5 phases, 10 plans

</details>

<details>
<summary>v1.1 Critical Fixes (Phases 8-10) - SHIPPED 2026-01-13</summary>

- [x] **Phase 8: Authentication Fixes** - Auth init, credential detection, status UI (3/3 plans)
- [x] **Phase 9: Feature Creation** - Backend, dialog, button wiring (3/3 plans)
- [x] **Phase 10: UI Polish** - Loading states, errors, dirty tracking, layout (4/4 plans)

**Total:** 3 phases, 10 plans, ~850 LOC added

</details>

<details>
<summary>v1.0 MVP (Phases 1-7) - SHIPPED 2026-01-13</summary>

- [x] **Phase 1: Foundation** - Electron + React + TypeScript project setup (3/3 plans)
- [x] **Phase 2: Data Model & Storage** - Core types, JSON persistence, .dagent structure (3/3 plans)
- [x] **Phase 3: DAG Engine** - Dependency resolution, topological ordering, state machine (3/3 plans)
- [x] **Phase 4: Git Integration** - Worktree management, branch operations, merge handling (3/3 plans)
- [x] **Phase 5: Agent System** - Harness/task/merge agents, intention-approval workflow (4/4 plans)
- [x] **Phase 6: UI Views** - Kanban, DAG graph, Context views, node dialogs (5/5 plans)
- [x] **Phase 7: Polish & Integration** - Auth, undo/redo, error handling (4/4 plans)

**Total:** 7 phases, 25 plans, ~9,043 LOC TypeScript

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-01-13 |
| 2. Data Model & Storage | v1.0 | 3/3 | Complete | 2026-01-13 |
| 3. DAG Engine | v1.0 | 3/3 | Complete | 2026-01-13 |
| 4. Git Integration | v1.0 | 3/3 | Complete | 2026-01-13 |
| 5. Agent System | v1.0 | 4/4 | Complete | 2026-01-13 |
| 6. UI Views | v1.0 | 5/5 | Complete | 2026-01-13 |
| 7. Polish & Integration | v1.0 | 4/4 | Complete | 2026-01-13 |
| 8. Authentication Fixes | v1.1 | 3/3 | Complete | 2026-01-13 |
| 9. Feature Creation | v1.1 | 3/3 | Complete | 2026-01-13 |
| 10. UI Polish | v1.1 | 4/4 | Complete | 2026-01-13 |

**v1.0 + v1.1 + v1.2 + v1.3 complete.** 18 phases, 53 plans shipped.

## v1.3 Claude Agent SDK Migration (Complete)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 16. Agent SDK Integration | v1.3 | 3/3 | Complete | 2026-01-13 |
| 17. Agent Tools & Permissions | v1.3 | 2/2 | Complete | 2026-01-13 |
| 18. Task Agent Migration | v1.3 | 3/3 | Complete | 2026-01-13 |

## v1.2 UX Overhaul (Complete)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 11. Layout Restructure | v1.2 | 3/3 | Complete | 2026-01-13 |
| 12. Project Selection | v1.2 | 3/3 | Complete | 2026-01-13 |
| 13. Feature Chat | v1.2 | 3/3 | Complete | 2026-01-13 |
| 14. Git Branch Management | v1.2 | 2/2 | Complete | 2026-01-13 |
| 15. Alignment & Polish | v1.2 | 2/2 | Complete | 2026-01-13 |
