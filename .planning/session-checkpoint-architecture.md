# Session & Checkpoint Architecture

## Core Concept

Every agent request is structured as:

```
System Prompt:
  <Agent Description>      (role, capabilities, instructions)
  <Context>                (project structure, CLAUDE.md, feature/task info)
  <Checkpoint Data>        (things done, things still to do)
  <Last N Chat Messages>   (recent conversation for continuity)

User Prompt:
  <Last User Message>      (current request)
```

**Token Budget**: Entire request must be < 100k tokens

**Automatic Compaction**: When exceeding budget:
1. Send compaction request to Claude
2. Input: old checkpoint + last N messages
3. Output: updated checkpoint + 0 messages
4. Save new checkpoint, clear messages

---

## Storage Structure

### Feature Worktree

```
.dagent-worktrees/{featureId}/.dagent/
├── feature.json                              # Feature metadata
│   └── sessionId: string                     # Active session ID
│
└── sessions/
    ├── chat_{sessionId}.json                 # Recent messages (last N)
    ├── checkpoint_{sessionId}.json           # Compacted history
    ├── context_{sessionId}.json              # Feature/project context
    └── agent-description_{sessionId}.json    # Agent role & instructions
```

### Task Worktree

```
.dagent-worktrees/{featureId}/.dagent/nodes/{taskId}/
├── task.json                                 # Task metadata with state tracking
│   ├── states:
│   │   ├── planning:
│   │   │   └── sessionIds: []                # Sessions for planning state
│   │   ├── in_dev:
│   │   │   └── sessionIds: []                # Sessions for dev state
│   │   ├── in_qa:
│   │   │   └── sessionIds: []                # Sessions for QA state
│   │   └── ...
│   └── currentState: string                  # Current state key
│
└── sessions/
    ├── chat_{sessionId}.json
    ├── checkpoint_{sessionId}.json
    ├── context_{sessionId}.json
    └── agent-description_{sessionId}.json
```

---

## File Formats

### 1. chat_{sessionId}.json

```typescript
interface ChatSession {
  sessionId: string
  messages: ChatMessage[]
  metadata: {
    createdAt: string
    updatedAt: string
    messageCount: number
    tokenCount: number        // Approximate tokens in messages
  }
}

interface ChatMessage {
  id: string
  timestamp: string
  role: 'user' | 'assistant'
  content: string
  tokens?: number             // Approximate tokens for this message
}
```

### 2. checkpoint_{sessionId}.json

```typescript
interface Checkpoint {
  sessionId: string
  version: number               // Increments on each compaction
  createdAt: string
  updatedAt: string

  // Compacted summary of work
  summary: {
    completedItems: string[]    // What has been done
    pendingItems: string[]      // What still needs to be done
    decisions: string[]         // Key decisions made
    blockers: string[]          // Current blockers/issues
  }

  // For task sessions: Ralph Loop specific
  ralphLoop?: {
    currentIteration: number
    passedChecks: string[]      // build, lint, test
    failedChecks: string[]
    lastError?: string
  }

  // Token accounting
  tokens: {
    checkpoint: number          // Tokens in this checkpoint
    lastCompactionInput: number // Tokens before last compaction
    totalSaved: number          // Cumulative tokens saved by compaction
  }
}
```

### 3. context_{sessionId}.json

```typescript
interface SessionContext {
  sessionId: string
  type: 'pm-feature' | 'dev-task' | 'qa-task' | 'harness' | 'merge'

  // References
  featureId: string
  taskId?: string

  // Project context (rarely changes)
  project: {
    structure: ProjectStructure
    claudeMd?: string
    projectMd?: string
    recentCommits: GitCommit[]
  }

  // Feature context (changes when spec/tasks update)
  feature?: {
    name: string
    spec?: string               // Feature spec content
    tasks: TaskSummary[]
  }

  // Task context (for task-specific sessions)
  task?: {
    title: string
    description: string
    dependencies: TaskDependencyInfo[]
    dependents: TaskDependencyInfo[]
  }

  // Cached at creation, updated when context changes
  updatedAt: string
  tokens: number                // Approximate tokens in this context
}
```

