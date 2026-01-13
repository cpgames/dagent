# Codebase Structure

**Analysis Date:** 2026-01-13

## Current Directory Layout

```
dagent/
├── .claude/                # Claude Code settings
│   └── settings.local.json # Local Claude settings
├── .git/                   # Git repository
├── .planning/              # GSD planning documents
│   └── codebase/          # Codebase analysis (this folder)
└── DAGENT_SPEC.md          # Complete specification document
```

## Planned Directory Layout

Based on `DAGENT_SPEC.md` specification:

```
dagent/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # Main entry point
│   │   ├── auth/          # Authentication management
│   │   │   └── manager.ts
│   │   ├── git/           # Git operations
│   │   │   └── manager.ts
│   │   ├── agents/        # Agent process management
│   │   │   ├── harness.ts
│   │   │   ├── task.ts
│   │   │   └── merge.ts
│   │   └── ipc/           # IPC handlers
│   │       └── handlers.ts
│   │
│   └── renderer/          # Electron renderer process
│       ├── index.tsx      # React app entry
│       ├── App.tsx        # Root component
│       ├── components/    # Reusable UI components
│       │   ├── Kanban/
│       │   ├── DAG/
│       │   └── Chat/
│       ├── views/         # Full page views
│       │   ├── KanbanView.tsx
│       │   ├── DAGView.tsx
│       │   └── ContextView.tsx
│       ├── stores/        # Zustand stores
│       │   └── features.ts
│       └── styles/        # Tailwind styles
│
├── electron/              # Electron configuration
│   ├── electron.ts        # Electron bootstrap
│   └── preload.ts         # Preload scripts
│
├── public/                # Static assets
│
├── tests/                 # Test files
│
├── .dagent-worktrees/     # Git worktrees (runtime)
│   └── {feature-name}/
│       ├── .dagent/
│       │   ├── feature.json
│       │   ├── dag.json
│       │   ├── dag_history/
│       │   ├── chat.json
│       │   ├── harness_log.json
│       │   └── nodes/
│       │       └── {id}/
│       │           ├── chat.json
│       │           ├── logs.json
│       │           └── {media files}
│       └── {project files}
│
├── .dagent-archived/      # Archived features
│
├── DAGENT_SPEC.md         # Specification document
├── CLAUDE.md              # Project context for agents
├── package.json           # Dependencies
└── tsconfig.json          # TypeScript config
```

## Directory Purposes

**src/main/**
- Purpose: Electron main process code
- Contains: Auth, Git, Agent managers and IPC handlers
- Key files: `index.ts` (entry), `agents/harness.ts` (orchestration)
- Subdirectories: Feature-based (auth, git, agents, ipc)

**src/renderer/**
- Purpose: React UI application
- Contains: Components, views, stores, styles
- Key files: `index.tsx` (entry), `views/*.tsx` (pages)
- Subdirectories: Component-based organization

**src/renderer/views/**
- Purpose: Full-page view components
- Contains: KanbanView, DAGView, ContextView
- Per `DAGENT_SPEC.md` section 3

**src/renderer/components/**
- Purpose: Reusable UI components
- Contains: Kanban cards, DAG nodes, Chat panels
- Subdirectories: Feature-grouped (Kanban/, DAG/, Chat/)

**.dagent-worktrees/**
- Purpose: Git worktrees for active features
- Contains: Feature branches with .dagent metadata
- Runtime: Created/deleted during feature lifecycle
- Per `DAGENT_SPEC.md` section 8.2

**.dagent-archived/**
- Purpose: Archived completed features
- Contains: Preserved feature.json, dag.json, chat.json
- Per `DAGENT_SPEC.md` section 9.3

## Key File Locations

**Entry Points:**
- `src/main/index.ts` - Electron main process (planned)
- `src/renderer/index.tsx` - React app entry (planned)
- `DAGENT_SPEC.md` - Specification document (exists)

**Configuration:**
- `package.json` - Dependencies (planned)
- `tsconfig.json` - TypeScript config (planned)
- `electron/electron.ts` - Electron config (planned)
- `CLAUDE.md` - Project context for agents (planned)

**Core Logic:**
- `src/main/agents/harness.ts` - Harness agent (planned)
- `src/main/agents/task.ts` - Task agent (planned)
- `src/main/agents/merge.ts` - Merge agent (planned)
- `src/main/git/manager.ts` - Git operations (planned)

**Documentation:**
- `DAGENT_SPEC.md` - Complete specification (exists)
- `.planning/` - GSD planning documents (exists)

## Naming Conventions

**Files:**
- kebab-case.ts for modules (e.g., `auth-manager.ts`)
- PascalCase.tsx for React components (e.g., `KanbanView.tsx`)
- Lowercase for config files (e.g., `tsconfig.json`)

**Directories:**
- kebab-case for feature directories (e.g., `dag-history/`)
- PascalCase for React component directories (e.g., `Kanban/`)
- Lowercase for standard directories (e.g., `src/`, `tests/`)

**Special Patterns:**
- `.dagent/` for metadata directories
- `{id}/` for node-specific subdirectories
- `*.json` for data files

## Where to Add New Code

**New View:**
- Implementation: `src/renderer/views/{ViewName}.tsx`
- Components: `src/renderer/components/{ViewName}/`
- Store: `src/renderer/stores/{viewname}.ts`

**New Agent Type:**
- Implementation: `src/main/agents/{agent-name}.ts`
- Tests: `tests/agents/{agent-name}.test.ts`

**New IPC Handler:**
- Implementation: `src/main/ipc/handlers.ts`
- Types: `src/shared/types.ts`

**New Component:**
- Implementation: `src/renderer/components/{Category}/{ComponentName}.tsx`
- Styles: Tailwind classes inline or `src/renderer/styles/`

## Special Directories

**.dagent-worktrees/**
- Purpose: Active feature worktrees
- Source: Created by git worktree during feature creation
- Committed: No (gitignored)
- Lifecycle: Created on feature start, deleted on archive

**.dagent-archived/**
- Purpose: Completed feature archives
- Source: Copied from worktrees on archive
- Committed: No (gitignored)
- Contents: Subset of .dagent/ (no logs, no undo history)

---

*Structure analysis: 2026-01-13*
*Note: This is a specification-only codebase - structure is planned, not implemented*
