# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Development
npm run dev              # Start dev server with hot reload
npm start                # Run production build

# Type Checking
npm run typecheck        # Check both main and renderer
npm run typecheck:node   # Check main/preload only
npm run typecheck:web    # Check renderer only

# Code Quality
npm run lint             # ESLint check
npm run format           # Prettier format

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage

# Building
npm run build            # Full build with typecheck
npm run build:win        # Windows installer
npm run build:unpack     # Unpacked build for testing
```

## Architecture Overview

DAGent is a **dependency-aware AI agent orchestration platform** built with Electron. The architecture centers around:

1. **Multi-agent system** (PM, Dev, QA, Merge agents)
2. **DAG-based task execution** with dependency tracking
3. **Git worktree isolation** for parallel development
4. **Session management** with automatic context compaction
5. **Event-driven orchestration** using EventEmitters

### Core Architectural Patterns

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Singleton** | AgentPool, GitManager, SessionManager, MessageBus | Single source of truth per service |
| **EventEmitter** | DAGManager, ExecutionOrchestrator, MessageBus | Loose coupling between components |
| **State Machine** | Task status transitions, orchestration loop | Clear state boundaries and transitions |
| **Request Queuing** | RequestManager with priority levels | Fair resource allocation across agents |
| **Isolation** | Git worktrees per feature/task | Independent work contexts |
| **Checkpoint Compression** | SessionManager token compaction | Manage Claude API token limits |
| **Cascade Updates** | cascadeTaskCompletion() | Automatic dependency handling |

## Key Concepts

### 1. Agent System (`src/main/agents/`)

**AgentPool** manages agent lifecycle as a singleton:
- Agents register but don't spawn processes
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) handles LLM communication
- Status lifecycle: `idle` → `busy` → `terminated`
- Agent types: `harness` (1 max), `task`, `merge`, `qa` (unlimited)

**DevAgent Context Assembly** (`src/main/agents/dev-agent.ts`):
When a dev agent executes a task, context is assembled from:
1. CLAUDE.md (project guidelines)
2. Feature spec (PM-generated goals/requirements)
3. Task title/description
4. Dependency context (outputs from completed parent tasks)
5. Other tasks (scope awareness)
6. Attachments (screenshots, mockups from `.dagent/attachments/`)
7. QA feedback (if rework iteration)
8. Worktree path (git isolation)

This context flows into `buildExecutionPrompt()` which creates the full system prompt for the Claude API.

### 2. DAG Engine (`src/main/dag-engine/`)

**DAGManager** (`dag-manager.ts`) handles graph operations:
- Add/remove nodes and connections
- Cycle detection in `validateConnection()`
- Auto-layout with hierarchical positioning
- Emits events: `node-added`, `connection-added`, `graph-reset`, etc.

**ExecutionOrchestrator** (`orchestrator.ts`) is the **main execution loop**:
- Runs at 1000ms intervals when feature execution is active
- Each tick:
  1. `getNextReadyTasks()` - find tasks with satisfied dependencies
  2. `assignTasksToAgents()` - spawn DevAgents for ready tasks
  3. `monitorExecutingTasks()` - check agent status
  4. `cascadeTaskCompletion()` - update dependent tasks when parent completes
- Emits: `task-assigned`, `task-completed`, `feature-completed`, etc.

**TaskController** (`task-controller.ts`) handles iterative execution:
- Dev agents iterate until task passes QA
- `executeIteration()` runs simplified execution for rework
- `checkReadiness()` verifies task completion

### 3. Session Management (`src/main/services/session-manager.ts`)

Sessions are **lazily created** and **automatically compacted**:

**Session ID Pattern**: `"{agentType}-{type}-{featureId}[-{taskId}[-{state}]]"`
- Feature: `"dev-feature-feature-my-feature"`
- Task: `"dev-task-feature-my-feature-task-123-in_dev"`

**File Structure per Session**:
```
.dagent-worktrees/{featureId}/.dagent/sessions/
├── chat_{sessionId}.json           # Recent messages
├── checkpoint_{sessionId}.json     # Compressed history
├── context_{sessionId}.json        # Session metadata
└── agent-description_{sessionId}.json  # Agent persona
```

**Compaction Workflow**:
1. `estimateMessagesTokens()` tracks token usage
2. When approaching limit, triggers compaction
3. Sends checkpoint + messages to Claude with "summarize this" prompt
4. Parses result into new checkpoint with structure:
   - `completed`: finished work
   - `inProgress`: current tasks
   - `pending`: upcoming work
   - `blockers`: issues
   - `decisions`: key choices made
5. Clears old messages, keeps compressed checkpoint

### 4. Git Integration (`src/main/git/git-manager.ts`)

**Worktree Isolation Model**:
```
.dagent-worktrees/
├── feature-my-feature/                    # Feature worktree
│   ├── .dagent/
│   │   ├── feature.json
│   │   ├── dag.json
│   │   ├── feature-spec.md
│   │   ├── attachments/                   # User uploads
│   │   └── sessions/                      # Agent chat history
│   └── [project files on feature branch]
│
└── feature-my-feature--task-task-001/     # Task worktree
    ├── .dagent/
    │   └── attachments/                   # Copied from feature
    └── [project files on task branch]