### 4. agent-description_{sessionId}.json

```typescript
interface AgentDescription {
  sessionId: string
  agentType: 'pm' | 'dev' | 'qa' | 'harness' | 'merge'

  // Role-specific instructions
  role: string                  // From prompt-builders.ts
  instructions: string[]        // Specific to agent type

  // Tool configuration
  allowedTools: string[]
  toolInstructions?: string     // How to use tools

  // Cached at session creation, rarely changes
  createdAt: string
  tokens: number                // Approximate tokens in this description
}
```

---

## SessionManager API

```typescript
class SessionManager {
  private projectRoot: string
  private tokenEstimator: TokenEstimator

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
    this.tokenEstimator = new TokenEstimator()
  }

  // ============================================
  // Session Lifecycle
  // ============================================

  /**
   * Create a new session for a context.
   */
  async createSession(
    type: SessionType,
    featureId: string,
    taskId?: string,
    agentType?: AgentType
  ): Promise<string> {
    const sessionId = crypto.randomUUID()

    // Initialize all session files
    await this.initChatSession(sessionId)
    await this.initCheckpoint(sessionId)
    await this.initContext(sessionId, type, featureId, taskId)
    await this.initAgentDescription(sessionId, agentType || this.inferAgentType(type))

    // Link session to feature/task
    if (taskId) {
      await this.linkTaskSession(featureId, taskId, sessionId)
    } else {
      await this.linkFeatureSession(featureId, sessionId)
    }

    return sessionId
  }

  /**
   * Get or create session for a context.
   * Uses existing active session if available.
   */
  async getOrCreateSession(
    type: SessionType,
    featureId: string,
    taskId?: string,
    state?: string  // For task sessions: which state (planning, in_dev, etc.)
  ): Promise<string> {
    // Try to get existing active session
    const existing = await this.getActiveSession(featureId, taskId, state)
    if (existing) return existing

    // Create new session
    return this.createSession(type, featureId, taskId)
  }

  // ============================================
  // Message Operations
  // ============================================

  /**
   * Add a message to the session.
   * Triggers compaction check after adding.
   */
  async addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    const chat = await this.loadChatSession(sessionId)

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      role,
      content,
      tokens: this.tokenEstimator.estimate(content)
    }

    chat.messages.push(message)
    chat.metadata.messageCount++
    chat.metadata.tokenCount += message.tokens || 0
    chat.metadata.updatedAt = new Date().toISOString()

    await this.saveChatSession(sessionId, chat)

    // Check if compaction needed (NOT during compaction itself)
    if (!this.isCompactionRequest(content)) {
      await this.checkAndCompact(sessionId)
    }
  }

  /**
   * Check if total request size exceeds limit and compact if needed.
   */
  private async checkAndCompact(sessionId: string): Promise<void> {
    const totalTokens = await this.estimateRequestSize(sessionId)

    if (totalTokens > 100000) {
      console.log(`[SessionManager] Session ${sessionId} exceeds 100k tokens (${totalTokens}), compacting...`)
      await this.compact(sessionId)
    }
  }

  /**
   * Estimate total request size in tokens.
   */
  private async estimateRequestSize(sessionId: string): Promise<number> {
    const [agentDesc, context, checkpoint, chat] = await Promise.all([
      this.loadAgentDescription(sessionId),
      this.loadContext(sessionId),
      this.loadCheckpoint(sessionId),
      this.loadChatSession(sessionId)
    ])

    return (
      agentDesc.tokens +
      context.tokens +
      checkpoint.tokens.checkpoint +
      chat.metadata.tokenCount +
      1000  // Buffer for user prompt
    )
  }

  /**
   * Compact session by creating new checkpoint from old checkpoint + messages.
   * Clears messages after compaction.
   */
  private async compact(sessionId: string): Promise<void> {
    const [checkpoint, chat, agentDesc] = await Promise.all([
      this.loadCheckpoint(sessionId),
      this.loadChatSession(sessionId),
      this.loadAgentDescription(sessionId)
    ])

    // Build compaction prompt
    const compactionPrompt = this.buildCompactionPrompt(checkpoint, chat)

    // Send to Claude for compaction (separate agent request)
    const agentService = getAgentService()
    let newCheckpointContent = ''

    for await (const event of agentService.streamQuery({
      prompt: compactionPrompt,
      systemPrompt: `You are a session compaction agent. Your job is to summarize conversation history into a structured checkpoint.

