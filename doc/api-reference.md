# API Reference

Complete API documentation for the SessionManager and related services.

## SessionManager API

### Module Exports

```typescript
import {
  SessionManager,
  getSessionManager,
  resetSessionManager
} from './session-manager'
```

### getSessionManager(projectRoot?)

Get or create the SessionManager singleton instance.

```typescript
function getSessionManager(projectRoot?: string): SessionManager
```

**Parameters:**
- `projectRoot` (optional): Project root path. Required on first call.

**Returns:** `SessionManager` instance

**Throws:** Error if called without `projectRoot` when not initialized.

**Example:**
```typescript
// Initialize on app startup
const sessionManager = getSessionManager('/path/to/project')

// Get existing instance later (no projectRoot needed)
const manager = getSessionManager()
```

### resetSessionManager()

Reset the SessionManager singleton. Useful for testing or switching projects.

```typescript
function resetSessionManager(): void
```

**Example:**
```typescript
// When switching projects
resetSessionManager()
const newManager = getSessionManager('/path/to/new/project')
```

## Session Methods

### getOrCreateSession(options)

Get an existing session or create a new one.

```typescript
async getOrCreateSession(options: CreateSessionOptions): Promise<Session>
```

**Parameters:**
```typescript
interface CreateSessionOptions {
  type: 'feature' | 'task'
  agentType: 'pm' | 'dev' | 'qa' | 'harness' | 'merge'
  featureId: string
  taskId?: string      // Required for task sessions
  taskState?: TaskState // Required for task sessions
}

type TaskState =
  | 'planning'
  | 'in_dev'
  | 'dev_complete'
  | 'in_qa'
  | 'qa_complete'
  | 'ready_for_merge'
  | 'merged'
```

**Returns:** `Session` object

**Session ID Format:**
- Feature: `"{agentType}-feature-{featureId}"`
- Task: `"{agentType}-task-{featureId}-{taskId}-{taskState}"`

**Example:**
```typescript
// Feature session for PM agent
const pmSession = await sessionManager.getOrCreateSession({
  type: 'feature',
  agentType: 'pm',
  featureId: 'auth-feature'
})

// Task session for Dev agent
const devSession = await sessionManager.getOrCreateSession({
  type: 'task',
  agentType: 'dev',
  featureId: 'auth-feature',
  taskId: 'task-123',
  taskState: 'in_dev'
})
```

### getSessionById(sessionId, featureId)

Get a session by its ID.

```typescript
async getSessionById(sessionId: string, featureId: string): Promise<Session | null>
```

**Parameters:**
- `sessionId`: The session identifier
- `featureId`: Feature ID for file path resolution

**Returns:** `Session` or `null` if not found

**Example:**
```typescript
const session = await sessionManager.getSessionById(
  'pm-feature-auth-feature',
  'auth-feature'
)

if (session) {
  console.log('Session status:', session.status)
  console.log('Total messages:', session.stats.totalMessages)
}
```

### archiveSession(sessionId, featureId)

Archive a session when its feature or task is complete.

```typescript
async archiveSession(sessionId: string, featureId: string): Promise<void>
```

**Parameters:**
- `sessionId`: The session identifier
- `featureId`: Feature ID

**Effects:**
- Sets session status to 'archived'
- Removes from in-memory cache
- Broadcasts 'archived' event

**Example:**
```typescript
// Archive when feature is completed
await sessionManager.archiveSession(
  'pm-feature-auth-feature',
  'auth-feature'
)
```

## Message Methods

### addMessage(sessionId, featureId, message)

Add a message to a session.

```typescript
async addMessage(
  sessionId: string,
  featureId: string,
  message: Omit<ChatMessage, 'id' | 'timestamp'>
): Promise<ChatMessage>
```

**Parameters:**
- `sessionId`: The session identifier
- `featureId`: Feature ID
- `message`: Message content (without id and timestamp)