```

**Branch Strategy**:
- Feature: `feature/{featureId}` (kebab-case)
- Task: `task/{featureId}/{taskId}`
- Each task branch diverges from feature branch
- DevAgent commits to task branch
- MergeAgent merges task → feature → main

**Key Operations**:
- `createFeatureWorktree(featureId)` - create feature isolation
- `createTaskWorktree(featureId, taskId)` - create task isolation
- `mergeTaskIntoFeature()` - integrate task changes
- `mergeFeatureIntoMain()` - final integration

### 5. IPC Architecture (`src/main/ipc/handlers.ts`)

25+ handler groups registered on app startup:
- `storage`: Feature/DAG/chat CRUD
- `execution`: Start/pause/resume orchestrator
- `git`: Branch/worktree operations
- `agents`: Agent pool status
- `session`: Message storage, checkpoints
- `analysis`: PM task decomposition

**Handler Pattern**:
```typescript
ipcMain.handle('feature:create', async (event, name, options) => {
  // Main process logic
  return result
})
```

**Frontend Invocation**:
```typescript
window.electronAPI.storage.createFeature(name, options)
window.electronAPI.execution.start()
```

### 6. State Management (`src/renderer/src/stores/`)

**Zustand Stores** provide reactive state:

**useDAGStore**:
- Graph operations: `addNode()`, `removeNode()`, `addConnection()`
- History: `undo()`, `redo()` with version tracking
- Events: subscribes to DAG changes from main process
- Pattern: IPC call → backend mutation → event emission → store update

**useExecutionStore**:
- Orchestrator control: `start()`, `pause()`, `resume()`, `stop()`
- Polls every 2000ms while execution active
- Tracks: `{ status, featureId, error, startedAt }`

**useFeatureStore**:
- Feature CRUD operations
- Caches features in memory
- All operations proxied through IPC

### 7. Feature/Task Data Model (`src/shared/types/`)

**Feature**:
- ID: `"feature-{slug}"` (auto-generated)
- Status: `planning` → `backlog` → `in_progress` → `needs_attention` → `completed` → `archived`
- Branch: `"feature/feature-my-feature"`
- Attachments: file paths to uploads
- Completion action: `manual` | `auto_pr` | `auto_merge`

**Task**:
- Status: `needs_analysis` → `blocked` → `ready_for_dev` → `in_progress` → `ready_for_qa` → `ready_for_merge` → `completed` | `failed`
- Position: `{ x, y }` for canvas
- Sessions: `{ in_dev?: string[], in_qa?: string[] }` (session IDs)
- QA feedback: stored when QA fails, passed to next dev iteration
- Locked: `true` when agent working on it

**DAG Graph**:
- Nodes: `Task[]`
- Connections: `{ from: taskId, to: taskId }[]`
- Constraint: No cycles allowed (enforced in `validateConnection()`)

## Development Guidelines

### Path Aliases

Use path aliases for imports:
```typescript
import { Task } from '@shared/types'      // From anywhere
import { useDAGStore } from '@renderer/stores'  // Renderer only
```

Configured in:
- `tsconfig.node.json` - Main/preload: `@shared/*`
- `tsconfig.web.json` - Renderer: `@shared/*`, `@renderer/*`
- `electron.vite.config.ts` - Vite resolution

### Critical Integration Points

When working with CLAUDE.md context flow:
1. **Discovery**: `ContextService.getClaudeMd()` reads from project root
2. **Loading**: `ExecutionOrchestrator.initializeHarness()` loads into HarnessAgent
3. **Distribution**: HarnessAgent passes to DevAgent on task assignment
4. **Rendering**: `DevAgent.buildExecutionPrompt()` includes as "## Project Guidelines"
5. **Usage**: Claude sees guidelines alongside task description

### State Transitions

Task status transitions follow strict rules enforced in `cascadeTaskCompletion()`:
- Task becomes `ready_for_dev` only when ALL dependencies are `completed`
- Status changes emit events: `task-status-changed`, `feature-status-changed`
- Frontend polls every 2s to catch status updates

### Session Token Management

Sessions auto-compact to stay within limits:
- Token estimation via `estimateMessagesTokens()` (rough heuristic)
- Compaction triggered at threshold (default: 90k tokens)
- Compaction calls Claude API to summarize history
- Old messages cleared, checkpoint updated
- Context preserved across compactions

### Event-Driven Updates

Most components use EventEmitters for communication:
- DAGManager emits graph mutations
- ExecutionOrchestrator emits execution lifecycle events
- MessageBus emits inter-agent messages
- Frontend subscribes to relevant events via IPC

Pattern:
```typescript
dagManager.on('node-added', (node) => {
  // React to change
})
```

### Git Worktree Safety

When working with git operations:
- Always use `GitManager` singleton (never direct git commands)
- Worktrees must be removed before branch deletion
- Check `listWorktrees()` before destructive operations
- Task branches should be deleted after merge to feature
- Feature branches deleted after merge to main

### Testing Considerations

When writing tests:
- Mock IPC handlers with `ipcMain.handle`
- Mock `@anthropic-ai/claude-agent-sdk` for agent tests
- Use `simple-git` mocking for git operations
- Session tests should mock file system via `promises.fs`

### TypeScript Strictness

Project uses strict TypeScript:
- `strict: true` in all tsconfig files
- Separate compilation for main (`tsconfig.node.json`) and renderer (`tsconfig.web.json`)
- Run `npm run typecheck` before commits
- Fix type errors - don't use `any` or `@ts-ignore` without justification

## Common Patterns

### Creating a New Agent Type

1. Add to `AgentType` enum in `src/shared/types/agent.ts`
2. Implement agent class extending base agent pattern
3. Register in `AgentPool` with max count
4. Add IPC handlers in `src/main/ipc/handlers.ts`
5. Create Zustand store in `src/renderer/src/stores/` if needed
6. Update `ExecutionOrchestrator` to assign tasks to new agent type

### Adding New Task Status

1. Add to `TaskStatus` enum in `src/shared/types/task.ts`
2. Update transition logic in `src/main/dag-engine/cascade.ts`
3. Update status checks in `ExecutionOrchestrator.getNextReadyTasks()`
4. Add UI states in `src/renderer/src/components/` task cards
5. Update status icons/colors in `src/renderer/src/utils/task-utils.ts`

### Adding Context to Agent Prompts

1. Load data in `DevAgent.loadContext()` or similar
2. Add to context object returned by `loadContext()`
3. Include in `buildExecutionPrompt()` as new section
4. Document in section header comments
5. Consider if it should be stored in session checkpoint

## Project Structure Reference

```
src/
├── main/                       # Electron main process
│   ├── agents/                 # Agent implementations
│   │   ├── agent-pool.ts       # Singleton agent registry
│   │   ├── dev-agent.ts        # Task implementation agent
│   │   ├── merge-agent.ts      # Git merge agent
│   │   └── harness-agent.ts    # Orchestration agent
│   ├── dag-engine/             # DAG execution
│   │   ├── dag-manager.ts      # Graph operations
│   │   ├── orchestrator.ts     # Main execution loop
│   │   ├── task-controller.ts  # Task iteration control
│   │   └── cascade.ts          # Dependency propagation
│   ├── services/               # Core services
│   │   └── session-manager.ts  # Session/checkpoint management
│   ├── git/                    # Git integration
│   │   └── git-manager.ts      # Worktree operations
│   ├── context/                # Context assembly
│   │   └── context-service.ts  # CLAUDE.md, PROJECT.md loading
│   ├── ipc/                    # IPC handlers
│   │   └── handlers.ts         # All IPC registrations
│   └── storage/                # File persistence
│       └── feature-store.ts    # Feature/DAG storage
├── renderer/                   # React frontend
│   └── src/
│       ├── stores/              # Zustand state management
│       │   ├── dag-store.ts
│       │   ├── execution-store.ts
│       │   └── feature-store.ts
│       ├── components/          # React components
│       └── views/               # Page-level components
└── shared/                     # Shared types
    └── types/                  # TypeScript interfaces
        ├── feature.ts
        ├── task.ts
        ├── dag.ts
        ├── agent.ts
        └── message.ts
```

## Key Files to Know

| File | Purpose | When to Modify |
|------|---------|----------------|
| `src/main/dag-engine/orchestrator.ts` | Main execution loop | Changing task assignment logic |
| `src/main/agents/dev-agent.ts` | Task execution agent | Modifying how tasks are executed |
| `src/main/services/session-manager.ts` | Session/checkpoint management | Changing context compaction |
| `src/main/git/git-manager.ts` | Git operations | Adding git features |
| `src/shared/types/task.ts` | Task data model | Adding task properties |
| `src/main/ipc/handlers.ts` | IPC registration | Adding new main↔renderer communication |
| `src/renderer/src/stores/dag-store.ts` | DAG state management | Frontend DAG operations |

## Architecture Decisions

### Why Git Worktrees?

Worktrees provide true isolation - each task runs in its own working directory with its own branch. This prevents:
- Merge conflicts during parallel development
- Context contamination between tasks
- Git state confusion when switching tasks

### Why Checkpoint Compression?

Long-running agent sessions exceed Claude's context window. Checkpoints preserve:
- What was completed
- Current progress
- Pending work
- Key decisions made

This allows agents to resume with full context awareness while staying within token limits.

### Why Event-Driven Architecture?

Events decouple components:
- DAGManager doesn't know about UI updates
- ExecutionOrchestrator doesn't know about agents
- Frontend reactively updates without polling (except for execution status)

This enables testing components in isolation and swapping implementations.

### Why Request Queuing?

Multiple agents compete for Claude API access. Priority queue ensures:
- Harness planning gets highest priority (blocks all work)
- PM analysis gets high priority (unblocks tasks)
- Dev/QA/Merge get fair allocation
- No agent starvation

## Troubleshooting

### Sessions not compacting

Check `estimateMessagesTokens()` threshold in `SessionManager`. Compaction only triggers when approaching limit.

### Tasks stuck in `blocked` state

Check `cascadeTaskCompletion()` - tasks remain blocked until ALL dependencies reach `completed` status.

### Git merge conflicts

MergeAgent returns `TaskMergeResult` with `conflicts: MergeConflict[]`. UI should display conflicts and allow manual resolution.

### IPC handler not responding

Verify handler registered in `registerIpcHandlers()`. Check frontend uses correct channel name from `window.electronAPI`.
