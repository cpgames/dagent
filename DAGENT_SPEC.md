# DAGent Specification

**Dependency-aware AI agent orchestration for autonomous software development.**

DAGent solves the fundamental problem with parallel AI coding agents: when multiple agents work on dependent tasks simultaneously, they produce incompatible outputs. DAGent ensures tasks execute in dependency order, with context flowing from completed work to dependent tasks.

---

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [Application Structure](#2-application-structure)
3. [Views](#3-views)
4. [Data Model](#4-data-model)
5. [DAG Graph Behavior](#5-dag-graph-behavior)
6. [Execution Engine](#6-execution-engine)
7. [Agent Communication](#7-agent-communication)
8. [Git Integration](#8-git-integration)
9. [Storage Structure](#9-storage-structure)
10. [Authentication](#10-authentication)
11. [Visual Design](#11-visual-design)
12. [Implementation References](#12-implementation-references)

---

## 1. Core Concepts

### 1.1 The Problem

Traditional parallel AI agents (like Auto-Claude) treat tasks as embarrassingly parallel:

```
Naive parallel execution:

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Backend    │  │ Persistence │  │     UI      │
│  Agent 1    │  │   Agent 2   │  │   Agent 3   │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       ▼                ▼                ▼
   stubs DB API    implements DB    expects endpoints
   one way         different way    third way
       │                │                │
       └────────────────┼────────────────┘
                        ▼
                  MERGE CONFLICT 💥
```

### 1.2 The Solution

DAGent uses a Directed Acyclic Graph (DAG) to represent task dependencies. Tasks execute in topological order, with each completed task's context passed to dependent tasks:

```
Dependency-aware execution:

┌─────────────┐
│ Persistence │  ← executes first
└──────┬──────┘
       │ context handoff (schemas, exports, patterns)
       ▼
┌─────────────┐
│   Backend   │  ← receives persistence context
└──────┬──────┘
       │ context handoff (API endpoints, types)
       ▼
┌─────────────┐
│     UI      │  ← receives backend context
└─────────────┘
```

### 1.3 Key Terms

| Term | Definition |
|------|------------|
| **Feature** | A high-level unit of work represented as a DAG graph. Has its own branch and chat history. |
| **Task** | A node in the DAG. Represents a single unit of implementation work. |
| **Connection** | A directed edge between tasks indicating dependency. |
| **Harness Agent** | Orchestrator agent that oversees all task agents. Does not write code. |
| **Task Agent** | Agent assigned to implement a specific task. |
| **Merge Agent** | Agent responsible for merging completed task branches. |
| **Worktree** | Git worktree providing isolated working directory for a branch. |

---

## 2. Application Structure

### 2.1 Platform

- **Standalone Electron desktop application**
- Cross-platform: Windows, macOS, Linux
- Built with:
  - Electron (app shell)
  - React + TypeScript (UI)
  - Node.js (backend processes)

### 2.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Auth        │  │ Git         │  │ Agent Process       │  │
│  │ Manager     │  │ Manager     │  │ Manager             │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ IPC
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Electron Renderer Process                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Kanban View │  │ DAG View    │  │ Context View        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Views

### 3.1 Kanban View

High-level view of all features organized by status.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Kanban View]  [DAG View]  [Context View]                   [+ New Feature]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Not Started       In Progress       Needs Attention     Completed          │
│  ─────────────     ─────────────     ─────────────────   ─────────────      │
│  ┌───────────┐     ┌───────────┐     ┌───────────┐       ┌───────────┐      │
│  │ Payments  │     │ Car       │     │ Export    │       │ Auth      │      │
│  │           │     │           │     │           │       │  [Archive]│      │
│  │ 4 tasks   │     │ 2/5 tasks │     │ ⚠️ 1 failed│       │ 3/3 tasks │      │
│  └───────────┘     └───────────┘     └───────────┘       └───────────┘      │
│                                                                             │
│  ┌───────────┐     ┌───────────┐                         ┌───────────┐      │
│  │ Reports   │     │ Dashboard │                         │ Login     │      │
│  │           │     │           │                         │  [Archive]│      │
│  │ 2 tasks   │     │ 1/3 tasks │                         │ 5/5 tasks │      │
│  └───────────┘     └───────────┘                         └───────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Columns:**
- **Not Started** (Blue): No tasks have begun execution
- **In Progress** (Yellow): At least one task is running/merging
- **Needs Attention** (Red): At least one task has failed
- **Completed** (Green): All tasks completed successfully

**Feature Card Actions:**
- Click → Opens DAG View for that feature
- Archive button (completed only) → Archives the feature

### 3.2 DAG View

Graph-based interface for managing tasks within a feature.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Kanban View]  [DAG View]  [Context View]                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            [+ New Feature] │
│  │ 🟩 Auth │ │ 🟨 Car  │ │ 🔵 Pay  │ │ 🔴 Export│                           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                            │
├───────────────────────────────────────────────────┬─────────────────────────┤
│                                                   │                         │
│   ┌─────────────────┐                             │   Feature Chat          │
│   │ 🟩 Schema    🔒 │───────┐                     │   ─────────────         │
│   │           ✏️ 🗑️ │       │                     │                         │
│   └─────────────────┘       │                     │   User: Create a car    │
│                             ▼                     │   building feature      │
│   ┌─────────────────┐    ┌─────────────────┐     │                         │
│   │ 🟩 Auth         │    │ 🟨 Backend      │     │   AI: I'll create a     │
│   │           ✏️ 🗑️ │───▶│           ✏️ 🗑️ │     │   DAG with tasks for... │
│   └─────────────────┘    └────────┬────────┘     │                         │
│                                   │               │   [Re-evaluate deps]    │
│                                   ▼               │                         │
│                          ┌─────────────────┐     │   ┌─────────────────┐   │
│                          │ 🔵 UI           │     │   │ Type message... │   │
│                          │           ✏️ 🗑️ │     │   └─────────────────┘   │
│                          └─────────────────┘     │                         │
│                                                   │                         │
│   [▶ Play]  [⏹ Stop]  [↩ Undo]  [↪ Redo]         │                         │
│                                                   │                         │
└───────────────────────────────────────────────────┴─────────────────────────┘
```

**Components:**
- **Feature Tabs**: Colored tabs showing all features, click to switch
- **Graph Canvas**: Visual DAG with draggable nodes
- **Sidebar**: Feature-level chat panel
- **Control Bar**: Play, Stop, Undo, Redo buttons

**Node Interactions:**
- Click → Open node dialog (name, description, status, lock, chat)
- Drag → Reposition node
- Drag from node edge → Create connection
- ✏️ button → Edit node
- 🗑️ button → Delete node

### 3.3 Node Dialog

Expanded view when clicking a task node.

```
┌─────────────────────────────────────────────────────────────┐
│  Task: Backend API                                    [×]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Name:                                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Backend API                                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Description:                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Implement REST API endpoints for user management.   │   │
│  │ Include CRUD operations and authentication.         │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Status: 🟨 In Progress                                     │
│                                                             │
│  ┌─────────┐  ┌─────────┐                                  │
│  │ 🔒 Lock │  │ 💬 Chat │                                  │
│  └─────────┘  └─────────┘                                  │
│                                                             │
│                              [Save]  [Cancel]               │
└─────────────────────────────────────────────────────────────┘
```

**Fields:**
- **Name**: Task title (editable)
- **Description**: Detailed task description (editable)
- **Status**: Current state (read-only during execution)
- **Lock Button**: Toggle to prevent AI modification
- **Chat Button**: Open node-specific chat

### 3.4 Node Chat

Scoped AI chat that only modifies the node's title/description.

```
┌─────────────────────────────────────────────────────────────┐
│  Task Chat: Backend API                               [×]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User: Make this more specific to OAuth2                    │
│                                                             │
│  AI: I've updated the description to specify OAuth2:        │
│                                                             │
│  "Implement REST API endpoints with OAuth2 authentication.  │
│   Include /authorize, /token, and /userinfo endpoints..."   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Type message...                              [Send] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Scope**: Node chat AI can ONLY modify:
- Node title
- Node description

It cannot add/remove nodes or modify connections.

### 3.5 Context View

Project context management that populates CLAUDE.md.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Kanban View]  [DAG View]  [Context View]                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Project Context                                    [Generate with AI]      │
│  ───────────────────────────────────────────────────────────────────────    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ # Project: MyApp                                                     │   │
│  │                                                                      │   │
│  │ ## Tech Stack                                                        │   │
│  │ - Frontend: React + TypeScript                                       │   │
│  │ - Backend: Node.js + Express                                         │   │
│  │ - Database: PostgreSQL                                               │   │
│  │                                                                      │   │
│  │ ## Architecture                                                      │   │
│  │ - REST API with JWT auth                                             │   │
│  │ - Repository pattern for data access                                 │   │
│  │                                                                      │   │
│  │ ## Conventions                                                       │   │
│  │ - Use camelCase for variables                                        │   │
│  │ - All components in /src/components                                  │   │
│  │ - Tests alongside source files (*.test.ts)                           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [Save to CLAUDE.md]                         Last synced: 2 hours ago       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- **Manual editing**: User types context directly
- **AI generation**: "Generate with AI" analyzes codebase
- **Sync**: Saves to and loads from CLAUDE.md in project root
- **Usage**: Context is injected into all agent prompts (harness, task, merge)

---

## 4. Data Model

### 4.1 Feature

```typescript
interface Feature {
  id: string;                    // Unique identifier (e.g., "feature-car")
  name: string;                  // Display name
  status: FeatureStatus;         // Derived from task statuses
  branchName: string;            // Git branch name (e.g., "feature/car")
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
}

type FeatureStatus = 
  | 'not_started'    // All tasks not started (Blue)
  | 'in_progress'    // Any task running/merging (Yellow)
  | 'needs_attention' // Any task failed (Red)
  | 'completed';      // All tasks completed (Green)
```

### 4.2 Task (Node)

```typescript
interface Task {
  id: string;                    // Unique identifier (e.g., "2145")
  title: string;                 // Display name
  description: string;           // Detailed description
  status: TaskStatus;            // Current state
  locked: boolean;               // Prevent AI modification
  position: {
    x: number;                   // Canvas X position
    y: number;                   // Canvas Y position
  };
}

type TaskStatus = 
  | 'blocked'        // Waiting on dependencies
  | 'ready'          // All dependencies met, waiting for agent
  | 'running'        // Agent currently implementing
  | 'merging'        // Merge agent working
  | 'completed'      // Successfully merged
  | 'failed';        // Error occurred
```

### 4.3 Connection (Edge)

```typescript
interface Connection {
  from: string;                  // Source task ID
  to: string;                    // Target task ID (depends on source)
}
```

### 4.4 DAG Graph

```typescript
interface DAGGraph {
  nodes: Task[];
  connections: Connection[];
}
```

### 4.5 Chat Entry

```typescript
interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  media?: string[];              // Relative paths to attached files
  timestamp: string;             // ISO timestamp
}

interface ChatHistory {
  entries: ChatEntry[];
}
```

### 4.6 Agent Log Entry

```typescript
interface LogEntry {
  timestamp: string;
  type: 'intention' | 'approval' | 'rejection' | 'modification' | 'action' | 'error';
  agent: 'harness' | 'task' | 'merge';
  taskId?: string;
  content: string;
}

interface AgentLog {
  entries: LogEntry[];
}
```

---

## 5. DAG Graph Behavior

### 5.1 Creating a New Feature

1. User clicks "+ New Feature" button
2. Sidebar chat panel opens
3. User describes the feature (can attach files/images)
4. AI generates initial DAG graph in real-time
5. New feature worktree and branch are created
6. Feature appears as new tab in DAG View

### 5.2 Modifying the DAG

**AI Modification (via Feature Chat):**
- User chats in sidebar
- AI can add/remove/modify unlocked nodes
- AI can add/remove/modify connections (unless both endpoints are locked)
- Changes appear in real-time on canvas

**Manual Modification:**
- Add node: Right-click canvas or toolbar button
- Delete node: Click 🗑️ button (also deletes node's chat and logs)
- Edit node: Click ✏️ button or node dialog
- Move node: Drag node to new position
- Connect: Drag from node edge to another node
- Disconnect: Click connection, then delete

### 5.3 Locking Behavior

| Scenario | AI Can Modify? |
|----------|----------------|
| Node unlocked | ✅ Yes |
| Node locked | ❌ No |
| Connection: both endpoints unlocked | ✅ Yes |
| Connection: one endpoint locked | ✅ Yes |
| Connection: both endpoints locked | ❌ No |

### 5.4 Re-evaluate Dependencies

"Re-evaluate dependencies" button in sidebar:
- AI analyzes all node descriptions
- Recalculates optimal connections
- Respects locking rules
- Creates single graph version (not one per change)

### 5.5 Graph Versioning (Undo/Redo)

- All modifications go through single pipeline
- AI batch operations = single version
- Store last 20 versions of graph state
- Chat history is NOT part of undo/redo
- Undo/Redo buttons in control bar

---

## 6. Execution Engine

### 6.1 Agent Pool

```
┌──────────────────────────────────────────────────────────────────┐
│                         Agent Pool                                │
│                                                                   │
│   Total Pool Size: Configurable (based on Claude plan limits)    │
│                                                                   │
│   Reserved:                                                       │
│   ┌──────────────┐                                               │
│   │   Harness    │  ← Always reserved (1 agent)                  │
│   └──────────────┘                                               │
│                                                                   │
│   Available for Tasks/Merges:                                    │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│   │ Agent 1  │ │ Agent 2  │ │ Agent N  │  ← Pool size - 1       │
│   └──────────┘ └──────────┘ └──────────┘                        │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Agent Priority

1. **Harness** (highest) - Always reserved
2. **Merge** - Takes precedence over new tasks
3. **Task** (lowest) - Gets remaining agents

### 6.3 Execution Flow

```
User clicks [▶ Play]
        │
        ▼
┌──────────────────┐
│ Harness spawned  │
└────────┬─────────┘
        │
        ▼
┌──────────────────┐
│ Identify ready   │ ← Tasks with all dependencies completed
│ tasks            │
└────────┬─────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ While tasks remain:                                               │
│                                                                   │
│   1. Get ready tasks                                             │
│   2. Assign available agents (random if more tasks than agents)  │
│   3. Task agents propose intentions to harness                   │
│   4. Harness approves/modifies/rejects                           │
│   5. Task agents implement approved intentions                   │
│   6. On task code completion:                                    │
│      - Spawn merge agent (priority over new tasks)              │
│      - Merge task branch into feature branch                     │
│      - On merge success: status → completed, delete worktree    │
│   7. Check for newly ready tasks (dependencies now met)          │
│   8. Repeat                                                       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────┐
│ All tasks done   │
│ Feature complete │
└──────────────────┘
```

### 6.4 Task State Transitions

```
┌─────────┐
│ blocked │ ← waiting on parent dependencies
└────┬────┘
     │ all parents completed
     ▼
┌─────────┐
│  ready  │ ← waiting for agent assignment
└────┬────┘
     │ agent assigned
     ▼
┌─────────┐
│ running │ ← agent implementing
└────┬────┘
     │ code complete
     ▼
┌─────────┐
│ merging │ ← merge agent working
└────┬────┘
     │ merge success          │ merge/task failure
     ▼                        ▼
┌─────────┐              ┌─────────┐
│completed│              │ failed  │
└─────────┘              └─────────┘
```

### 6.5 Stop Behavior

When user clicks [⏹ Stop]:
1. Signal sent to harness
2. Harness signals all active task/merge agents
3. Agents complete current atomic operation then halt
4. In-progress tasks remain in `running` or `merging` state
5. Can resume with [▶ Play]

---

## 7. Agent Communication

### 7.1 Communication Model

Task agents do NOT communicate with each other. All coordination goes through harness.

```
┌─────────────────────────────────────────────────────────────────┐
│                         HARNESS AGENT                            │
│                   (sees everything, codes nothing)               │
│                                                                  │
│   Has context:                                                   │
│   - CLAUDE.md (project context)                                 │
│   - Feature goal and chat history                               │
│   - All task descriptions                                        │
│   - All task logs                                                │
│   - Current state of all tasks                                  │
└──────────────┬─────────────────┬─────────────────┬──────────────┘
               │                 │                 │
        ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
        │   Task      │   │   Task      │   │   Merge     │
        │   Agent 1   │   │   Agent 2   │   │   Agent     │
        │             │   │             │   │             │
        │  Has:       │   │  Has:       │   │  Has:       │
        │  - Context  │   │  - Context  │   │  - Context  │
        │  - Task desc│   │  - Task desc│   │  - Task info│
        │  - Handoffs │   │  - Handoffs │   │  - Branches │
        └─────────────┘   └─────────────┘   └─────────────┘
```

### 7.2 Intention-Approval Workflow

```
Task Agent                              Harness
    │                                      │
    │  INTENTION: I want to create         │
    │  UserService.ts, UserRepository.ts,  │
    │  and add routes in index.ts          │
    │─────────────────────────────────────▶│
    │                                      │
    │                                      │ (reviews against other
    │                                      │  tasks, project context)
    │                                      │
    │  APPROVAL: Approved. Note: Another   │
    │  agent already created User model    │
    │  in models/User.ts - import from     │
    │  there instead of creating new.      │
    │◀─────────────────────────────────────│
    │                                      │
    │  (implements with guidance)          │
    │                                      │
    │  ACTION: Created UserService.ts,     │
    │  UserRepository.ts, updated routes   │
    │─────────────────────────────────────▶│
    │                                      │
```

### 7.3 Intention Format

Intentions must be:
- **Brief**: 1-2 sentences per item
- **Batched**: Logically grouped (e.g., "create 3 files" not 3 separate intentions)
- **Clear**: State what, not how

**Good Example:**
```
INTENTION: Create User authentication module with:
- AuthService.ts for login/logout logic
- AuthMiddleware.ts for route protection  
- Update routes/index.ts with /auth endpoints
```

**Bad Example:**
```
INTENTION: First I will create a file called AuthService.ts. In this file, 
I will implement a class called AuthService that has methods for handling 
user authentication. The login method will take a username and password...
(essay continues)
```

### 7.4 Harness Responses

| Response | Meaning |
|----------|---------|
| **APPROVED** | Proceed as intended |
| **APPROVED WITH NOTES** | Proceed but consider guidance |
| **MODIFIED** | Change approach as specified |
| **REJECTED** | Do not proceed, here's why |

### 7.5 Merge Agent Communication

Merge agents follow same pattern:

```
Merge Agent                             Harness
    │                                      │
    │  INTENTION: Merge task-auth branch   │
    │  into feature/car. No conflicts      │
    │  detected.                           │
    │─────────────────────────────────────▶│
    │                                      │
    │  APPROVED: Proceed with merge.       │
    │◀─────────────────────────────────────│
    │                                      │
```

On conflict:

```
Merge Agent                             Harness
    │                                      │
    │  INTENTION: Conflict in routes.ts    │
    │  Task-auth adds /auth/*, task-user   │
    │  added /user/*. Propose keeping both.│
    │─────────────────────────────────────▶│
    │                                      │
    │  APPROVED: Merge both route sets.    │
    │  Order: auth routes first.           │
    │◀─────────────────────────────────────│
    │                                      │
```

---

## 8. Git Integration

### 8.1 Branch Structure

```
main
 │
 └── feature/car                    (feature branch)
         │
         ├── feature/car/task-2145  (task branch)
         ├── feature/car/task-3782  (task branch)
         └── feature/car/task-4521  (task branch)
```

### 8.2 Worktree Structure

```
project/                              ← main branch (original repo)
├── .git/
├── CLAUDE.md
└── src/

.dagent-worktrees/
├── feature-car/                      ← feature/car branch (persistent)
│   ├── .dagent/
│   │   ├── feature.json
│   │   ├── dag.json
│   │   ├── dag_history/
│   │   ├── chat.json
│   │   ├── harness_log.json
│   │   └── nodes/
│   │       ├── 2145/
│   │       │   ├── chat.json
│   │       │   ├── logs.json
│   │       │   └── img1.png
│   │       └── 3782/
│   │           └── ...
│   └── src/
│
├── feature-car--task-2145/           ← task worktree (temporary)
│   └── src/
│
└── feature-car--task-3782/           ← task worktree (temporary)
    └── src/
```

### 8.3 Worktree Lifecycle

**Feature Worktree:**
- Created when feature is created
- Persists until feature is archived
- Stores all .dagent/ data

**Task Worktree:**
- Created when task execution begins
- Branches from current feature branch state
- Deleted after successful merge into feature branch

### 8.4 Merge Flow

```
1. Task agent completes work in task worktree
2. Task status → 'merging'
3. Merge agent spawned (priority allocation)
4. Merge agent:
   a. Checkout feature branch
   b. Merge task branch
   c. Resolve conflicts (with harness guidance)
   d. Push to feature branch
5. On success:
   a. Task status → 'completed'
   b. Delete task worktree
   c. Delete task branch
   d. Newly unblocked tasks become 'ready'
6. On failure:
   a. Task status → 'failed'
   b. Keep worktree for debugging
   c. Log error details
```

---

## 9. Storage Structure

### 9.1 Active Feature Storage

```
.dagent-worktrees/feature-car/.dagent/
├── feature.json              # Feature metadata
├── dag.json                  # Current graph state (nodes + connections)
├── dag_history/              # Undo/redo versions (max 20)
│   ├── 001.json
│   ├── 002.json
│   └── ...
├── chat.json                 # Feature-level chat history
├── harness_log.json          # Harness master log
└── nodes/
    ├── 2145/                 # Node ID folder
    │   ├── chat.json         # Node-specific chat
    │   ├── logs.json         # Task agent logs
    │   └── img1.png          # Uploaded media
    └── 3782/
        ├── chat.json
        └── logs.json
```

### 9.2 File Formats

**feature.json:**
```json
{
  "id": "feature-car",
  "name": "Car Builder",
  "status": "in_progress",
  "branchName": "feature/car",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T14:22:00Z"
}
```

**dag.json:**
```json
{
  "nodes": [
    {
      "id": "2145",
      "title": "Schema",
      "description": "Create database schema for car parts",
      "status": "completed",
      "locked": true,
      "position": { "x": 100, "y": 50 }
    },
    {
      "id": "3782",
      "title": "Backend API",
      "description": "Implement REST API for car assembly",
      "status": "running",
      "locked": false,
      "position": { "x": 100, "y": 150 }
    }
  ],
  "connections": [
    { "from": "2145", "to": "3782" }
  ]
}
```

**chat.json:**
```json
{
  "entries": [
    {
      "role": "user",
      "content": "Create a car building feature",
      "media": [],
      "timestamp": "2024-01-15T10:30:00Z"
    },
    {
      "role": "assistant",
      "content": "I'll create a DAG with tasks for schema, API, and UI...",
      "media": [],
      "timestamp": "2024-01-15T10:30:15Z"
    },
    {
      "role": "user",
      "content": "Add authentication requirement",
      "media": ["img1.png"],
      "timestamp": "2024-01-15T10:32:00Z"
    }
  ]
}
```

### 9.3 Archived Feature Storage

When a completed feature is archived:

```
.dagent-archived/
└── feature-car/
    ├── feature.json          # Feature metadata (preserved)
    ├── dag.json              # Final graph state (preserved)
    ├── chat.json             # Feature chat (preserved)
    └── nodes/
        ├── 2145/
        │   ├── chat.json     # Node chat (preserved)
        │   └── img1.png      # Media (preserved)
        └── 3782/
            └── chat.json

    # NOT preserved:
    # - dag_history/ (undo/redo)
    # - harness_log.json
    # - nodes/*/logs.json (task agent logs)
```

### 9.4 Deletion Behavior

When a node is deleted:
- Node removed from dag.json
- Entire node folder deleted (nodes/{id}/)
- This includes: chat.json, logs.json, all media
- A new dag version is created (for undo)

---

## 10. Authentication

### 10.1 Priority Order

Authentication methods checked in order:

| Priority | Method | Source |
|----------|--------|--------|
| 1 | Claude CLI auto-detect | `~/.config/claude/` or equivalent |
| 2 | OAuth Token (env) | `CLAUDE_CODE_OAUTH_TOKEN` |
| 3 | OAuth Token (stored) | `~/.dagent/credentials.json` |
| 4 | API Key (stored) | `~/.dagent/credentials.json` |
| 5 | API Key (env) | `ANTHROPIC_API_KEY` |
| 6 | Manual entry | UI prompt |

### 10.2 Startup Flow

```
┌─────────────────────┐
│ App starts          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Check Claude CLI    │
│ credentials         │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │ Found?    │
     └─────┬─────┘
       Yes │        No
           │         │
           ▼         ▼
┌──────────────┐  ┌─────────────────────┐
│ Auto-connect │  │ Check env vars      │
│ ✓            │  │ CLAUDE_CODE_...     │
└──────────────┘  └──────────┬──────────┘
                             │
                       ┌─────┴─────┐
                       │ Found?    │
                       └─────┬─────┘
                         Yes │        No
                             │         │
                             ▼         ▼
                  ┌──────────────┐  ┌─────────────────────┐
                  │ Auto-connect │  │ Check stored creds  │
                  │ ✓            │  └──────────┬──────────┘
                  └──────────────┘             │
                                         ┌─────┴─────┐
                                         │ Found?    │
                                         └─────┬─────┘
                                           Yes │        No
                                               │         │
                                               ▼         ▼
                                    ┌──────────────┐  ┌─────────────┐
                                    │ Auto-connect │  │ Show auth   │
                                    │ ✓            │  │ UI          │
                                    └──────────────┘  └─────────────┘
```

### 10.3 Credential Storage

```
~/.dagent/
└── credentials.json    # Stored securely (OS keychain when possible)
```

```json
{
  "type": "oauth",
  "token": "oauth_xxxxxxxxxxxxxxxxxxxxx",
  "storedAt": "2024-01-15T10:30:00Z"
}
```

or

```json
{
  "type": "api_key",
  "key": "sk-ant-xxxxxxxxxxxxxxxxxxxxx",
  "storedAt": "2024-01-15T10:30:00Z"
}
```

---

## 11. Visual Design

### 11.1 Color Scheme

**Status Colors:**
| Status | Color | Hex | Usage |
|--------|-------|-----|-------|
| Not Started / Blocked / Ready | Blue | `#3B82F6` | Tasks waiting |
| In Progress / Running / Merging | Yellow | `#F59E0B` | Active work |
| Completed | Green | `#22C55E` | Success |
| Failed / Needs Attention | Red | `#EF4444` | Errors |

### 11.2 Node Design

```
┌─────────────────────────────┐
│ 🔒  Schema              ✏️ 🗑️│
│                             │  ← Status color as background/border
│     ●────────────────▶      │  ← Connection points
└─────────────────────────────┘
      │
      │ Lock icon (if locked)
      │ Title
      │ Edit button
      │ Delete button
      │ Connection handle (drag to connect)
```

### 11.3 Feature Tab Design

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ 🟩 Auth     │ │ 🟨 Car      │ │ 🔵 Payments │
└─────────────┘ └─────────────┘ └─────────────┘
      │              │              │
      │              │              └── Blue border/indicator
      │              └── Yellow border/indicator (selected has different style)
      └── Green border/indicator
```

### 11.4 Kanban Card Design

```
┌───────────────────────┐
│ Car Builder           │
│                       │
│ ████████░░ 3/5 tasks  │  ← Progress bar
│                       │
│ [Archive]             │  ← Only if completed
└───────────────────────┘
```

---

## 12. Implementation References

### 12.1 From Automaker (Reference Patterns)

| Component | Use For |
|-----------|---------|
| Electron app shell | App structure, window management |
| Kanban board | Drag-and-drop, columns, cards |
| Claude CLI auth | OAuth/API key detection patterns |
| Agent process spawning | Child process management |
| Real-time output streaming | Agent log display |
| Credential storage | Secure storage patterns |
| Theme support | Dark/light mode |

### 12.2 Build From Scratch

| Component | Reason |
|-----------|--------|
| DAG graph view | Core differentiator |
| DAG data model | Specific to our needs |
| Node editing UI | Custom requirements |
| Harness agent logic | Novel coordination model |
| Dependency resolution | Core algorithm |
| Intent/approval workflow | Novel communication model |
| Graph versioning/undo | Custom undo system |
| Feature-level chat | Integrated with DAG |
| Node-level chat | Scoped AI interaction |
| Merge agent logic | Dependency-aware merging |
| Archive system | Custom storage cleanup |
| Git worktree management | Automaker's is poorly implemented |

### 12.3 Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | Electron |
| UI Framework | React + TypeScript |
| State Management | Zustand |
| Graph Rendering | React Flow or custom canvas |
| Drag & Drop | dnd-kit |
| Styling | Tailwind CSS |
| Git Operations | simple-git (Node.js) |
| Process Management | Node.js child_process |
| IPC | Electron IPC |

---

## Appendix A: Example Workflow

### Scenario: Building a Car Feature

**1. User creates feature**
```
User: I want to create a car manufacturing feature. It should have
a database for parts, an API for assembly, and a UI for operators.
```

**2. AI generates initial DAG**
```
Nodes:
- Parts Schema (id: 2145)
- Inventory API (id: 3782)  
- Assembly API (id: 4521) - depends on Parts Schema
- Operator UI (id: 5834) - depends on Assembly API

Connections:
- 2145 → 4521 (Schema → Assembly)
- 3782 → 5834 (Inventory → UI)
- 4521 → 5834 (Assembly → UI)
```

**3. User refines**
```
User: Actually, the Inventory API should also depend on the Parts Schema
```

AI adds connection: 2145 → 3782

**4. User locks approved nodes**
User locks "Parts Schema" - satisfied with the description.

**5. Execution begins**
- Harness spawns
- Ready tasks: Parts Schema, Inventory API (no dependencies or deps met)
- With 2 task agents: both start in parallel
- Parts Schema agent: proposes creating tables
- Harness: approves
- Inventory API agent: proposes creating service
- Harness: "Wait for schema to know the table structure, or use abstract interface"

**6. Parts Schema completes**
- Merge agent takes priority
- Merges into feature/car branch
- Assembly API now ready (dependency met)
- If agent available, starts Assembly API

**7. Continue until all complete**
- Each completion triggers merge
- Each merge may unblock new tasks
- Harness coordinates to prevent conflicts

**8. Feature completed**
- All tasks green
- Feature moves to "Completed" in Kanban
- User can archive

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **DAG** | Directed Acyclic Graph - a graph with directed edges and no cycles |
| **Topological Order** | An ordering of nodes where every node comes after its dependencies |
| **Worktree** | Git feature allowing multiple working directories for one repository |
| **Harness** | The orchestrating agent that coordinates task agents |
| **Intention** | A task agent's proposed action, requiring harness approval |
| **Handoff** | Context passed from a completed task to dependent tasks |
| **Feature Branch** | Git branch containing all work for a feature |
| **Task Branch** | Git branch for a single task, merges into feature branch |

---

*Last Updated: January 2025*
*Version: 1.0.0*