**Message Structure:**
```typescript
interface ChatMessage {
  id: string          // Auto-generated UUID
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string   // Auto-generated ISO timestamp
  metadata?: {
    agentType?: AgentType
    agentId?: string
    taskId?: string
    iteration?: number
    toolUse?: {
      name: string
      input?: unknown
      result?: unknown
    }
    tokens?: {
      input: number
      output: number
    }
    internal?: boolean  // Hide from user-facing UI
    verificationResults?: VerificationResultSummary[]
  }
}
```

**Returns:** Complete `ChatMessage` with generated id and timestamp

**Side Effects:**
- Updates session stats
- Saves chat session to disk
- Checks and may trigger compaction
- Broadcasts 'message_added' event

**Example:**
```typescript
// Add user message
const userMsg = await sessionManager.addMessage(
  sessionId,
  featureId,
  {
    role: 'user',
    content: 'Create a login form component'
  }
)

// Add assistant response with metadata
const assistantMsg = await sessionManager.addMessage(
  sessionId,
  featureId,
  {
    role: 'assistant',
    content: 'I have created the LoginForm component...',
    metadata: {
      agentType: 'dev',
      tokens: { input: 1500, output: 800 },
      toolUse: {
        name: 'write_file',
        input: { path: 'src/components/LoginForm.tsx' }
      }
    }
  }
)

// Add internal message (hidden from UI)
await sessionManager.addMessage(
  sessionId,
  featureId,
  {
    role: 'assistant',
    content: 'Iteration 3 verification results...',
    metadata: {
      internal: true,
      iteration: 3,
      verificationResults: [
        { checkId: 'build', passed: true },
        { checkId: 'lint', passed: true },
        { checkId: 'test', passed: false, error: 'Test failed' }
      ]
    }
  }
)
```

### getRecentMessages(sessionId, featureId, limit?)

Get recent user-facing messages from a session.

```typescript
async getRecentMessages(
  sessionId: string,
  featureId: string,
  limit?: number
): Promise<ChatMessage[]>
```

**Parameters:**
- `sessionId`: The session identifier
- `featureId`: Feature ID
- `limit`: Maximum messages to return (default: 10)

**Returns:** Array of `ChatMessage` (excludes internal messages)

**Example:**
```typescript
// Get last 50 messages for display
const messages = await sessionManager.getRecentMessages(
  sessionId,
  featureId,
  50
)

messages.forEach(msg => {
  console.log(`[${msg.role}]: ${msg.content.substring(0, 50)}...`)
})
```

### getAllMessages(sessionId, featureId)

Get ALL messages including internal ones.

```typescript
async getAllMessages(
  sessionId: string,
  featureId: string
): Promise<ChatMessage[]>
```

**Parameters:**
- `sessionId`: The session identifier
- `featureId`: Feature ID

**Returns:** Array of all `ChatMessage` objects

**Example:**
```typescript
// Get all messages for debugging
const allMessages = await sessionManager.getAllMessages(sessionId, featureId)
const internalCount = allMessages.filter(m => m.metadata?.internal).length
console.log(`Total: ${allMessages.length}, Internal: ${internalCount}`)
```

### clearMessages(sessionId, featureId)

Clear all messages from a session.

```typescript
async clearMessages(sessionId: string, featureId: string): Promise<void>
```

**Parameters:**
- `sessionId`: The session identifier
- `featureId`: Feature ID

**Effects:**
- Clears all messages from chat session
- Resets message count and token stats
- Preserves checkpoint (summary remains)

**Example:**
```typescript
// Clear messages but keep checkpoint
await sessionManager.clearMessages(sessionId, featureId)
```

## Checkpoint Methods

### getCheckpoint(sessionId, featureId)

Get the current checkpoint for a session.

```typescript
async getCheckpoint(
  sessionId: string,
  featureId: string
): Promise<Checkpoint | null>
```

**Returns:** `Checkpoint` object or `null`

**Checkpoint Structure:**
```typescript
interface Checkpoint {
  version: number
  createdAt: string
  updatedAt: string
  summary: {
    completed: string[]
    inProgress: string[]
    pending: string[]
    blockers: string[]
    decisions: string[]
  }
  compactionInfo: {
    messagesCompacted: number
    oldestMessageTimestamp: string
    newestMessageTimestamp: string
    compactedAt: string
  }
  stats: {
    totalCompactions: number
    totalMessages: number
    totalTokens: number
  }
}
```

