# Roadmap: DAGent

## Overview

Build a complete Electron desktop application for dependency-aware AI agent orchestration. Starting with project foundation and data model, then implementing the core DAG execution engine and git integration, followed by the agent coordination system, and finally the UI views and polish.

## Domain Expertise

None

## Milestones

### Current Milestone: v1.9 Agent Communication Architecture

Refactor agent communication from direct method calls to message-based sessions.

- [ ] **Phase 37: Task Agent Sessions** - Per-task log files for conversation history with harness
- [ ] **Phase 38: Message Queue** - Replace direct method calls with message passing
- [ ] **Phase 39: Harness Router** - Harness receives and routes messages by taskId
- [ ] **Phase 40: Log UI Integration** - Update LogDialog to show per-task conversation history

## Phase Details

### Phase 37: Task Agent Sessions
**Goal**: Each task agent gets its own log file/session for conversation history with harness
**Depends on**: v1.8 (Communication Logging)
**Research**: Unlikely (internal file/type patterns)
**Plans**: TBD

Scope:
- Per-task log file: `.dagent/tasks/{taskId}/agent_log.json`
- TaskAgentSession type with message history
- Session lifecycle: create on task start, persist on messages, close on complete
- Load existing session on task resume

### Phase 38: Message Queue
**Goal**: Replace direct method calls with message passing between agents
**Depends on**: Phase 37
**Research**: Unlikely (event emitter patterns already in codebase)
**Plans**: TBD

Scope:
- AgentMessage type with from/to/type/payload
- MessageBus singleton for routing messages
- Task agent sends messages instead of calling harness methods
- Harness subscribes to task messages

### Phase 39: Harness Router
**Goal**: Harness receives and routes messages from all task agents by taskId
**Depends on**: Phase 38
**Research**: Unlikely (existing harness patterns)
**Plans**: TBD

Scope:
- Harness message handler for incoming task messages
- Route by taskId to appropriate handler (intention, action, completion)
- Send responses back through MessageBus
- Single harness session receiving all task communications

### Phase 40: Log UI Integration
**Goal**: Update LogDialog to show per-task conversation history
**Depends on**: Phase 39
**Research**: Unlikely (existing LogDialog patterns)
**Plans**: TBD

Scope:
- Load task-specific logs from per-task files
- Show conversation thread between task agent and harness
- Filter by message type (intention, approval, action)
- Real-time updates during execution

## Completed Milestones

<details>
<summary>v1.8 DAG Execution (Phases 33-36) - SHIPPED 2026-01-14</summary>

- [x] **Phase 33: Execution Orchestration** - Wire Start button to execution loop, ready task identification (1/1 plans)
- [x] **Phase 34: Agent Assignment** - PM assigns agents to ready tasks, task agent spawning (1/1 plans)
- [x] **Phase 35: Intention-Approval Workflow** - Task agents propose intentions, PM approves/modifies/rejects (1/1 plans)
- [x] **Phase 36: Communication Logging** - Log all agent communications to harness_log.json (1/1 plans)

**Total:** 4 phases, 4 plans

See [v1.8-ROADMAP.md](milestones/v1.8-ROADMAP.md) for details.

</details>

<details>
<summary>v1.7 Agent Logs (Phase 32) - SHIPPED 2026-01-14</summary>

- [x] **Phase 32: Agent Logs** - LogDialog, PM log types, task/PM log buttons (2/2 plans)

**Total:** 1 phase, 2 plans

See [v1.7-ROADMAP.md](milestones/v1.7-ROADMAP.md) for details.

</details>

<details>
<summary>v1.6 Task Selection Context (Phase 31) - SHIPPED 2026-01-14</summary>

- [x] **Phase 31: Task Selection Context** - Remove TaskChat overlay, pass selected task to PM context (1/1 plans)

**Total:** 1 phase, 1 plan

</details>

<details>
<summary>v1.5 UI Polish & Task Chat (Phases 25-30) - SHIPPED 2026-01-14</summary>

- [x] **Phase 25: Task Chat** - TaskChat component, dialog store, DAGView wiring (1/1 plans)
- [x] **Phase 26: Agent Logs** - AgentLogsPanel, live polling (1/1 plans)
- [x] **Phase 27: Resizable Chat** - ResizeHandle, width persistence (1/1 plans)
- [x] **Phase 28: Task Agent Badges** - Dev/QA/Merge badges on TaskNode (1/1 plans)
- [x] **Phase 29: Connection Management** - Edge selection, delete confirmation (1/1 plans)
- [x] **Phase 30: UI Layout Fixes** - Rename Play to Start, spacing improvements (1/1 plans)

**Total:** 6 phases, 6 plans

</details>

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

**v1.9 in progress.** 36 phases complete, 4 phases planned.

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
| 25. Task Chat | v1.5 | 1/1 | Complete | 2026-01-14 |
| 26. Agent Logs | v1.5 | 1/1 | Complete | 2026-01-14 |
| 27. Resizable Chat | v1.5 | 1/1 | Complete | 2026-01-14 |
| 28. Task Agent Badges | v1.5 | 1/1 | Complete | 2026-01-14 |
| 29. Connection Management | v1.5 | 1/1 | Complete | 2026-01-14 |
| 30. UI Layout Fixes | v1.5 | 1/1 | Complete | 2026-01-14 |
| 31. Task Selection Context | v1.6 | 1/1 | Complete | 2026-01-14 |
| 32. Agent Logs | v1.7 | 2/2 | Complete | 2026-01-14 |
| 33. Execution Orchestration | v1.8 | 1/1 | Complete | 2026-01-14 |
| 34. Agent Assignment | v1.8 | 1/1 | Complete | 2026-01-14 |
| 35. Intention-Approval Workflow | v1.8 | 1/1 | Complete | 2026-01-14 |
| 36. Communication Logging | v1.8 | 1/1 | Complete | 2026-01-14 |
| 37. Task Agent Sessions | v1.9 | 0/? | Not started | - |
| 38. Message Queue | v1.9 | 0/? | Not started | - |
| 39. Harness Router | v1.9 | 0/? | Not started | - |
| 40. Log UI Integration | v1.9 | 0/? | Not started | - |
