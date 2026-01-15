# Project Milestones: DAGent

## v2.3 Feature-to-Main Merge (Shipped: 2026-01-15)

**Delivered:** Complete feature-to-main merge workflow enabling users to merge completed features back to the working branch via AI-assisted merge or GitHub PR creation.

**Phases completed:** 52-55 (4 plans total)

**Key accomplishments:**

- Merge button with dropdown (AI Merge / Create PR) on completed feature cards
- FeatureMergeAgent class with state machine for merge workflow orchestration
- GitManager.mergeFeatureIntoMain() for automated branch merging with conflict detection
- PRService wrapping GitHub CLI (`gh`) for PR creation
- FeatureMergeDialog component with progress indicators and error handling
- Full IPC wiring from UI through preload API to main process agents
- Delete branch option after successful merge (feature + task branches)

**Stats:**

- 8 new files created
- ~1,300 lines of TypeScript added (23,654 total)
- 4 phases, 4 plans executed
- 160 source files total

**Git range:** `de493a1` → `7500f9e`

**What's next:** Consider E2E testing, error scenario handling, or next milestone planning.

---

## v2.2 Task Pipeline Refactor (Shipped: 2026-01-15)

**Delivered:** Refactored task execution pipeline so development agents don't commit (QA handles commits after review), with queue-based pool architecture.

**Phases completed:** 50-51 (4 plans total)

**Key accomplishments:**

- Queue-based pool refactor where pools represent workflow stages
- Orchestrator owns all task state transitions
- QA agent commits on successful review instead of dev agent
- Cleaner separation of concerns between agents

**Stats:**

- 2 phases, 4 plans executed
- Pipeline architecture simplified

**Git range:** `f78ffe3` → `44df9ae`

**What's next:** v2.3 Feature-to-Main Merge

---

## v2.1 Kanban Board Improvements (Shipped: 2026-01-15)

**Delivered:** Kanban-driven execution flow with automatic feature status from task states, start execution from cards, and UI polish.

**Phases completed:** 47-49 (3 plans total)

**Key accomplishments:**

- Automatic feature status derived from task execution states
- Start button on Kanban cards for direct execution
- Polished Kanban UI with consistent spacing and layout

**Stats:**

- 3 phases, 3 plans executed
- Kanban becomes primary execution interface

**Git range:** `6420cb4` → `ae9914d`

**What's next:** v2.2 Task Pipeline Refactor

---

## v2.0 Request Manager & Task Pipeline (Shipped: 2026-01-15)

**Delivered:** Major architectural overhaul for scalable parallel execution with centralized request management, granular task states, QA agent implementation, and simplified agent communication model.

**Phases completed:** 41-46 (9 plans total)

**Key accomplishments:**

- RequestManager with 6-level priority queue (PM > HARNESS_MERGE > MERGE > QA > HARNESS_DEV > DEV)
- Task state machine refactored with dev→qa→merging pipeline and QA feedback loop
- TaskPoolManager with O(1) lookups for efficient task assignment by status
- QA Agent implementation with autonomous code review capability
- Simplified communication model - only dev talks to harness, QA/merge autonomous
- Dynamic state badges on TaskNode showing active execution state (DEV/QA/MERGE/FAILED)

**Stats:**

- 49 files modified
- +3,679 lines of TypeScript (21,589 total)
- 6 phases, 9 plans executed
- 2 days development time (2026-01-13 → 2026-01-15)

**Git range:** `feat(41-01)` → `feat(46-01)`

**What's next:** Consider testing, deployment packaging, or next milestone planning.

---

## v1.9 Agent Communication Architecture (Shipped: 2026-01-14)

**Delivered:** Full message-based communication architecture between agents. Task agents now have per-task session files for conversation history, and all inter-agent communication flows through a central MessageBus using publish/subscribe patterns.

**Phases completed:** 37-40 (8 plans total)

**Key accomplishments:**

- TaskAgentSession and TaskAgentMessage types for per-task conversation history
- Per-task session storage at `.dagent/nodes/{taskId}/session.json`
- Bidirectional message tracking (task_to_harness/harness_to_task)
- TaskAgent automatic session lifecycle logging
- Session resume detection for interrupted tasks
- InterAgentMessage types with 7 message types for full agent communication
- MessageBus singleton with publish/subscribe and multi-channel emission
- Factory functions for typed message construction
- HarnessAgent message routing by type (task_registered, intention_proposed, etc.)
- Complete migration from direct method calls to message-based communication
- SessionLogDialog with conversation-style UI for viewing task-harness sessions
- Direction-based styling (blue outgoing, purple incoming)
- Real-time session polling during task execution

**Stats:**

- 4 phases, 8 plans executed
- 12 source files modified/created
- Full migration from direct calls to message-based communication

**Git range:** `feat(37-01)` -> `docs(40-01)`

**What's next:** Consider additional agent types, parallel execution, or deployment packaging.

---

## v1.4 Agent System Overhaul (Shipped: 2026-01-14)

**Delivered:** Complete agent system overhaul with centralized chat, PM Agent CRUD operations, feature deletion, and universal context access for all agents.

**Phases completed:** 19-24 (11 plans total)

**Key accomplishments:**

- ChatPanel component with unified chat UI for all agent contexts
- Agents View with agent configuration and status display
- PM Agent with full task CRUD (Create, Update, Delete) via natural language
- Intelligent dependency inference for new tasks
- Batch operations and task reorganization tools
- Safe feature deletion with full cleanup (worktrees, branches, storage, agents)
- ContextService for comprehensive project/codebase context assembly
- Universal context access - all agents receive project structure, CLAUDE.md, git history
- Agent prompt builders with role-specific instructions (PM, Harness, Task, Merge)
- autoContext option for automatic prompt injection in agent queries

**Stats:**

- 51 source files modified
- ~6,410 lines of TypeScript added
- 6 phases, 11 plans executed
- Approximately 5 hours development time

**Git range:** `feat(19-01)` -> `docs(24-02)`

**What's next:** Project is feature-complete. Consider deployment packaging, testing, or new feature requests.

---

## v1.3 Claude Agent SDK Migration (Shipped: 2026-01-13)

**Delivered:** Full migration to Claude Agent SDK for all AI operations with tool presets, streaming responses, and permission modes.

**Phases completed:** 16-18 (8 plans total)

**Key accomplishments:**

- Claude Agent SDK (@anthropic-ai/claude-agent-sdk) integration
- AgentService wrapper with streaming query support
- Tool presets per agent type (featureChat, taskAgent, harnessAgent, mergeAgent, pmAgent)
- ToolUsageDisplay component for streaming tool events
- HarnessAgent SDK migration with intelligent intention review
- TaskAgent SDK migration with progress streaming and auto git commits
- MergeAgent SDK migration with conflict analysis
- Automatic authentication via Claude CLI credentials
- Permission modes (default, acceptEdits, bypassPermissions, plan)

**Stats:**

- 25+ source files modified
- ~1,800 lines of TypeScript added
- 3 phases, 8 plans executed

**Git range:** `feat(16-01)` -> `docs(18-03)`

**What's next:** v1.4 Agent System Overhaul

---

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
