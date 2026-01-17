# Centralized Conversation Architecture

## Problem Statement

Currently, we have fragmented conversation management:
- **PM Planning**: Saves full system prompt as user message in `chat.json`
- **PM Interactive**: Concatenates all messages into a single prompt string
- **Dev Agent (Ralph Loop)**: Appends to `session.json` but doesn't use it for context
- **No unified session lifecycle**: No clear create/load/save/reset flow

We need a centralized system that works like Ralph Loop:
- **Persistent audit trail** (full conversation saved)
- **Fresh context per interaction** (no bloat)
- **Centralized session management** (one source of truth)

---

## Core Principles (Inspired by Ralph Loop)

### 1. **Separation of Concerns**

```
Session Storage (audit trail)     ≠     Agent Context (what gets sent to Claude)
    ↓                                          ↓
  Full history for UI/logs              Focused, recent context only
```

### 2. **Fresh Context Per Interaction**

Each agent interaction should:
- Load only relevant recent messages (e.g., last 5-10 turns)
- Include system prompt with current state
- NOT send entire conversation history

### 3. **Centralized Session Manager**

Single service that handles ALL conversation storage/retrieval across all agent types.

---

## Architecture Design

### 1. Core Types

```typescript
// Unified message type for ALL agents
interface ConversationMessage {
  id: string                          // Unique message ID
  timestamp: string                   // ISO timestamp
  role: 'user' | 'assistant' | 'system'
  content: string

  // Optional metadata
  metadata?: {
    agentType?: 'pm' | 'dev' | 'qa' | 'merge' | 'harness'
    taskId?: string                   // For task-specific messages
    featureId?: string                // For feature-specific messages
    iteration?: number                // For Ralph Loop iterations
    toolUse?: {
      name: string
      input?: unknown
      result?: unknown
    }
    internal?: boolean                // Don't show in user-facing chat
    tokens?: {
      input: number
      output: number
    }
  }
}

// Session = collection of messages for a specific context
interface ConversationSession {
  id: string                          // Session ID (e.g., "pm-feature-test14")
  type: 'pm-feature' | 'dev-task' | 'qa-task' | 'merge' | 'harness'

  // Context references
  featureId: string
  taskId?: string                     // Optional for task-specific sessions

  // Lifecycle
  createdAt: string
  updatedAt: string
  status: 'active' | 'archived'

  // Messages
  messages: ConversationMessage[]

  // Statistics
  stats: {
    totalMessages: number
    totalTokens: number
  }
}
```

### 2. ConversationManager Service

**Location**: `src/main/services/conversation-manager.ts`