**Example:**
```typescript
const checkpoint = await sessionManager.getCheckpoint(sessionId, featureId)

if (checkpoint) {
  console.log('Checkpoint version:', checkpoint.version)
  console.log('Completed:', checkpoint.summary.completed)
  console.log('In Progress:', checkpoint.summary.inProgress)
}
```

### updateCheckpoint(sessionId, featureId, checkpoint)

Manually update a session's checkpoint.

```typescript
async updateCheckpoint(
  sessionId: string,
  featureId: string,
  checkpoint: Checkpoint
): Promise<void>
```

**Parameters:**
- `sessionId`: The session identifier
- `featureId`: Feature ID
- `checkpoint`: New checkpoint data

**Example:**
```typescript
// Add a decision to checkpoint
const checkpoint = await sessionManager.getCheckpoint(sessionId, featureId)
checkpoint.summary.decisions.push('Using React Query for data fetching')
await sessionManager.updateCheckpoint(sessionId, featureId, checkpoint)
```

### forceCompact(sessionId, featureId)

Manually trigger compaction for a session.

```typescript
async forceCompact(sessionId: string, featureId: string): Promise<void>
```

**Parameters:**
- `sessionId`: The session identifier
- `featureId`: Feature ID

**Effects:**
- Compacts all messages into checkpoint
- Clears message history
- Updates compaction stats
- Broadcasts compaction events

**Example:**
```typescript
// Force compaction before a large operation
await sessionManager.forceCompact(sessionId, featureId)
```

### getCompactionMetrics(sessionId, featureId)

Get compaction statistics for a session.

```typescript
async getCompactionMetrics(
  sessionId: string,
  featureId: string
): Promise<{
  totalCompactions: number
  totalMessagesCompacted: number
  totalTokens: number
  lastCompactionAt?: string
} | null>
```

**Returns:** Compaction metrics or `null`

**Example:**
```typescript
const metrics = await sessionManager.getCompactionMetrics(sessionId, featureId)

if (metrics) {
  console.log('Total compactions:', metrics.totalCompactions)
  console.log('Messages compacted:', metrics.totalMessagesCompacted)
  console.log('Last compaction:', metrics.lastCompactionAt)
}
```

## Request Building Methods

### buildRequest(sessionId, featureId, userMessage)

Build a complete request ready for Claude Agent SDK.

```typescript
async buildRequest(
  sessionId: string,
  featureId: string,
  userMessage: string
): Promise<{
  systemPrompt: string
  userPrompt: string
  totalTokens: number
}>
```

**Parameters:**
- `sessionId`: The session identifier
- `featureId`: Feature ID
- `userMessage`: The user's message

**Returns:**
- `systemPrompt`: Combined agent description, context, checkpoint, and messages
- `userPrompt`: The user's message
- `totalTokens`: Estimated total token count

**Example:**
```typescript
const request = await sessionManager.buildRequest(
  sessionId,
  featureId,
  'Update the auth flow to use OAuth'
)

// Use with Claude Agent SDK
const response = await agentService.streamQuery({
  prompt: request.userPrompt,
  systemPrompt: request.systemPrompt,
  cwd: projectRoot
})

console.log('Request size:', request.totalTokens, 'tokens')
```

### previewRequest(sessionId, featureId, userMessage?)

Preview request with detailed token breakdown.

```typescript
async previewRequest(
  sessionId: string,
  featureId: string,
  userMessage?: string
): Promise<{
  systemPrompt: string
  userPrompt: string
  breakdown: {
    agentDescTokens: number
    contextTokens: number
    checkpointTokens: number
    messagesTokens: number
    userPromptTokens: number
    total: number
  }
}>
```

**Parameters:**
- `sessionId`: The session identifier
- `featureId`: Feature ID
- `userMessage`: Optional user message (defaults to empty)

**Returns:** Request preview with token breakdown

