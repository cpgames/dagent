# Session Architecture

This document describes the session management architecture for the dagent application, which provides unified conversation management across all agent types.

## Overview

### Purpose of SessionManager

The `SessionManager` is a centralized service responsible for managing conversation sessions across all agent types in the dagent application. It provides:

- **Unified session storage**: Consistent storage format for all agent conversations
- **Automatic compaction**: Token limit management through intelligent checkpoint compression
- **Context preservation**: Maintaining project, feature, and task context across conversations
- **Request building**: Assembling complete requests ready for the Claude Agent SDK

### Key Concepts

#### Sessions

A **session** represents an ongoing conversation between a user and an agent. Each session tracks:

- Messages exchanged between user and agent
- Checkpoint summaries of compressed conversation history
- Context about the current project, feature, and task
- Agent description with role and tool instructions

#### Checkpoints

A **checkpoint** is a compressed summary of conversation history. When the conversation grows too large (approaching token limits), older messages are "compacted" into the checkpoint. The checkpoint contains:

- **Completed**: List of completed tasks and actions
- **In Progress**: Currently active work items
- **Pending**: Remaining items to do
- **Blockers**: Issues blocking progress
- **Decisions**: Key decisions made during the conversation

#### Compaction

**Compaction** is the process of merging old messages into a checkpoint summary. This happens automatically when the total request size approaches 90% of the 100k token limit (90k tokens). Compaction:

1. Takes the current checkpoint (if any) and recent messages
2. Sends them to Claude with instructions to create an updated summary
3. Replaces the old checkpoint with the new one
4. Clears the compacted messages from the chat history

### Relationship to Agent Types

The session system supports five agent types:

| Agent Type | Purpose | Session Type |
|------------|---------|--------------|
| **PM** | Project management, task creation | Feature-level |
| **Dev** | Task implementation | Task-level (in_dev state) |
| **QA** | Code review and testing | Task-level (in_qa state) |
| **Harness** | Orchestration and approval | Feature-level |
| **Merge** | Branch merging | Task-level (ready_for_merge state) |

## Architecture Diagram

```
                           +------------------+
                           |   SessionManager |
                           |    (Singleton)   |
                           +--------+---------+
                                    |
         +--------------------------+--------------------------+
         |                          |                          |
         v                          v                          v
+----------------+        +------------------+        +----------------+
|  Active        |        |  File System     |        |  IPC Handlers  |
|  Sessions Map  |        |  (.dagent)       |        |  (Renderer)    |
+----------------+        +------------------+        +----------------+
         |                          |                          |
         |                          v                          |
         |              +------------------+                   |
         |              |  Session Files   |                   |
         |              |  - session.json  |                   |
         |              |  - chat.json     |                   |
         |              |  - checkpoint.json|                  |
         |              |  - context.json  |                   |
         |              |  - agent-desc.json|                  |
         |              +------------------+                   |
         |                                                     |
         v                                                     v
+--------+--------+                               +-----------+-----------+
|     Agents      |                               |    Renderer Process   |
| (PM, Dev, QA,   |                               |  - ChatPanel          |
|  Harness, Merge)|                               |  - SessionStatus      |
+-----------------+                               |  - SessionActions     |
         |                                        +-----------------------+
         v
+------------------+
|  Claude Agent    |
|      SDK         |
+------------------+
```

### Data Flow for Message Handling

```
User Input
    |
    v
1. Renderer sends message via IPC
    |
    v
2. IPC handler calls SessionManager.addMessage()
    |
    v
3. SessionManager:
   a. Loads session from cache or disk
   b. Creates ChatMessage with ID and timestamp
   c. Appends to chat session
   d. Updates session stats
   e. Saves chat session to disk
   f. Checks if compaction needed
   g. Broadcasts event to all windows
    |
    v
4. Agent builds request via SessionManager.buildRequest()
    |
    v
5. Agent sends request to Claude Agent SDK
    |
    v
6. Response is added as assistant message
    |
    v
7. UI updates via broadcast events
```

## Session Lifecycle

### Creation: getOrCreateSession Flow

```typescript
// Session ID format:
// Feature: "{agentType}-feature-{featureId}"
// Task: "{agentType}-task-{featureId}-{taskId}-{state}"

const session = await sessionManager.getOrCreateSession({
  type: 'feature',        // or 'task'
  agentType: 'pm',        // pm, dev, qa, harness, merge
  featureId: 'my-feature',
  taskId: 'task-123',     // optional, for task sessions
  taskState: 'in_dev'     // optional, for task sessions
})
```

The `getOrCreateSession` method:

1. Builds a consistent session ID from the options
2. Checks in-memory cache for existing session
3. If not cached, attempts to load from disk
4. If not on disk, creates new session with:
   - Empty chat session (messages array)
   - Initial checkpoint (empty summary)
   - Session metadata file
5. Caches the session in memory
6. Broadcasts "created" event to all renderer windows

### Usage: Adding Messages and Updating Checkpoints

```typescript
// Add a user message
const message = await sessionManager.addMessage(
  sessionId,
  featureId,
  {
    role: 'user',
    content: 'Please create a task for implementing auth'
  }
)

// Add an assistant response with token metadata
await sessionManager.addMessage(
  sessionId,
  featureId,
  {
    role: 'assistant',
    content: 'I created a new task...',
    metadata: {
      agentType: 'pm',
      tokens: { input: 1000, output: 500 }
    }
  }
)

// Get recent messages for display
const messages = await sessionManager.getRecentMessages(sessionId, featureId, 50)

// Get checkpoint for summary display
const checkpoint = await sessionManager.getCheckpoint(sessionId, featureId)
```

### Archival: When and How Sessions are Archived

Sessions are archived when their associated feature or task reaches completion:

```typescript
// Archive when feature is completed
await sessionManager.archiveSession(sessionId, featureId)
```

Archival:

1. Sets session status to 'archived'
2. Updates the session timestamp
3. Saves the session metadata
4. Removes from in-memory cache
5. Broadcasts "archived" event

Archived sessions remain on disk and can be viewed but are no longer active.

## File Structure

### Session Storage Paths

Sessions are stored within the feature's worktree directory:

```
.dagent-worktrees/
  {featureId}/
    .dagent/
      sessions/
        session_{sessionId}.json     # Session metadata
        chat_{sessionId}.json        # Message history
        checkpoint_{sessionId}.json  # Compacted summary
        context_{sessionId}.json     # Project context
        agent-description_{sessionId}.json  # Agent instructions
```

### File Formats

#### session_{sessionId}.json

```json
{
  "id": "pm-feature-my-feature",
  "type": "feature",
  "agentType": "pm",
  "featureId": "my-feature",
  "createdAt": "2026-01-17T10:00:00.000Z",
  "updatedAt": "2026-01-17T12:30:00.000Z",
  "status": "active",
  "files": {
    "chat": "chat_pm-feature-my-feature.json",
    "checkpoint": "checkpoint_pm-feature-my-feature.json",
    "context": "context_pm-feature-my-feature.json",
    "agentDescription": "agent-description_pm-feature-my-feature.json"
  },
  "stats": {
    "totalMessages": 42,
    "totalTokens": 15000,
    "totalCompactions": 2,
    "lastCompactionAt": "2026-01-17T12:00:00.000Z"
  }
}
```

#### chat_{sessionId}.json

```json
{
  "messages": [
    {
      "id": "msg-uuid-1",
      "role": "user",
      "content": "Create a task for auth",
      "timestamp": "2026-01-17T12:25:00.000Z"
    },
    {
      "id": "msg-uuid-2",
      "role": "assistant",
      "content": "I'll create an authentication task...",
      "timestamp": "2026-01-17T12:25:05.000Z",
      "metadata": {
        "agentType": "pm",
        "tokens": { "input": 500, "output": 200 }
      }
    }
  ],
  "totalMessages": 42,
  "oldestMessageTimestamp": "2026-01-17T12:00:00.000Z",
  "newestMessageTimestamp": "2026-01-17T12:25:05.000Z"
}
```

#### checkpoint_{sessionId}.json

```json
{
  "version": 3,
  "createdAt": "2026-01-17T10:00:00.000Z",
  "updatedAt": "2026-01-17T12:00:00.000Z",
  "summary": {
    "completed": [
      "Reviewed feature requirements",
      "Created initial task breakdown"
    ],
    "inProgress": [
      "Designing authentication flow"
    ],
    "pending": [
      "Implement OAuth integration",
      "Add session management"
    ],
    "blockers": [],
    "decisions": [
      "Using JWT for session tokens",
      "OAuth provider: GitHub only initially"
    ]
  },
  "compactionInfo": {
    "messagesCompacted": 40,
    "oldestMessageTimestamp": "2026-01-17T10:00:00.000Z",
    "newestMessageTimestamp": "2026-01-17T11:55:00.000Z",
    "compactedAt": "2026-01-17T12:00:00.000Z"
  },
  "stats": {
    "totalCompactions": 2,
    "totalMessages": 40,
    "totalTokens": 12000
  }
}
```