```typescript
class ConversationManager {
  private activeSessions: Map<string, ConversationSession> = new Map()
  private projectRoot: string

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
  }

  // ============================================
  // Session Lifecycle
  // ============================================

  /**
   * Get or create a session for a specific context.
   * Uses consistent ID format: "{type}-{featureId}-{taskId?}"
   */
  async getOrCreateSession(
    type: SessionType,
    featureId: string,
    taskId?: string
  ): Promise<ConversationSession> {
    const sessionId = this.buildSessionId(type, featureId, taskId)

    // Check in-memory cache
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!
    }

    // Try to load from disk
    const loaded = await this.loadSession(sessionId)
    if (loaded) {
      this.activeSessions.set(sessionId, loaded)
      return loaded
    }

    // Create new session
    const session: ConversationSession = {
      id: sessionId,
      type,
      featureId,
      taskId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      messages: [],
      stats: { totalMessages: 0, totalTokens: 0 }
    }

    this.activeSessions.set(sessionId, session)
    await this.saveSession(session)
    return session
  }

  /**
   * Build consistent session ID from context.
   */
  private buildSessionId(
    type: SessionType,
    featureId: string,
    taskId?: string
  ): string {
    if (taskId) {
      return `${type}-${featureId}-${taskId}`
    }
    return `${type}-${featureId}`
  }

  // ============================================
  // Message Operations
  // ============================================

  /**
   * Add a message to a session.
   */
  async addMessage(
    sessionId: string,
    message: Omit<ConversationMessage, 'id' | 'timestamp'>
  ): Promise<ConversationMessage> {
    const session = await this.getSessionById(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const fullMessage: ConversationMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }

    session.messages.push(fullMessage)
    session.stats.totalMessages++
    session.updatedAt = new Date().toISOString()

    if (fullMessage.metadata?.tokens) {
      session.stats.totalTokens +=
        fullMessage.metadata.tokens.input +
        fullMessage.metadata.tokens.output
    }

    await this.saveSession(session)
    return fullMessage
  }

  /**
   * Get recent messages for agent context.
   * Returns ONLY recent, user-facing messages (excludes internal/system).
   * This is the Ralph Loop principle: fresh context, not full history.
   */
  getRecentContext(sessionId: string, limit: number = 10): ConversationMessage[] {
    const session = this.activeSessions.get(sessionId)
    if (!session) return []

    // Filter out internal messages and get recent ones
    return session.messages
      .filter(m => !m.metadata?.internal)
      .slice(-limit)
  }

  /**
   * Get ALL messages for display/logging (includes internal).
   */
  getAllMessages(sessionId: string): ConversationMessage[] {
    const session = this.activeSessions.get(sessionId)
    return session?.messages || []
  }

  /**
   * Get user-facing messages only (excludes internal).
   */
  getUserFacingMessages(sessionId: string): ConversationMessage[] {
    const session = this.activeSessions.get(sessionId)
    if (!session) return []

    return session.messages.filter(m => !m.metadata?.internal)
  }

  /**
   * Clear all messages from a session (useful for reset).
   */
  async clearMessages(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId)
    if (!session) return

    session.messages = []
    session.stats.totalMessages = 0
    session.stats.totalTokens = 0
    session.updatedAt = new Date().toISOString()

    await this.saveSession(session)
  }

  // ============================================
  // Persistence
  // ============================================

  /**
   * Save session to disk.
   * Location: .dagent-worktrees/{featureId}/.dagent/sessions/{sessionId}.json
   */
  private async saveSession(session: ConversationSession): Promise<void> {
    const sessionPath = this.getSessionPath(session)
    const sessionDir = path.dirname(sessionPath)

    await fs.mkdir(sessionDir, { recursive: true })
    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2))
  }

  /**
   * Load session from disk.
   */
  private async loadSession(sessionId: string): Promise<ConversationSession | null> {
    // Parse sessionId to extract featureId
    const parts = sessionId.split('-')
    const featureId = parts.slice(1, -1).join('-') || parts[1]

    const sessionPath = path.join(
      this.projectRoot,
      '.dagent-worktrees',
      featureId,
      '.dagent',
      'sessions',
      `${sessionId}.json`
    )

    try {
      const data = await fs.readFile(sessionPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  /**
   * Get file path for a session.
   */
  private getSessionPath(session: ConversationSession): string {
    return path.join(
      this.projectRoot,
      '.dagent-worktrees',
      session.featureId,
      '.dagent',
      'sessions',
      `${session.id}.json`
    )
  }

  /**
   * Archive a session when feature/task is completed.
   */
  async archiveSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId)
    if (!session) return

    session.status = 'archived'
    session.updatedAt = new Date().toISOString()

    await this.saveSession(session)
    this.activeSessions.delete(sessionId)
  }
}
```

### 3. Integration with Existing Agents

#### A. PM Agent (Planning Phase)

**Before**:
```typescript
// Saved full system prompt as user message
chatHistory.entries.push({
  role: 'user',
  content: prompt,  // Full system instructions
  timestamp: new Date().toISOString()
})
```

**After**:
```typescript
const conversationMgr = getConversationManager()
const session = await conversationMgr.getOrCreateSession('pm-feature', featureId)

// Add user-friendly message
await conversationMgr.addMessage(session.id, {
  role: 'user',
  content: `Plan feature: ${featureName}\n\n${description || ''}`,
  metadata: { agentType: 'pm', featureId }
})

// System prompt is NOT saved to session - it's internal
// Assistant responses ARE saved
for await (const event of agentService.streamQuery({...})) {
  if (event.message?.type === 'assistant') {
    await conversationMgr.addMessage(session.id, {
      role: 'assistant',
      content: event.message.content,
      metadata: { agentType: 'pm', featureId }
    })
  }
}
```

#### B. PM Agent (Interactive Chat)

**Before**:
```typescript
// Concatenated all messages into one string
const prompt = messages.map((m) =>
  `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
).join('\n\n')
```

**After**:
```typescript
const conversationMgr = getConversationManager()
const session = await conversationMgr.getOrCreateSession('pm-feature', featureId)

// Get recent context (last 10 messages)
const recentMessages = conversationMgr.getRecentContext(session.id, 10)

// Build proper Messages API format
const messages = recentMessages.map(m => ({
  role: m.role,
  content: m.content
}))

// Add new user message
await conversationMgr.addMessage(session.id, {
  role: 'user',
  content: userInput,
  metadata: { agentType: 'pm', featureId }
})

// Send to Claude with proper format
await sdk.query({
  prompt: messages,  // Array of {role, content}, NOT concatenated string
  systemPrompt: buildSystemPrompt(featureId)
})
```

#### C. Dev Agent (Ralph Loop)

**Before**:
```typescript
// Appended to session.json but didn't use for context
await store.appendSessionMessage(featureId, taskId, message)

