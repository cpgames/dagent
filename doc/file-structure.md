# File Structure

Documentation for the `.dagent` directory structure, covering both the current session-based storage (v3.0+) and the legacy chat.json format.

## Overview

The `.dagent` directory stores all persistent data for a dagent project. It lives at the root of each project (or worktree) and contains:

- **Features**: Feature metadata, DAGs, specifications, and sessions
- **Communication logs**: Agent-to-agent communication history
- **Layout data**: DAG view visualization state

The directory is automatically created when a project is initialized or when the first feature is created.

## Current Structure (v3.0+)

Starting with v3.0, dagent uses a session-based storage model with automatic compaction and checkpoint management.

```
.dagent/
├── features/
│   └── {feature-id}/
│       ├── feature.json          # Feature metadata (name, status, description)
│       ├── dag.json              # Task DAG graph (nodes, connections)
│       ├── spec.md               # Feature specification (PM-generated)
│       ├── sessions/
│       │   └── {session-id}/
│       │       ├── session.json       # Session metadata and stats
│       │       ├── chat.json          # Active message history
│       │       ├── checkpoint.json    # Compacted conversation summary
│       │       ├── context.json       # Project/feature/task context
│       │       └── agent-description.json  # Agent role instructions
│       ├── nodes/
│       │   └── {node-id}/
│       │       ├── plan.json     # Task execution plan (Ralph Loop)
│       │       └── session.json  # [LEGACY] Old task session format
│       └── attachments/          # Feature file attachments (images, docs)
├── harness_log.json              # Agent communication log
└── layout.json                   # DAG view layout data (node positions)
```

### Session File Formats

#### session.json

Session metadata tracking conversation state and statistics.

```json
{
  "id": "pm-feature-auth-feature",
  "type": "feature",
  "agentType": "pm",
  "featureId": "auth-feature",
  "createdAt": "2026-01-17T10:00:00.000Z",
  "updatedAt": "2026-01-17T12:30:00.000Z",
  "status": "active",
  "files": {
    "chat": "chat_pm-feature-auth-feature.json",
    "checkpoint": "checkpoint_pm-feature-auth-feature.json",
    "context": "context_pm-feature-auth-feature.json",
    "agentDescription": "agent-description_pm-feature-auth-feature.json"
  },
  "stats": {
    "totalMessages": 42,
    "totalTokens": 15000,
    "totalCompactions": 2,
    "lastCompactionAt": "2026-01-17T12:00:00.000Z"
  }
}
```

#### chat.json

Active message history with user and assistant messages.

```json
{
  "messages": [
    {
      "id": "msg-uuid-1",
      "role": "user",
      "content": "Create a task for authentication",
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

#### checkpoint.json

Compacted conversation summary preserving key context across compaction cycles.

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

#### context.json

Project and feature context assembled for each request.

```json
{
  "projectRoot": "/path/to/project",
  "featureId": "auth-feature",
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

#### agent-description.json

Agent role and tool instructions.

```json
{
  "agentType": "pm",
  "roleInstructions": "You are a Project Manager agent responsible for...",
  "toolInstructions": "Available tools: CreateTask, UpdateTask, DeleteTask...",
  "createdAt": "2026-01-17T10:00:00.000Z"
}
```

### Session ID Naming Convention

Session IDs follow a consistent format for easy identification:

| Session Type | ID Format | Example |
|-------------|-----------|---------|
| Feature (PM) | `{agentType}-feature-{featureId}` | `pm-feature-auth-feature` |
| Task (Dev) | `{agentType}-task-{featureId}-{taskId}-{state}` | `dev-task-auth-feature-task-123-in_dev` |
| Task (QA) | `{agentType}-task-{featureId}-{taskId}-{state}` | `qa-task-auth-feature-task-123-in_qa` |

## Legacy Structure (pre-v3.0)

The following structure was used before v3.0 and is now deprecated. Existing files in this format are automatically migrated on first access.

```
.dagent/
├── features/
│   └── {feature-id}/
│       ├── feature.json          # Feature metadata
│       ├── dag.json              # Task DAG graph
│       ├── chat.json             # [DEPRECATED] Old PM chat format
│       └── nodes/
│           └── {node-id}/
│               └── session.json  # [DEPRECATED] Old task session format
├── harness_log.json
└── layout.json
```

### Legacy chat.json Format

The old PM chat format stored a flat array of chat entries:

```json
{
  "entries": [
    {
      "type": "user",
      "text": "Create a login feature",
      "timestamp": "2026-01-15T10:00:00.000Z"
    },
    {
      "type": "assistant",
      "text": "I'll create the login feature...",
      "timestamp": "2026-01-15T10:00:05.000Z"
    }
  ]
}
```

**Limitations:**
- No token tracking
- No compaction or checkpoint support
- No context preservation
- Simple text-only messages

### Legacy nodes/{node-id}/session.json Format

The old task session format used a different message structure:

```json
{
  "taskId": "task-123",
  "agentId": "dev-abc",
  "status": "active",
  "messages": [
    {
      "direction": "outgoing",
      "type": "progress",
      "content": "Starting implementation...",
      "timestamp": 1705488000000
    }
  ]
}
```

**Limitations:**
- Unix timestamps instead of ISO strings
- Direction-based message tracking (outgoing/incoming)
- No role field (user/assistant/system)
- No metadata support

## Migration Notes

### Automatic Migration

Old file formats are automatically migrated when first accessed by SessionManager:

1. **PM chat.json**: Migrated to `sessions/{session-id}/` format
2. **Node session.json**: Migrated to SessionManager format with proper roles

### Migration Process

1. Backup file created with `.backup` suffix before modification
2. Old format parsed and converted to new ChatMessage format
3. New session files created in `sessions/` directory
4. Original file preserved (not deleted) for safety

### Migration Field Mappings

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `entries[].type` | `messages[].role` | 'user' or 'assistant' |
| `entries[].text` | `messages[].content` | Content preserved |
| `entries[].timestamp` | `messages[].timestamp` | ISO string preserved |
| `messages[].direction` | `messages[].role` | 'outgoing' -> 'assistant' |
| `messages[].timestamp` (Unix) | `messages[].timestamp` | Converted to ISO string |

### Post-Migration Verification

After migration, verify:

1. New session files exist in `sessions/` directory
2. Message content and order preserved
3. Timestamps converted correctly
4. Backup files created

## Cross-References

For more detailed documentation, see:

- [Session Architecture](./session-architecture.md) - System design and data flow diagrams
- [API Reference](./api-reference.md) - Complete SessionManager API documentation
- [Compaction Guide](./compaction-guide.md) - Checkpoint compression and token management

## File Purpose Summary

| File | Purpose | Updated When |
|------|---------|--------------|
| `feature.json` | Feature metadata | Feature properties change |
| `dag.json` | Task graph structure | Tasks added/removed/connected |
| `spec.md` | Feature specification | PM creates/updates spec |
| `session.json` | Session metadata | Every message/compaction |
| `chat.json` | Message history | Every message (cleared on compaction) |
| `checkpoint.json` | Compacted summary | On compaction only |
| `context.json` | Request context | Rebuilt per request |
| `agent-description.json` | Agent instructions | Set at session creation |
| `plan.json` | Task execution plan | Ralph Loop updates |
| `harness_log.json` | Agent communications | Inter-agent messages |
| `layout.json` | DAG visualization | Node positions change |
