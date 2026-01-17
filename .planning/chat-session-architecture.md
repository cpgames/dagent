# Chat Session Architecture Proposal

## Problem
Currently, chat histories are scattered across multiple files with no session concept:
- Planning conversation saves to `chat.json` with system prompt as user message
- Interactive chat loads same `chat.json` and continues conversation
- No clear session boundaries or lifecycle management

## Proposed Solution: Session-Based Architecture

### 1. Session Model

```typescript
interface ChatSession {
  id: string                    // UUID for the session
  type: 'feature' | 'task'      // What this session is attached to
  contextId: string             // featureId or taskId
  agentType: 'pm' | 'dev' | 'qa' // Which agent is handling this
  createdAt: string
  updatedAt: string
  messages: ChatEntry[]
}

interface ChatEntry {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  metadata?: {
    toolUse?: string           // Tool name if this was a tool call
    internal?: boolean         // Mark system/internal messages (don't show in UI)
  }
}
```

### 2. Storage Structure

```
.dagent-worktrees/
└── {featureId}/
    └── .dagent/
        ├── feature.json          # Contains sessionId reference
        ├── sessions/
        │   └── {sessionId}.json  # Actual chat session
        └── nodes/
            └── {taskId}/
                └── session.json  # References or embeds chat session
```

### 3. SessionManager Service

**Location**: `src/main/services/session-manager.ts`

```typescript
class SessionManager {
  private sessions: Map<string, ChatSession> = new Map()

  // Create new session
  createSession(type: 'feature' | 'task', contextId: string, agentType: string): ChatSession

  // Load session from disk
  loadSession(sessionId: string, projectRoot: string, featureId: string): Promise<ChatSession>

  // Save session to disk
  saveSession(session: ChatSession, projectRoot: string, featureId: string): Promise<void>

  // Get or create session for a context
  getOrCreateSession(contextId: string, type: 'feature' | 'task', agentType: string): ChatSession

  // Add message to session
  addMessage(sessionId: string, message: ChatEntry): void

  // Get all messages (optionally filtered)
  getMessages(sessionId: string, includeInternal?: boolean): ChatEntry[]
}
```

### 4. Updated Feature Model

```typescript
interface Feature {
  id: string
  name: string
  status: FeatureStatus
  branchName: string
  createdAt: string
  updatedAt: string
  description?: string
  attachments?: string[]
  autoMerge: boolean

  // NEW: Session reference
  pmSessionId?: string  // Chat session with PM agent
}
```

### 5. Migration Path

#### Phase 1: Create SessionManager (non-breaking)
- Implement SessionManager service
- Add IPC handlers for session operations
- Keep existing chat.json working

#### Phase 2: Migrate PM Agent Manager
- PM planning creates a session via SessionManager
- Save sessionId to feature.json
- Interactive chat loads session by ID
- Mark planning messages with `metadata.internal = true`

#### Phase 3: Update Chat Store
- Load session by ID instead of directly reading chat.json
- Filter messages based on `metadata.internal` flag
- Save to session instead of chat.json

#### Phase 4: Deprecate old chat.json
- Move existing chat.json files to sessions/
- Update feature.json with sessionId references

## Benefits

1. **Single Session Per Context**: Planning and interactive chat share one session
2. **Clean UI**: Internal/system messages marked with metadata, filtered in UI
3. **Session Lifecycle**: Proper create/load/save/archive flow
4. **Scalability**: Easy to add QA agent sessions, multi-agent conversations
5. **Migration Safe**: Can coexist with current system during migration

## Open Questions

1. Should we store all messages in one session or separate planning/interactive?
2. Should sessionId be in feature.json or should we derive it (e.g., `pm-{featureId}`)?
3. Do we need session archiving when features are completed?
4. Should we support multiple concurrent sessions per feature (e.g., user + PM + QA)?