#### context_{sessionId}.json

```json
{
  "projectRoot": "/path/to/project",
  "featureId": "my-feature",
  "featureName": "User Authentication",
  "featureGoal": "Add secure user authentication with OAuth",
  "taskId": "task-123",
  "taskTitle": "Implement OAuth flow",
  "taskState": "in_dev",
  "dagSummary": "5 tasks: 2 complete, 1 in progress, 2 pending",
  "dependencies": ["task-100", "task-101"],
  "dependents": ["task-125"],
  "projectStructure": "src/\n  main/\n  renderer/",
  "claudeMd": "# CLAUDE.md content...",
  "recentCommits": [
    "abc123 - Add auth types",
    "def456 - Set up OAuth routes"
  ]
}
```

#### agent-description_{sessionId}.json

```json
{
  "agentType": "pm",
  "roleInstructions": "You are a Project Manager agent...",
  "toolInstructions": "Available tools: CreateTask, UpdateTask...",
  "createdAt": "2026-01-17T10:00:00.000Z"
}
```

### Checkpoint vs Session vs Context Files

| File | Purpose | Updates |
|------|---------|---------|
| **session.json** | Metadata and stats | On every message/compaction |
| **chat.json** | Active message history | On every message, cleared on compaction |
| **checkpoint.json** | Compressed history | Only on compaction |
| **context.json** | Project/feature/task context | Rebuilt on each request |
| **agent-description.json** | Agent role instructions | Set once at session creation |

## Integration Points

### How Agents Use SessionManager

```typescript
import { getSessionManager } from './session-manager'

// Get singleton instance
const sessionManager = getSessionManager(projectRoot)

// In PM Agent
async function handleUserMessage(featureId: string, userMessage: string) {
  // Get or create session
  const session = await sessionManager.getOrCreateSession({
    type: 'feature',
    agentType: 'pm',
    featureId
  })

  // Add user message
  await sessionManager.addMessage(session.id, featureId, {
    role: 'user',
    content: userMessage
  })

  // Build request for Claude
  const request = await sessionManager.buildRequest(
    session.id,
    featureId,
    userMessage
  )

  // Send to Claude Agent SDK
  const response = await agentService.streamQuery({
    prompt: request.userPrompt,
    systemPrompt: request.systemPrompt,
    // ... other options
  })

  // Add assistant response
  await sessionManager.addMessage(session.id, featureId, {
    role: 'assistant',
    content: response,
    metadata: {
      agentType: 'pm',
      tokens: { input: inputTokens, output: outputTokens }
    }
  })
}
```

### IPC Handlers for Renderer Communication

The session system exposes IPC handlers for the renderer process:

```typescript
// Main process - session-ipc.ts
ipcMain.handle('session:getMessages', async (_, sessionId, featureId, limit) => {
  return sessionManager.getRecentMessages(sessionId, featureId, limit)
})

ipcMain.handle('session:getCheckpoint', async (_, sessionId, featureId) => {
  return sessionManager.getCheckpoint(sessionId, featureId)
})

ipcMain.handle('session:forceCompact', async (_, sessionId, featureId) => {
  return sessionManager.forceCompact(sessionId, featureId)
})

ipcMain.handle('session:clearMessages', async (_, sessionId, featureId) => {
  return sessionManager.clearMessages(sessionId, featureId)
})

ipcMain.handle('session:buildRequest', async (_, sessionId, featureId, msg) => {
  return sessionManager.buildRequest(sessionId, featureId, msg)
})

ipcMain.handle('session:previewRequest', async (_, sessionId, featureId, msg) => {
  return sessionManager.previewRequest(sessionId, featureId, msg)
})
```

### Event Broadcasting System

SessionManager broadcasts events to all renderer windows:

```typescript
// Events broadcast on session changes
type SessionEvent =
  | 'session:updated'       // General updates (created, message_added, archived)
  | 'session:compaction-start'   // Compaction beginning
  | 'session:compaction-complete' // Compaction finished
  | 'session:compaction-error'   // Compaction failed

// Renderer subscribes to events
window.api.session.onUpdate((event: SessionUpdateEvent) => {
  if (event.action === 'message_added') {
    // Refresh message list
  }
})

window.api.session.onCompactionStart((data) => {
  // Show compaction indicator
})

window.api.session.onCompactionComplete((data) => {
  // Update checkpoint display
  // Hide compaction indicator
})
```

## Related Documentation

- [Compaction Guide](./compaction-guide.md) - Detailed guide to the compaction system
- [API Reference](./api-reference.md) - Complete SessionManager API documentation
