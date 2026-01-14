# Project Milestones: DAGent

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