// Each iteration got fresh prompt from TaskPlan
const prompt = this.buildIterationPrompt()
```

**After**:
```typescript
const conversationMgr = getConversationManager()
const session = await conversationMgr.getOrCreateSession('dev-task', featureId, taskId)

// Log to session (with iteration metadata)
await conversationMgr.addMessage(session.id, {
  role: 'assistant',
  content: agentResponse,
  metadata: {
    agentType: 'dev',
    featureId,
    taskId,
    iteration: currentIteration,
    internal: false  // User-facing messages
  }
})

// Each iteration still gets fresh prompt (Ralph Loop principle)
// But now we CAN access recent context if needed
const recentContext = conversationMgr.getRecentContext(session.id, 3)
```

### 4. Storage Structure

```
.dagent-worktrees/
└── {featureId}/
    └── .dagent/
        ├── sessions/
        │   ├── pm-feature-{featureId}.json          # PM planning + interactive
        │   ├── dev-task-{featureId}-{taskId}.json   # Dev agent per task
        │   ├── qa-task-{featureId}-{taskId}.json    # QA agent per task
        │   └── harness-{featureId}-{taskId}.json    # Harness agent per task
        ├── feature.json
        └── dag.json

# Migrate old files (deprecated):
# - chat.json → sessions/pm-feature-{featureId}.json
# - nodes/{taskId}/session.json → sessions/dev-task-{featureId}-{taskId}.json
```

### 5. UI Integration

#### Chat Store Updates

```typescript
// chat-store.ts
export const useChatStore = create<ChatState>((set, get) => ({
  // ...existing state

  loadChat: async (contextId: string, contextType: ChatContextType = 'feature') => {
    set({ isLoading: true, messages: [] })

    try {
      // Determine session type from context
      const sessionType = contextType === 'feature' ? 'pm-feature' : 'dev-task'

      // Load via ConversationManager
      const messages = await window.electronAPI.conversation.getUserFacingMessages(
        sessionType,
        contextId
      )

      set({ messages, isLoading: false })
    } catch (error) {
      console.error('Failed to load chat:', error)
      set({ messages: [], isLoading: false })
    }
  },

  sendToAgent: async () => {
    const { messages, currentFeatureId } = get()
    if (!currentFeatureId || messages.length === 0) return

    // Add user message to session
    const newMessage = messages[messages.length - 1]
    await window.electronAPI.conversation.addMessage('pm-feature', currentFeatureId, {
      role: 'user',
      content: newMessage.content
    })

    // Get recent context for agent
    const recentContext = await window.electronAPI.conversation.getRecentContext(
      'pm-feature',
      currentFeatureId,
      10  // Last 10 messages
    )

    // Send to agent with fresh system prompt
    await window.electronAPI.sdkAgent.query({
      messages: recentContext,
      systemPrompt: await buildSystemPrompt(currentFeatureId),
      toolPreset: 'pmAgent',
      // ...other options
    })
  }
}))
```

---

## Migration Plan

### Phase 1: Implement ConversationManager (non-breaking)
1. Create `ConversationManager` service
2. Add IPC handlers for conversation operations
3. Keep existing `chat.json` and `session.json` working

### Phase 2: Migrate PM Agent
1. Update `pm-agent-manager.ts` to use ConversationManager
2. Save sessionId to `feature.json` (optional reference)
3. Interactive chat loads via ConversationManager

### Phase 3: Migrate Dev Agent
1. Update `dev-agent.ts` to use ConversationManager
2. Migrate existing `session.json` files to new structure

### Phase 4: Update UI
1. Update `chat-store.ts` to use ConversationManager
2. Add session management UI (clear, archive, etc.)
3. Show session stats (message count, tokens)

### Phase 5: Deprecate Old System
1. Move old `chat.json` files to `sessions/`
2. Move old `nodes/{taskId}/session.json` to `sessions/`
3. Remove old storage code

---

## Benefits

### 1. **Consistent Session Management**
- All agents use same session storage
- Unified API for all conversation operations
- Single source of truth

### 2. **Ralph Loop Principle Applied Everywhere**
- Full history saved for audit
- Recent context sent to agents
- No context bloat

### 3. **Better Token Management**
- Track tokens per session
- Limit context window automatically
- Clear visibility into usage

### 4. **Improved UX**
- Clear session boundaries
- Ability to reset/clear conversations
- Session statistics visible in UI

### 5. **Migration Safe**
- Can coexist with current system
- Gradual migration per agent type
- No data loss during transition

---

## Open Questions

1. **Context Window Size**: Default to last 10 messages? Make configurable?
2. **Session Archival**: Auto-archive when feature completed? Manual only?
3. **Token Limits**: Enforce max tokens per session? Warn user?
4. **Session Sharing**: Should QA agent see Dev agent session? Or separate?
5. **Message Filtering**: Any other metadata flags needed beyond `internal`?
