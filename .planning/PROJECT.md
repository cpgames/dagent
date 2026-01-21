# DAGent

## What This Is

A standalone Electron desktop application for dependency-aware AI agent orchestration. DAGent solves the fundamental problem with parallel AI coding agents: when multiple agents work on dependent tasks simultaneously, they produce incompatible outputs. DAGent ensures tasks execute in dependency order, with context flowing from completed work to dependent tasks.

## Core Value

Tasks execute in correct dependency order with context handoff between agents - the DAG execution engine must work correctly or nothing else matters.

## Current Milestone: Planning Next Version

**Status:** v3.2 complete. Ready for next milestone planning.

## Current State (v3.2 Feature State Machine & Non-Blocking Creation)

Shipped 2026-01-20. Complete feature state machine refactor:
- 6 phases (v3.2-01 through v3.2-06) completed, 11 plans executed
- 9-state feature lifecycle: not_started → creating_worktree → investigating → questioning → planning → ready → in_progress → completed → archived
- Non-blocking feature creation (instant, worktree created on Start click)
- PM agent auto-triggers on investigating state
- Real-time spec updates via event subscription
- State-specific icons (magnifying glass, question mark, chart)
- Context-aware controls (Start button disabled with tooltips during planning)
- 4-column Kanban: Backlog, In Progress, Completed, Archived
- 56,195 lines TypeScript total

## Previous State (v3.1 Task Analysis Orchestrator)

