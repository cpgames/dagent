# Architecture

**Analysis Date:** 2026-01-13

## Pattern Overview

**Overall:** Electron Desktop Application with Multi-Agent Orchestration

**Key Characteristics:**
- Standalone desktop application (Electron)
- Multi-process architecture (main + renderer + agent processes)
- DAG-based task dependency management
- Harness-agent coordination model
- Git worktree-based isolation

## Layers

**Main Process Layer:**
- Purpose: Application lifecycle, system integration, agent orchestration
- Contains: Auth Manager, Git Manager, Agent Process Manager
- Location: `src/main/` (planned)
- Depends on: Node.js, Electron, simple-git, child_process
- Used by: Renderer via IPC

**Renderer Process Layer:**
- Purpose: User interface and interaction
- Contains: React components, views (Kanban, DAG, Context)
- Location: `src/renderer/` (planned)
- Depends on: React, Zustand, React Flow, Tailwind
- Used by: User via UI

**Agent Communication Layer:**
- Purpose: Coordinate harness, task, and merge agents
- Contains: Intention/approval workflow, context handoff
- Location: `src/main/agents/` (planned)
- Depends on: Claude API, child_process
- Used by: Main process during execution

**Data Persistence Layer:**
- Purpose: Store features, DAGs, chat history, logs
- Contains: JSON file storage in .dagent directories
- Location: `.dagent-worktrees/` and `.dagent-archived/`
- Depends on: File system
- Used by: All layers

## Data Flow

**Feature Creation Flow:**
1. User clicks "+ New Feature" in UI
2. Renderer sends IPC to main process
3. Main process creates feature branch and worktree
4. AI generates initial DAG from user description
5. DAG stored in `.dagent/dag.json`
6. UI updates to show new feature tab

**Task Execution Flow:**
1. User clicks Play button
2. Harness agent spawned (always reserved)
3. Ready tasks identified (no blocking dependencies)
4. Task agents assigned from pool
5. Task agent proposes intention to harness
6. Harness approves/modifies/rejects
7. Task agent implements approved work
8. On completion: merge agent takes priority
9. Merge into feature branch
10. Newly unblocked tasks become ready
11. Repeat until all tasks complete

**State Management:**
- Zustand for UI state in renderer
- JSON files for persistent state (`.dagent/` directories)
- Git branches for code state

## Key Abstractions

**Feature:**
- Purpose: High-level unit of work with its own DAG
- Examples: "Car Builder", "Auth System", "Payments"
- Pattern: Each feature has branch, worktree, chat history
- Location: `DAGENT_SPEC.md` section 4.1

**Task (Node):**
- Purpose: Single unit of implementation work
- Examples: "Create Schema", "Build API", "Design UI"
- Pattern: Node in DAG with status, description, position
- Location: `DAGENT_SPEC.md` section 4.2

**Connection (Edge):**
- Purpose: Directed dependency between tasks
- Examples: "Schema → API", "API → UI"
- Pattern: From/to task IDs
- Location: `DAGENT_SPEC.md` section 4.3

**Agent Types:**
- Harness Agent: Orchestrator, sees everything, codes nothing
- Task Agent: Implements specific task in isolation
- Merge Agent: Handles branch merging with conflict resolution
- Pattern: Pool-based allocation with priority (harness > merge > task)
- Location: `DAGENT_SPEC.md` section 6.1

## Entry Points

**Electron Main:**
- Location: `src/main/index.ts` (planned)
- Triggers: Application startup
- Responsibilities: Window creation, IPC setup, agent management

**Electron Renderer:**
- Location: `src/renderer/index.tsx` (planned)
- Triggers: Window load
- Responsibilities: React app mounting, UI rendering

**Agent Processes:**
- Location: `src/main/agents/` (planned)
- Triggers: Execution start (Play button)
- Responsibilities: Task implementation, merge operations

## Error Handling

**Strategy:** Agent failures bubble to harness, harness logs and updates task status

**Patterns:**
- Task agent failure: status → 'failed', keep worktree for debugging
- Merge conflict: merge agent proposes resolution to harness
- Harness guidance on all critical decisions
- User-visible status in UI (red = needs attention)

## Cross-Cutting Concerns

**Authentication:**
- Priority chain: Claude CLI → OAuth env → stored → API key → manual (`DAGENT_SPEC.md` section 10.1)
- Credentials stored in `~/.dagent/credentials.json`

**Logging:**
- Harness log: `harness_log.json`
- Task logs: `nodes/{id}/logs.json`
- Structured entries with timestamp, type, agent, content

**Git Operations:**
- Worktree-based isolation
- Feature branches: `feature/{name}`
- Task branches: `feature/{name}/task-{id}`
- Merge-on-completion with conflict resolution

**IPC Communication:**
- Electron IPC between main and renderer
- Agent-harness communication via intention/approval protocol

---

*Architecture analysis: 2026-01-13*
*Note: This is a specification-only codebase - architecture is planned, not implemented*