Output format (JSON):
{
  "completedItems": ["item 1", "item 2"],
  "pendingItems": ["item 1", "item 2"],
  "decisions": ["decision 1", "decision 2"],
  "blockers": ["blocker 1", "blocker 2"]
}`,
      agentType: 'compaction',
      permissionMode: 'reject'  // No tools needed for compaction
    })) {
      if (event.type === 'message' && event.message?.type === 'assistant') {
        newCheckpointContent = event.message.content
      }
    }

    // Parse compaction result
    const newSummary = this.parseCompactionResult(newCheckpointContent)

    // Update checkpoint
    const newCheckpoint: Checkpoint = {
      ...checkpoint,
      version: checkpoint.version + 1,
      updatedAt: new Date().toISOString(),
      summary: newSummary,
      tokens: {
        checkpoint: this.tokenEstimator.estimate(JSON.stringify(newSummary)),
        lastCompactionInput: checkpoint.tokens.checkpoint + chat.metadata.tokenCount,
        totalSaved: checkpoint.tokens.totalSaved + chat.metadata.tokenCount
      }
    }

    // Clear messages
    const clearedChat: ChatSession = {
      ...chat,
      messages: [],
      metadata: {
        ...chat.metadata,
        messageCount: 0,
        tokenCount: 0,
        updatedAt: new Date().toISOString()
      }
    }

    // Save
    await Promise.all([
      this.saveCheckpoint(sessionId, newCheckpoint),
      this.saveChatSession(sessionId, clearedChat)
    ])

    console.log(`[SessionManager] Compacted session ${sessionId}: v${newCheckpoint.version}, saved ${chat.metadata.tokenCount} tokens`)
  }

  /**
   * Build the prompt for compaction request.
   */
  private buildCompactionPrompt(checkpoint: Checkpoint, chat: ChatSession): string {
    const parts: string[] = []

    parts.push('# Current Checkpoint\n')
    parts.push('## Completed Items:')
    checkpoint.summary.completedItems.forEach(item => parts.push(`- ${item}`))
    parts.push('\n## Pending Items:')
    checkpoint.summary.pendingItems.forEach(item => parts.push(`- ${item}`))
    parts.push('\n## Decisions Made:')
    checkpoint.summary.decisions.forEach(item => parts.push(`- ${item}`))
    parts.push('\n## Current Blockers:')
    checkpoint.summary.blockers.forEach(item => parts.push(`- ${item}`))

    parts.push('\n\n# Recent Conversation\n')
    chat.messages.forEach(msg => {
      parts.push(`**${msg.role === 'user' ? 'User' : 'Assistant'}**: ${msg.content}\n`)
    })

    parts.push('\n\nPlease update the checkpoint with information from the recent conversation.')

    return parts.join('\n')
  }

  // ============================================
  // Request Building
  // ============================================

  /**
   * Build complete request for agent interaction.
   * Returns: {systemPrompt, userPrompt, totalTokens}
   */
  async buildRequest(
    sessionId: string,
    userMessage: string
  ): Promise<{
    systemPrompt: string
    userPrompt: string
    totalTokens: number
  }> {
    const [agentDesc, context, checkpoint, chat] = await Promise.all([
      this.loadAgentDescription(sessionId),
      this.loadContext(sessionId),
      this.loadCheckpoint(sessionId),
      this.loadChatSession(sessionId)
    ])

    // Build system prompt
    const systemParts: string[] = []

    // 1. Agent Description
    systemParts.push('# Your Role\n')
    systemParts.push(agentDesc.role)
    systemParts.push('\n')
    if (agentDesc.instructions.length > 0) {
      systemParts.push('## Instructions\n')
      agentDesc.instructions.forEach(inst => systemParts.push(`- ${inst}`))
      systemParts.push('\n')
    }

    // 2. Context
    systemParts.push('# Context\n')
    systemParts.push(this.formatContext(context))
    systemParts.push('\n')

    // 3. Checkpoint Data
    systemParts.push('# Checkpoint (Work Progress)\n')
    systemParts.push('## Completed:\n')
    checkpoint.summary.completedItems.forEach(item => systemParts.push(`- ${item}`))
    systemParts.push('\n## Still To Do:\n')
    checkpoint.summary.pendingItems.forEach(item => systemParts.push(`- ${item}`))
    if (checkpoint.summary.decisions.length > 0) {
      systemParts.push('\n## Key Decisions:\n')
      checkpoint.summary.decisions.forEach(item => systemParts.push(`- ${item}`))
    }
    if (checkpoint.summary.blockers.length > 0) {
      systemParts.push('\n## Current Blockers:\n')
      checkpoint.summary.blockers.forEach(item => systemParts.push(`- ${item}`))
    }
    systemParts.push('\n')

    // 4. Recent Messages
    if (chat.messages.length > 0) {
      systemParts.push('# Recent Conversation\n')
      chat.messages.forEach(msg => {
        systemParts.push(`**${msg.role === 'user' ? 'User' : 'Assistant'}**: ${msg.content}\n`)
      })
      systemParts.push('\n')
    }

    const systemPrompt = systemParts.join('')
    const userPrompt = userMessage

    const totalTokens = this.tokenEstimator.estimate(systemPrompt + userPrompt)

    return {
      systemPrompt,
      userPrompt,
      totalTokens
    }
  }

  // ============================================
  // Persistence (private helpers)
  // ============================================

  private async loadChatSession(sessionId: string): Promise<ChatSession> {
    const path = this.getChatPath(sessionId)
    const data = await fs.readFile(path, 'utf-8')
    return JSON.parse(data)
  }

  private async saveChatSession(sessionId: string, chat: ChatSession): Promise<void> {
    const path = this.getChatPath(sessionId)
    await fs.writeFile(path, JSON.stringify(chat, null, 2))
  }

  private async loadCheckpoint(sessionId: string): Promise<Checkpoint> {
    const path = this.getCheckpointPath(sessionId)
    const data = await fs.readFile(path, 'utf-8')
    return JSON.parse(data)
  }

  private async saveCheckpoint(sessionId: string, checkpoint: Checkpoint): Promise<void> {
    const path = this.getCheckpointPath(sessionId)
    await fs.writeFile(path, JSON.stringify(checkpoint, null, 2))
  }

  private async loadContext(sessionId: string): Promise<SessionContext> {
    const path = this.getContextPath(sessionId)
    const data = await fs.readFile(path, 'utf-8')
    return JSON.parse(data)
  }

  private async loadAgentDescription(sessionId: string): Promise<AgentDescription> {
    const path = this.getAgentDescPath(sessionId)
    const data = await fs.readFile(path, 'utf-8')
    return JSON.parse(data)
  }

  // Path helpers
  private getChatPath(sessionId: string): string {
    // Parse sessionId or use mapping to find featureId/taskId
    return path.join(this.getSessionDir(sessionId), `chat_${sessionId}.json`)
  }

  private getCheckpointPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), `checkpoint_${sessionId}.json`)
  }

  private getContextPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), `context_${sessionId}.json`)
  }

  private getAgentDescPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), `agent-description_${sessionId}.json`)
  }

  private getSessionDir(sessionId: string): string {
    // You'll need a mapping from sessionId to featureId/taskId
    // Or embed in sessionId format: {featureId}_{taskId?}_{uuid}
    // For now, simplified:
    // TODO: Implement proper sessionId -> path mapping
    return path.join(this.projectRoot, '.dagent-worktrees', 'TODO', '.dagent', 'sessions')
  }
}
```