Shipped 2026-01-18. Orchestrator-controlled task analysis loop:
- 4 phases (v3.1-01 through v3.1-04) completed, 12 plans executed
- `needs_analysis` task status with purple/violet UI
- Feature creation auto-creates single `needs_analysis` task
- TaskAnalysisOrchestrator iteratively analyzes tasks (keep/split)
- PM analysis prompt with structured JSON decision format
- Analysis UI in Kanban (spinner) and DAG View (button, animation)
- `autoAnalyzeNewFeatures` setting (default: true)

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
- [x] Auth initialization on app startup - v1.1
- [x] Auth status indicator and credential dialog - v1.1
- [x] Feature creation from UI with dialog - v1.1
- [x] Loading states for all async operations - v1.1
- [x] Inline error display (DAGView, ContextView) - v1.1
- [x] Dirty state tracking with unsaved changes warning - v1.1
- [x] Proper flex layout for ContextView textarea - v1.1
- [x] Vertical right sidebar for views (Kanban, DAG, Context) - v1.2
- [x] Bottom status bar with auth and git info - v1.2
- [x] Project selection on startup (open/create) - v1.2
- [x] Feature chat with AI responses and persistence - v1.2
- [x] Git branch display and switching in status bar - v1.2
- [x] Claude Agent SDK integration for all agents - v1.3
- [x] Tool presets per agent type (PM, Task, Harness, Merge) - v1.3
- [x] Streaming responses with tool usage display - v1.3
- [x] Centralized ChatPanel component for all agent contexts - v1.4
- [x] Agents View with configuration and status display - v1.4
- [x] PM Agent with task CRUD operations via chat - v1.4
- [x] Dependency inference for new tasks - v1.4
- [x] Safe feature deletion with full cleanup - v1.4
- [x] Universal context access for all agents - v1.4
- [x] ContextService for project/codebase context assembly - v1.4
- [x] Agent prompt builders with role-specific instructions - v1.4
- [x] Task chat overlay for per-task agent conversations - v1.5
- [x] Agent logs panel with live polling - v1.5
- [x] Resizable chat panel with localStorage persistence - v1.5
- [x] Task agent badges (Dev, QA, Merge) on task nodes - v1.5
- [x] Connection management with edge selection and deletion - v1.5
- [x] UI layout improvements (Start button, spacing) - v1.5
- [x] Selected task context passed to PM agent - v1.6
- [x] LogDialog component for viewing agent communications - v1.7
- [x] PM log types (pm-query, pm-response) - v1.7
- [x] Task log button showing task-specific agent logs - v1.7
- [x] PM log button showing PM agent communications - v1.7
- [x] Tick-based execution loop with 1-second intervals - v1.8
- [x] Automatic agent assignment to ready tasks - v1.8
- [x] Intention-approval workflow wired in orchestrator - v1.8
- [x] Real-time communication logging to harness_log.json - v1.8
- [x] Automatic feature status from task states - v2.1
- [x] Start execution from Kanban card - v2.1
- [x] Polished Kanban UI with consistent spacing - v2.1
- [x] QA agent commits on review success (dev doesn't commit) - v2.2
- [x] Queue-based pool architecture for task pipeline - v2.2
- [x] Merge button on completed features (AI Merge / Create PR) - v2.3
- [x] FeatureMergeAgent with conflict detection - v2.3
- [x] GitHub PR creation via gh CLI - v2.3
- [x] FeatureMergeDialog with progress and error handling - v2.3
- [x] Ralph Loop iterative execution with fresh context windows - v2.4
- [x] DevAgentConfig with iteration mode and checklist items - v2.4
- [x] TaskController iteration loop with automated verification - v2.4
- [x] Loop status IPC (get/abort/subscribe) from orchestrator - v2.4
- [x] TaskNode iteration badges with checklist mini-dots - v2.4
- [x] NodeDialog loop progress section with abort button - v2.4
- [x] FeatureSpec types with goals, requirements, constraints, acceptance criteria - v2.5
- [x] FeatureSpecStore for markdown-based spec persistence - v2.5
- [x] PM agent spec tools (create_spec, update_spec, get_spec) via MCP - v2.5
- [x] Intelligent task decomposition with complexity analysis - v2.5
- [x] Spec-aware DevAgent receives full feature spec for context - v2.5
- [x] Spec-aware QA validates against acceptance criteria - v2.5
- [x] Context-aware checkpointing (~150k token limit) - v2.5
- [x] Removed loop counter badge from TaskNode UI - v2.5
- [x] FeatureSpecViewer component in DAGView sidebar - v2.5
- [x] useAnimationFrame hook with delta time and pause support - v2.7
- [x] UnifiedCanvas component with resize handling and DPR support - v2.7
- [x] Layer interface (init/update/render/reset) for composable effects - v2.7
- [x] Reduced motion detection with static fallback - v2.7
- [x] Sky gradient layer (deep purple to pink) - v2.7
- [x] Starfield layer with 360 stars and sinusoidal flicker - v2.7
- [x] Horizon glow layer with pulsing animation - v2.7
- [x] Perspective grid layer with curved lines - v2.7
- [x] Shooting stars layer with trails (1% spawn, max 3 concurrent) - v2.7
- [x] Terrain silhouettes layer with parallax depths - v2.7
- [x] Single canvas replaces all CSS background components - v2.7
- [x] Single requestAnimationFrame loop for all layers - v2.7
- [x] Removed deprecated Starfield, Horizon, and SynthwaveBackground CSS components - v2.7
- [x] ResizeObserver with 100ms debounce - v2.7
- [x] SessionManager service for centralized session storage - v3.0
- [x] Automatic compaction at 100k tokens with checkpoint preservation - v3.0
- [x] Token estimation (character-based, 4 chars = 1 token) - v3.0
- [x] PM Agent SessionManager integration - v3.0
- [x] Dev Agent SessionManager integration with task sessions - v3.0
- [x] QA Agent SessionManager integration - v3.0
- [x] Harness Agent SessionManager integration - v3.0
- [x] Merge Agent SessionManager integration - v3.0
- [x] SessionStatus UI component (token count, version, compaction count) - v3.0
- [x] CheckpointViewer UI component (collapsible sections) - v3.0
- [x] SessionActions menu (clear, compact, export, reset) - v3.0
- [x] Migration from legacy chat.json format - v3.0
- [x] Migration from legacy dev session.json format - v3.0
- [x] Old chat APIs deprecated with console warnings - v3.0
- [x] Session architecture documentation (486 lines) - v3.0
- [x] Compaction guide documentation (366 lines) - v3.0
- [x] API reference documentation (896 lines) - v3.0
- [x] File structure documentation (319 lines) - v3.0
- [x] 9-state feature lifecycle (not_started → creating_worktree → investigating → questioning → planning → ready → in_progress → completed → archived) - v3.2
- [x] Validated state transitions (only valid transitions allowed) - v3.2
- [x] Feature storage schema supports all 9 states - v3.2
- [x] Non-blocking feature creation (instant, no worktree) - v3.2
- [x] Deferred worktree creation on Start button click - v3.2
- [x] Background worktree creation with progress indicators - v3.2
- [x] Automatic transition to investigating when worktree ready - v3.2
- [x] 4-column Kanban (Backlog, In Progress, Completed, Archived) - v3.2
- [x] Event-driven Kanban updates via feature:status-changed events - v3.2
- [x] Start button in Backlog cards triggers worktree creation - v3.2
- [x] PM agent auto-triggers on investigating state - v3.2
- [x] Chat routing to PM during investigating/questioning/planning - v3.2
- [x] PM can skip questioning and go directly to planning - v3.2
- [x] Real-time spec updates via spec:updated events - v3.2
- [x] DAG header shows planning phase badge - v3.2
- [x] Start button disabled with tooltips during planning phases - v3.2
- [x] State-specific icons in feature cards (magnifying glass, question mark, chart) - v3.2
- [x] Visual progress indicators for planning phases - v3.2

### Backlog

- [ ] Object pooling for stars and shooting stars (deferred from v2.7)
- [ ] Context caching with GPU context loss handling (deferred from v2.7)
- [ ] Node-level chat (scoped AI for individual tasks)
- [ ] Locking behavior for nodes and connections
- [ ] Re-evaluate dependencies button functionality
- [ ] Merge conflict resolution UI
- [ ] Deployment packaging (Windows installer)

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

| view-store for dirty state | Cross-component communication | Good |
| beforeunload for close protection | Browser native unsaved warning | Good |
| Claude Agent SDK | Official SDK for agent queries | Good |
| Tool presets per agent | Different capabilities per role | Good |
| ContextService singleton | Centralized context assembly | Good |
| autoContext option | Automatic prompt injection | Good |
| LogService with cache | Efficient log persistence | Good |
| Event-driven logging | Subscribe to harness:message events | Good |

| Webkit scrollbar styling | Tailwind v4 lacks scrollbar utilities | Good |
| Feature status from tasks | Priority rules for column placement | Good |
| SessionManager singleton | Centralized session management | Good |
| Token estimation (char-based) | 4 chars = 1 token, fast and accurate | Good |
| Auto-compaction at 90k | Leaves buffer before 100k limit | Good |
| Jest over Vitest | Node.js v24 compatibility issues | Good |
| 9-state feature lifecycle | Explicit states for planning workflow | Good |
| 4-column Kanban | 9 states mapped to intuitive columns | Good |
| Non-blocking creation | Instant UX, deferred heavy operations | Good |
| PM auto-trigger | Seamless planning workflow | Good |
| Event-driven spec updates | Real-time UI refresh | Good |
| State-specific icons | Visual phase identification at a glance | Good |

---
*Last updated: 2026-01-20 after v3.2 milestone*
