# Coding Conventions

**Analysis Date:** 2026-01-13

## Naming Patterns

**Files:**
- kebab-case.ts for TypeScript modules (e.g., `auth-manager.ts`)
- PascalCase.tsx for React components (e.g., `KanbanView.tsx`)
- kebab-case.json for data files (e.g., `feature.json`)

**Functions:**
- camelCase for all functions
- handle{Event} for event handlers (e.g., `handleClick`, `handleNodeDrag`)
- on{Event} for callback props (e.g., `onSave`, `onCancel`)

**Variables:**
- camelCase for variables
- UPPER_SNAKE_CASE for constants
- Prefix with `is`, `has`, `can` for booleans (e.g., `isLocked`, `hasError`)

**Types:**
- PascalCase for interfaces (e.g., `Feature`, `Task`, `Connection`)
- No `I` prefix for interfaces
- PascalCase for type aliases (e.g., `TaskStatus`, `FeatureStatus`)
- PascalCase for enums, UPPER_CASE values (if used)

## Code Style

**Formatting:**
- To be configured (recommend Prettier)
- 2 space indentation (standard for React/TypeScript)
- Single quotes for strings
- Semicolons required

**Linting:**
- To be configured (recommend ESLint with @typescript-eslint)

## Import Organization

**Order (recommended):**
1. Node.js built-ins (path, fs, child_process)
2. External packages (react, electron, zustand)
3. Internal modules (@/lib, @/components)
4. Relative imports (./utils, ../types)
5. Type imports (import type { ... })

**Grouping:**
- Blank line between groups
- Alphabetical within each group

**Path Aliases (recommended):**
- @/main for src/main/
- @/renderer for src/renderer/
- @/shared for src/shared/

## Error Handling

**Patterns:**
- Agents report errors to harness via structured log entries
- Task failures set status to 'failed', preserve worktree for debugging
- User-visible errors shown in UI with actionable guidance

**Log Entry Types (from spec):**
- `intention` - Agent proposes action
- `approval` - Harness approves
- `rejection` - Harness rejects
- `modification` - Harness modifies proposal
- `action` - Agent performs action
- `error` - Error occurred

## Logging

**Framework:**
- Structured JSON logging to `.dagent/` files
- Per `DAGENT_SPEC.md` section 4.6

**Patterns:**
```typescript
interface LogEntry {
  timestamp: string;     // ISO timestamp
  type: 'intention' | 'approval' | 'rejection' | 'modification' | 'action' | 'error';
  agent: 'harness' | 'task' | 'merge';
  taskId?: string;
  content: string;
}
```

**Where:**
- Feature-level: `.dagent/harness_log.json`
- Task-level: `.dagent/nodes/{id}/logs.json`

## Comments

**When to Comment:**
- Explain why, not what
- Document complex DAG algorithms
- Clarify agent communication protocols

**Documentation:**
- JSDoc for public APIs
- Inline comments for complex logic
- README for setup and usage

## Function Design

**Size:**
- Keep functions focused and small
- Extract helpers for complex logic

**Parameters:**
- Use TypeScript interfaces for complex params
- Destructure objects in parameter list
- Max 3 positional params, use object for more

**Return Values:**
- Explicit return types
- Return early for guard clauses

## Module Design

**Exports:**
- Named exports preferred
- Default exports for React components
- Re-export public API from index.ts

**Agent Communication:**
- Intentions must be brief (1-2 sentences per item)
- Batch logically grouped actions
- Clear "what" not "how"

## Data Structures

**From Specification (`DAGENT_SPEC.md` section 4):**

```typescript
// Feature
interface Feature {
  id: string;
  name: string;
  status: FeatureStatus;
  branchName: string;
  createdAt: string;
  updatedAt: string;
}

// Task (Node)
interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  locked: boolean;
  position: { x: number; y: number };
}

// Connection (Edge)
interface Connection {
  from: string;
  to: string;
}
```

**Status Types:**
```typescript
type FeatureStatus = 'not_started' | 'in_progress' | 'needs_attention' | 'completed';
type TaskStatus = 'blocked' | 'ready' | 'running' | 'merging' | 'completed' | 'failed';
```

---

*Convention analysis: 2026-01-13*
*Note: This is a specification-only codebase - conventions are planned, not enforced*