**Example:**
```typescript
const preview = await sessionManager.previewRequest(sessionId, featureId)

console.log('Token Breakdown:')
console.log('  Agent Description:', preview.breakdown.agentDescTokens)
console.log('  Context:', preview.breakdown.contextTokens)
console.log('  Checkpoint:', preview.breakdown.checkpointTokens)
console.log('  Messages:', preview.breakdown.messagesTokens)
console.log('  Total:', preview.breakdown.total)

// Check if compaction needed
if (preview.breakdown.total > 90000) {
  console.log('Warning: Approaching token limit!')
}
```

## Context and Agent Description Methods

### getContext(sessionId, featureId)

Get the current context for a session.

```typescript
async getContext(
  sessionId: string,
  featureId: string
): Promise<SessionContext | null>
```

**Returns:** `SessionContext` or `null`

### updateContext(sessionId, featureId, context)

Update context for a session.

```typescript
async updateContext(
  sessionId: string,
  featureId: string,
  context: SessionContext
): Promise<void>
```

**Context Structure:**
```typescript
interface SessionContext {
  projectRoot: string
  featureId: string
  featureName: string
  featureGoal?: string
  taskId?: string
  taskTitle?: string
  taskState?: TaskState
  dagSummary?: string
  dependencies?: string[]
  dependents?: string[]
  projectStructure?: string
  claudeMd?: string
  projectMd?: string
  recentCommits?: string[]
  attachments?: string[]
}
```

### getAgentDescription(sessionId, featureId)

Get agent description for a session.

```typescript
async getAgentDescription(
  sessionId: string,
  featureId: string
): Promise<AgentDescription | null>
```

### setAgentDescription(sessionId, featureId, description)

Set agent description for a session.

```typescript
async setAgentDescription(
  sessionId: string,
  featureId: string,
  description: AgentDescription
): Promise<void>
```

**AgentDescription Structure:**
```typescript
interface AgentDescription {
  agentType: AgentType
  roleInstructions: string
  toolInstructions?: string
  createdAt: string
}
```

## Token Estimation Functions

These functions are exported from `token-estimator.ts`:

### estimateTokens(text)

Estimate tokens for a text string.

```typescript
function estimateTokens(text: string): number
```

### estimateMessagesTokens(messages)

Estimate tokens for an array of messages.

```typescript
function estimateMessagesTokens(messages: ChatMessage[]): number
```

### estimateRequest(options)

Estimate tokens for a complete request.

```typescript
function estimateRequest(options: {
  agentDescription: AgentDescription
  context: SessionContext
  checkpoint?: Checkpoint
  messages: ChatMessage[]
  userPrompt: string
}): TokenEstimate

interface TokenEstimate {
  systemPrompt: number
  messages: number
  userPrompt: number
  total: number
  limit: number          // 100,000
  needsCompaction: boolean
}
```

---

## Deprecated APIs

The following APIs are deprecated and will be removed in a future version:

### FeatureStore Chat Methods

| Method | Replacement | Notes |
|--------|-------------|-------|
| `saveChat(featureId, chat)` | `SessionManager.addMessage()` | Use session-based storage |
| `loadChat(featureId)` | `SessionManager.getSession()` | Returns full session with checkpoint |
| `saveNodeChat(featureId, nodeId, chat)` | `SessionManager` with task context | Pass taskId in session metadata |
| `loadNodeChat(featureId, nodeId)` | `SessionManager` with task context | Query by taskId |

### chat-store (Renderer)

The `chat-store.ts` Zustand store uses the legacy chat format. New features should use SessionManager directly via IPC handlers.