---

## Integration Flow

### PM Agent Interactive Chat

```typescript
// User sends message in DAG view chat
async function handleUserMessage(featureId: string, message: string) {
  const sessionMgr = getSessionManager()

  // Get or create session
  const sessionId = await sessionMgr.getOrCreateSession('pm-feature', featureId)

  // Add user message (triggers compaction check)
  await sessionMgr.addMessage(sessionId, 'user', message)

  // Build request
  const { systemPrompt, userPrompt, totalTokens } = await sessionMgr.buildRequest(
    sessionId,
    message
  )

  console.log(`[PM Chat] Request size: ${totalTokens} tokens`)

  // Send to agent
  const agentService = getAgentService()
  for await (const event of agentService.streamQuery({
    prompt: userPrompt,
    systemPrompt,
    agentType: 'pm',
    toolPreset: 'pmAgent',
    featureId,
    permissionMode: 'acceptEdits'
  })) {
    // Stream to UI...

    // When done, save assistant response
    if (event.type === 'message' && event.message?.type === 'assistant') {
      await sessionMgr.addMessage(sessionId, 'assistant', event.message.content)
    }
  }
}
```

### Dev Agent Ralph Loop (Iteration)

```typescript
async function runDevAgentIteration(featureId: string, taskId: string, iteration: number) {
  const sessionMgr = getSessionManager()

  // Get session for current task state
  const sessionId = await sessionMgr.getOrCreateSession(
    'dev-task',
    featureId,
    taskId,
    'in_dev'  // Current state
  )

  // Build iteration prompt
  const iterationPrompt = buildIterationPrompt(failingChecks)

  // Add as user message
  await sessionMgr.addMessage(sessionId, 'user', `Iteration ${iteration}: ${iterationPrompt}`)

  // Build request
  const { systemPrompt, userPrompt, totalTokens } = await sessionMgr.buildRequest(
    sessionId,
    iterationPrompt
  )

  // Execute dev agent...
  // Save assistant response when done
}
```

