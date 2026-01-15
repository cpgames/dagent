# Phase 56 Research: Task Plan Infrastructure

## Overview

Research findings for implementing task plan schema and storage for the Ralph Loop pattern. This phase creates the foundation for tracking iteration state across fresh context windows.

## Research Domains

### 1. Ralph Wiggum Loop Pattern (External Reference)

**Source:** [Ralph Wiggum Guide](https://github.com/JeredBlu/guides/blob/main/Ralph_Wiggum_Guide.md)

**Key Concepts:**
- **Fresh Context Per Iteration**: Each agent run starts with clean context, reads plan file to understand state
- **Checklist-Based Tracking**: JSON structure with `passes: boolean` for each item
- **Activity Logging**: Append-only log of iteration summaries with timestamps
- **Exit Conditions**: All checks pass OR max iterations reached
- **Verification Before Completion**: Agent must verify work (build/test/lint) before marking complete

**Recommended Structure:**
```json
{
  "category": "setup|feature|testing",
  "description": "Task summary",
  "steps": ["step1", "step2"],
  "passes": false
}
```

### 2. Existing DAGent Patterns

#### Task State Machine
**Location:** `src/shared/types/task.ts`, `src/main/dag-engine/state-machine.ts`

Current task flow:
```
blocked → ready_for_dev → in_progress → ready_for_qa → ready_for_merge → completed
                              ↑                ↓
                              └── (QA_FAILED) ←┘
```

**Key Insight:** TaskPlan operates *within* the `in_progress` state, managing iteration cycles before DevAgent reports completion.

#### DevAgent Lifecycle
**Location:** `src/main/agents/dev-agent.ts`, `dev-types.ts`

Current agent statuses:
1. `initializing` - Setup
2. `loading_context` - Reading claudeMd, feature goal, dependencies
3. `proposing_intention` - Generating work plan
4. `awaiting_approval` - PM review
5. `approved` - Ready to execute
6. `working` - Executing in worktree
7. `ready_for_merge` - Work complete
8. `completed` / `failed` - Terminal states

**Gap Identified:** No iteration tracking within `working` state. Single-shot execution model.

#### Session Storage Pattern
**Location:** `src/main/storage/feature-store.ts`, `json-store.ts`

```typescript
// JSON utilities
async function readJson<T>(filePath: string): Promise<T | null>
async function writeJson<T>(filePath: string, data: T): Promise<void>

// Session structure
interface DevAgentSession {
  taskId: string
  agentId: string
  status: 'active' | 'paused' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  messages: DevAgentMessage[]
}
```

**Reusable Patterns:**
- Singleton store class per projectRoot
- CRUD operations: save/load/delete/list
- Append pattern for messages
- ISO timestamp strings

#### Worktree Structure
**Location:** `src/main/git/git-manager.ts`, `types.ts`

```
{projectRoot}/.dagent-worktrees/{featureId}/
  .dagent/
    nodes/{taskId}/
      session.json     # DevAgentSession
      chat.json        # Task conversation
      logs.json        # Activity logs
      plan.json        # NEW: TaskPlan (proposed)
```

### 3. TaskPlan Schema Design

Based on Ralph Loop requirements + existing patterns:

```typescript
// src/main/agents/task-plan-types.ts

type ChecklistStatus = 'pending' | 'pass' | 'fail' | 'skipped'

interface ChecklistItem {
  id: string                    // e.g., 'implement', 'build', 'lint', 'test'
  description: string           // Human-readable description
  status: ChecklistStatus
  error?: string               // Error message if failed
  output?: string              // Truncated command output
  verifiedAt?: string          // ISO timestamp when last verified
}

interface ActivityEntry {
  iteration: number
  summary: string              // What agent accomplished
  timestamp: string            // ISO timestamp
  duration?: number            // Milliseconds
  checklistSnapshot?: Record<string, ChecklistStatus>  // State after iteration
}

type TaskPlanStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted'

interface TaskPlan {
  // Identity
  taskId: string
  featureId: string

  // Iteration tracking
  iteration: number            // Current iteration (1-based)
  maxIterations: number        // Default: 10
  status: TaskPlanStatus

  // Checklist
  checklist: ChecklistItem[]

  // Activity log
  activity: ActivityEntry[]

  // Timestamps
  createdAt: string
  updatedAt: string
  completedAt?: string

  // Configuration
  config: TaskPlanConfig
}

interface TaskPlanConfig {
  runBuild: boolean            // Default: true
  runLint: boolean             // Default: true
  runTests: boolean            // Default: false (opt-in)
  continueOnLintFail: boolean  // Default: true
  buildCommand?: string        // Override detected command
  lintCommand?: string
  testCommand?: string
}
```

### 4. Default Checklist Items

Standard checklist for every task:

| ID | Description | Auto-Verified | Required |
|----|-------------|---------------|----------|
| `implement` | Implement the task requirements | No (agent marks) | Yes |
| `build` | Build passes without errors | Yes | Yes |
| `lint` | Lint passes (if available) | Yes | No |
| `test` | Tests pass (if available) | Yes | No |

**Custom items:** Tasks may have additional checklist items based on task description parsing or PM instructions.

### 5. Storage Location

**Primary:** Feature worktree `.dagent/` directory
```
{projectRoot}/.dagent-worktrees/{featureId}/.dagent/nodes/{taskId}/plan.json
```

**Rationale:**
- Persists across DevAgent restarts
- Lives alongside session.json for related data
- Accessible from both task worktree and feature worktree
- Survives context window resets

### 6. CRUD Operations

```typescript
// src/main/agents/task-plan-store.ts

class TaskPlanStore {
  constructor(projectRoot: string)

  // Create new plan with defaults
  async createPlan(featureId: string, taskId: string, config?: Partial<TaskPlanConfig>): Promise<TaskPlan>

  // Read plan
  async loadPlan(featureId: string, taskId: string): Promise<TaskPlan | null>

  // Update plan
  async savePlan(featureId: string, taskId: string, plan: TaskPlan): Promise<void>

  // Delete plan
  async deletePlan(featureId: string, taskId: string): Promise<boolean>

  // Check existence
  async planExists(featureId: string, taskId: string): Promise<boolean>

  // Convenience methods
  async updateChecklist(featureId: string, taskId: string, itemId: string, update: Partial<ChecklistItem>): Promise<void>
  async addActivity(featureId: string, taskId: string, entry: Omit<ActivityEntry, 'timestamp'>): Promise<void>
  async incrementIteration(featureId: string, taskId: string): Promise<number>
}
```

### 7. Integration Points

#### With DevAgent
- DevAgent reads plan at start of each iteration
- Updates `implement` checklist item based on work
- Does NOT run verification (that's VerificationRunner's job)

#### With TaskController (Phase 58)
- Creates plan at task start
- Manages iteration loop
- Calls VerificationRunner after each DevAgent iteration
- Updates plan with verification results
- Checks exit conditions

#### With Orchestrator (Phase 60)
- Spawns TaskController instead of direct DevAgent
- Reads plan status for UI updates
- Handles abort requests

### 8. Implementation Considerations

#### Thread Safety
- Plan file may be read/written by multiple components
- Use atomic write pattern (write to temp, rename)
- Consider file locking for concurrent access

#### Error Handling
- Graceful handling of missing/corrupt plan files
- Default to fresh plan if load fails
- Log all plan mutations for debugging

#### Performance
- Plan file is small (<10KB typically)
- Read/write on each iteration is acceptable
- No caching needed (fresh read ensures consistency)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage location | `.dagent/nodes/{taskId}/plan.json` | Alongside existing session data |
| Checklist structure | Array with id/status/error | Flexible, ordered, allows custom items |
| Activity format | Append-only entries | Audit trail, no data loss |
| Status tracking | Separate from task status | Plan runs within `in_progress` task state |
| Iteration count | 1-based | Human-readable in logs |
| Config per plan | Yes | Different tasks may need different settings |

## Files to Create

1. **`src/main/agents/task-plan-types.ts`**
   - TaskPlan, ChecklistItem, ActivityEntry interfaces
   - TaskPlanStatus, ChecklistStatus types
   - TaskPlanConfig interface
   - DEFAULT_CHECKLIST_ITEMS constant
   - DEFAULT_TASK_PLAN_CONFIG constant

2. **`src/main/agents/task-plan-store.ts`**
   - TaskPlanStore class
   - CRUD operations
   - Convenience methods for common updates
   - Path utilities (or extend paths.ts)

## Open Questions (Resolved)

1. **Where to store plan?** → Feature worktree `.dagent/nodes/{taskId}/`
2. **How to handle custom checklist items?** → Array allows any items, not fixed enum
3. **Should plan survive task retry?** → Yes, but iteration resets to 1
4. **Integration with QA?** → QA runs after loop completes, uses final plan state

## References

- [Ralph Wiggum Guide](https://github.com/JeredBlu/guides/blob/main/Ralph_Wiggum_Guide.md)
- [v2.4-ROADMAP.md](../../milestones/v2.4-ROADMAP.md)
- [dev-agent.ts](../../../src/main/agents/dev-agent.ts)
- [feature-store.ts](../../../src/main/storage/feature-store.ts)
- [task.ts](../../../src/shared/types/task.ts)