See [Migration Guide](#migration-guide) for detailed migration instructions.

---

## Migration Guide

### Old API vs New API Mapping

| Old API | New API | Notes |
|---------|---------|-------|
| `ChatHistory.entries` | `ChatSession.messages` | Messages now have metadata |
| `ChatHistory.loadChat()` | `SessionManager.getRecentMessages()` | Returns filtered messages |
| `ChatHistory.saveChat()` | `SessionManager.addMessage()` | Auto-saves on add |
| `DevAgentSession.messages` | `ChatSession.messages` | Unified format |
| `DevAgentSession.direction` | `ChatMessage.metadata.internal` | Direction removed |
| Manual token counting | `SessionManager.previewRequest()` | Auto-calculated |

### Code Migration Examples

#### Migrating PM Chat

**Before (old ChatHistory):**
```typescript
// Old API
import { loadChatHistory, saveChatHistory } from './storage'

async function handlePMChat(featureId: string, userMessage: string) {
  // Load existing chat
  const history = await loadChatHistory(featureId)

  // Add user message
  history.entries.push({
    type: 'user',
    text: userMessage,
    timestamp: new Date().toISOString()
  })

  // Get AI response
  const response = await pmAgent.query(userMessage)

  // Add assistant message
  history.entries.push({
    type: 'assistant',
    text: response,
    timestamp: new Date().toISOString()
  })

  // Save
  await saveChatHistory(featureId, history)
}
```

**After (new SessionManager):**
```typescript
// New API
import { getSessionManager } from './session-manager'

async function handlePMChat(featureId: string, userMessage: string) {
  const sessionManager = getSessionManager()

  // Get or create session
  const session = await sessionManager.getOrCreateSession({
    type: 'feature',
    agentType: 'pm',
    featureId
  })

  // Add user message (auto-saves)
  await sessionManager.addMessage(session.id, featureId, {
    role: 'user',
    content: userMessage
  })

  // Build request (includes context, checkpoint, etc.)
  const request = await sessionManager.buildRequest(
    session.id,
    featureId,
    userMessage
  )

  // Get AI response
  const response = await agentService.streamQuery({
    prompt: request.userPrompt,
    systemPrompt: request.systemPrompt
  })

  // Add assistant message (auto-saves)
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

#### Migrating Dev Agent Sessions

**Before (old DevAgentSession):**
```typescript
// Old API
const session: DevAgentSession = {
  taskId: 'task-123',
  agentId: 'dev-abc',
  status: 'active',
  messages: [
    {
      direction: 'outgoing',
      type: 'progress',
      content: 'Starting implementation...',
      timestamp: Date.now()
    }
  ]
}

await saveDevSession(featureId, taskId, session)
```

**After (new SessionManager):**
```typescript
// New API
const sessionManager = getSessionManager()

const session = await sessionManager.getOrCreateSession({
  type: 'task',
  agentType: 'dev',
  featureId,
  taskId: 'task-123',
  taskState: 'in_dev'
})

await sessionManager.addMessage(session.id, featureId, {
  role: 'assistant',
  content: 'Starting implementation...',
  metadata: {
    agentType: 'dev',
    agentId: 'dev-abc',
    taskId: 'task-123',
    internal: true  // Internal progress message
  }
})
```

### Deprecation Timeline

| Phase | Timeline | Changes |
|-------|----------|---------|
| **Phase 1** | v3.0 | SessionManager introduced, old APIs still work |
| **Phase 2** | v3.1 | Old APIs emit deprecation warnings |
| **Phase 3** | v4.0 | Old APIs removed |

### Common Migration Issues

#### Issue: Missing Session Context

**Problem:** Old code doesn't set up context.

**Solution:** Always update context before building requests:
```typescript
await sessionManager.updateContext(sessionId, featureId, {
  projectRoot,
  featureId,
  featureName: feature.name,
  featureGoal: feature.description,
  // ... other context
})
```

#### Issue: Token Count Differences

**Problem:** Token estimates differ from old calculations.

**Solution:** The new system uses consistent 4-char/token approximation:
```typescript
// Check estimates
const preview = await sessionManager.previewRequest(sessionId, featureId)
console.log('Breakdown:', preview.breakdown)
```

#### Issue: Internal Messages Visible

**Problem:** Debug messages showing in UI.

**Solution:** Mark internal messages properly:
```typescript
await sessionManager.addMessage(sessionId, featureId, {
  role: 'assistant',
  content: 'Debug info...',
  metadata: {
    internal: true  // Won't appear in getRecentMessages()
  }
})
```

---

## Related Documentation

- [Session Architecture](./session-architecture.md) - System design overview
- [Compaction Guide](./compaction-guide.md) - Checkpoint compression details