---

## Benefits

### 1. **Automatic Token Management**
- Never exceed 100k token limit
- Automatic compaction when needed
- Full history preserved in checkpoints

### 2. **Consistent Structure**
- All agents use same request format
- Predictable system prompt composition
- Easy to debug/inspect requests

### 3. **Efficient Context**
- Only recent messages sent
- Checkpoint provides historical context
- No redundant information

### 4. **State Tracking**
- Tasks can have multiple sessions per state
- Clear audit trail of work progression
- Easy to resume from any point

### 5. **Cost Optimization**
- Fewer tokens = lower cost
- Compaction reduces redundancy
- Smart context window management

---

## Implementation Priority

1. **Core SessionManager** with file I/O
2. **TokenEstimator** utility (tiktoken library)
3. **Compaction agent** logic
4. **Integration with PM agent** (proof of concept)
5. **Integration with Dev agent** (Ralph Loop)
6. **UI updates** to show checkpoint state
7. **Migration** from old chat.json format

---

## Open Questions

1. **Compaction Frequency**: Every N messages instead of token-based?
2. **Session ID Format**: Embed context in ID or use separate mapping?
3. **Multi-Agent Sessions**: Should QA agent see Dev agent checkpoint?
4. **Checkpoint Versioning**: Keep history of checkpoints or only current?
5. **Context Refresh**: When to re-fetch project context (spec changes, etc.)?
