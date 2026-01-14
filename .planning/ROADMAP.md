# Roadmap: DAGent

## Overview

Build a complete Electron desktop application for dependency-aware AI agent orchestration. Starting with project foundation and data model, then implementing the core DAG execution engine and git integration, followed by the agent coordination system, and finally the UI views and polish.

## Domain Expertise

None

## Milestones

### Current Status

All planned milestones complete. Project is feature-complete through v1.4.

## Completed Milestones

<details>
<summary>v1.4 Agent System Overhaul (Phases 19-24) - SHIPPED 2026-01-14</summary>

- [x] **Phase 19: Centralized Chat Component** - ChatPanel with agent name, clear button (1/1 plans)
- [x] **Phase 20: Agents View** - Sidebar view for agent configuration and status (2/2 plans)
- [x] **Phase 21: Task Creation from Chat** - PM Agent creates tasks with dependency inference (2/2 plans)
- [x] **Phase 22: PM Agent CRUD Operations** - Full task management via PM Agent (2/2 plans)
- [x] **Phase 23: Feature Deletion** - Safe deletion with cleanup (1/1 plans)
- [x] **Phase 24: Universal Context Access** - Codebase/project context for all agents (2/2 plans)

**Total:** 6 phases, 11 plans

See [v1.4-ROADMAP.md](milestones/v1.4-ROADMAP.md) for details.

</details>

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

**All milestones complete.** 24 phases, 52 plans shipped.

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
| 11. Layout Restructure | v1.2 | 3/3 | Complete | 2026-01-13 |
| 12. Project Selection | v1.2 | 3/3 | Complete | 2026-01-13 |
| 13. Feature Chat | v1.2 | 3/3 | Complete | 2026-01-13 |
| 14. Git Branch Management | v1.2 | 2/2 | Complete | 2026-01-13 |
| 15. Alignment & Polish | v1.2 | 2/2 | Complete | 2026-01-13 |
| 16. Agent SDK Integration | v1.3 | 3/3 | Complete | 2026-01-13 |
| 17. Agent Tools & Permissions | v1.3 | 2/2 | Complete | 2026-01-13 |
| 18. Task Agent Migration | v1.3 | 3/3 | Complete | 2026-01-13 |
| 19. Centralized Chat Component | v1.4 | 1/1 | Complete | 2026-01-14 |
| 20. Agents View | v1.4 | 2/2 | Complete | 2026-01-14 |
| 21. Task Creation from Chat | v1.4 | 2/2 | Complete | 2026-01-14 |
| 22. PM Agent CRUD Operations | v1.4 | 2/2 | Complete | 2026-01-14 |
| 23. Feature Deletion | v1.4 | 1/1 | Complete | 2026-01-14 |
| 24. Universal Context Access | v1.4 | 2/2 | Complete | 2026-01-14 |
