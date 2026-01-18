# Compaction Guide

This guide explains the automatic checkpoint compression system that manages context window limits in the dagent session management system.

## What is Compaction?

### The Problem: Context Window Limits

Large Language Models (LLMs) like Claude have a limited context window - the maximum amount of text they can process in a single request. For Claude, this limit is approximately **100,000 tokens** (about 400,000 characters).

In a conversation that spans multiple sessions or involves complex tasks, the combined size of:
- Agent instructions
- Project context
- Checkpoint summary
- Message history
- User's new message

...can easily exceed this limit, causing the request to fail.

### The Solution: Automatic Checkpoint Compression

**Compaction** solves this by automatically compressing older messages into a structured checkpoint summary. Instead of keeping every message in full, the system:

1. Monitors the total token count of each request
2. When approaching the limit, triggers compaction
3. Uses Claude to analyze messages and create a summary
4. Replaces old messages with the checkpoint
5. Continues the conversation with context preserved

### Compaction Threshold

Compaction is triggered at **90% of the 100k token limit** (90,000 tokens). This threshold provides:

- **Buffer room** for the response (Claude needs space to generate output)
- **Safety margin** against token estimation errors
- **Proactive compression** before hitting hard limits

```
TOKEN_LIMIT = 100,000 tokens
COMPACTION_THRESHOLD = 90,000 tokens (90%)
```

## How Compaction Works

### Token Estimation Process

The system estimates tokens using a conservative approximation:

```typescript
// ~4 characters per token (slightly overestimates for safety)
const CHARS_PER_TOKEN = 4

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}
```

Token estimation includes all request components:

| Component | Typical Size |
|-----------|--------------|
| Agent Description | 500-2,000 tokens |
| Project Context | 2,000-10,000 tokens |
| Checkpoint | 500-2,000 tokens |
| Messages | 0-80,000 tokens |
| User Prompt | 100-1,000 tokens |

### Checkpoint Generation Using Claude SDK

When compaction triggers, the system:

1. **Builds a compaction prompt** with:
   - Current checkpoint (if any)
   - All messages to be compacted
   - Instructions for creating the summary

2. **Sends to Claude** via the Agent SDK:
   ```typescript
   const stream = agentService.streamQuery({
     prompt: compactionPrompt,
     cwd: projectRoot,
     allowedTools: [],  // No tools needed
     permissionMode: 'bypassPermissions'
   })
   ```

3. **Parses the JSON response** into the checkpoint structure:
   ```json
   {
     "completed": ["task 1", "task 2"],
     "inProgress": ["task 3"],
     "pending": ["task 4", "task 5"],
     "blockers": [],
     "decisions": ["chose approach A over B"]
   }
   ```

### Message History Compression

After successful compaction:

1. **Old checkpoint** is replaced with the new one
2. **Messages are cleared** from the chat session
3. **Stats are updated**:
   - `totalCompactions` increments
   - `totalMessages` tracks compacted count
   - `totalTokens` tracks reclaimed tokens
4. **Events are broadcast** to update UI

### What's Preserved vs Summarized

| Preserved (Full) | Summarized |
|-----------------|------------|
| Most recent messages | Older message content |
| Key decisions | Routine exchanges |
| Blockers and issues | Implementation details |
| Action items | Exploratory discussions |
| Critical context | Repetitive clarifications |

The checkpoint captures the **essential state** of the conversation:
- What has been accomplished
- What is currently being worked on
- What remains to be done
- Any blocking issues
- Important decisions made

## Configuration

### MAX_CONTEXT_TOKENS Setting

The maximum token limit is defined in `token-estimator.ts`:

```typescript
export const TOKEN_LIMIT = 100_000  // 100k tokens
```

This matches Claude's context window. Future models with larger windows could increase this limit.

### Compaction Threshold (90%)

The threshold is set conservatively at 90%:

```typescript
const COMPACTION_THRESHOLD = 90_000  // 90k tokens
```

This provides a 10k token buffer for:
- Response generation
- Token estimation errors
- Formatting overhead

### Force Compaction Option

Manual compaction can be triggered:

```typescript
// Via SessionManager
await sessionManager.forceCompact(sessionId, featureId)

// Via IPC from renderer
await window.api.session.forceCompact(sessionId, featureId)
```

Use cases for manual compaction:
- Before starting a complex task
- When checkpoint feels outdated
- To reclaim tokens for a large operation
- Testing and debugging

## Troubleshooting

### When Compaction Doesn't Trigger

**Problem:** Messages keep accumulating but compaction never happens.

**Possible causes:**
1. **Token count below threshold**: Request is under 90k tokens
2. **Missing context**: Context or agent description not set
3. **Session not found**: Invalid session ID or feature ID

**Solutions:**
```typescript
// Check request size
const preview = await sessionManager.previewRequest(sessionId, featureId)
console.log('Total tokens:', preview.breakdown.total)

// Force compaction if needed
await sessionManager.forceCompact(sessionId, featureId)
```

### Token Estimation Accuracy

**Problem:** Compaction triggers too early or too late.

**Understanding the estimate:**
- Uses 4 chars/token approximation
- Intentionally overestimates for safety
- Actual token count may vary by 10-20%

**Checking estimation:**
```typescript
const preview = await sessionManager.previewRequest(sessionId, featureId)
console.log('Breakdown:', preview.breakdown)
// {
//   agentDescTokens: 1500,
//   contextTokens: 5000,
//   checkpointTokens: 800,
//   messagesTokens: 82000,
//   userPromptTokens: 200,
//   total: 89500
// }
```

### Checkpoint Quality Issues

**Problem:** Checkpoint summary is missing important information.

**Possible causes:**
1. **Too many messages at once**: Large batch loses details
2. **Unclear conversation**: Vague messages produce vague summaries
3. **Parse errors**: Response wasn't valid JSON

**Solutions:**
1. Trigger compaction more frequently (lower threshold)
2. Use clear, structured messages in conversations
3. Check console for compaction errors

**Reviewing checkpoint:**
```typescript
const checkpoint = await sessionManager.getCheckpoint(sessionId, featureId)
console.log('Completed:', checkpoint.summary.completed)
console.log('In Progress:', checkpoint.summary.inProgress)
console.log('Pending:', checkpoint.summary.pending)
console.log('Decisions:', checkpoint.summary.decisions)
```

### Compaction Errors

**Problem:** Compaction fails with an error.

**Common errors:**
1. **Empty response**: Claude returned no content
2. **Invalid JSON**: Response wasn't parseable
3. **Missing fields**: JSON structure incomplete

**Error handling:**
The system handles errors gracefully:
- Broadcasts `session:compaction-error` event
- Logs error to console
- Does NOT throw or crash
- Allows manual retry later

**Recovery:**
```typescript
// Retry manual compaction
await sessionManager.forceCompact(sessionId, featureId)

// Or clear messages and start fresh
await sessionManager.clearMessages(sessionId, featureId)
```

## Best Practices

### Message Size Guidelines

| Message Type | Recommended Size |
|--------------|-----------------|
| User request | 100-500 tokens |
| Agent response | 500-2,000 tokens |
| Tool results | 200-1,000 tokens |
| Context snippets | 1,000-5,000 tokens |

**Tips:**
- Keep messages focused and concise
- Break large tasks into smaller conversations
- Include only relevant context

### When to Force Compaction

**Force compaction when:**
- Starting a major new task
- Checkpoint seems stale or incorrect
- Request preview shows high token count
- Before operations that need response space

**Don't force compaction when:**
- Actively in the middle of a task
- Few messages since last compaction
- Token count is well under threshold

### Monitoring Compaction Metrics

The UI provides visibility into compaction:

**SessionStatus component shows:**
- Total token estimate
- Checkpoint version
- Compaction count
- Warning when approaching limit

**CheckpointViewer shows:**
- Completed items
- In-progress items
- Pending items
- Blockers
- Key decisions

**Compaction events:**
```typescript
// Subscribe to compaction events
window.api.session.onCompactionStart((data) => {
  console.log('Compacting', data.messagesCount, 'messages')
  console.log('Estimated tokens:', data.estimatedTokens)
})

window.api.session.onCompactionComplete((data) => {
  console.log('Compacted', data.messagesCompacted, 'messages')
  console.log('Tokens reclaimed:', data.tokensReclaimed)
  console.log('New checkpoint version:', data.newCheckpointVersion)
})

window.api.session.onCompactionError((data) => {
  console.error('Compaction failed:', data.error)
})
```

## Implementation Details

### Compaction Prompt Template

The compaction prompt instructs Claude to:
1. Review existing checkpoint (if any)
2. Analyze new messages
3. Create updated summary in specific JSON format
4. Move items between categories as appropriate
5. Maintain chronological order
6. Remove resolved items

### Checkpoint Summary Structure

```typescript
interface CheckpointSummary {
  completed: string[]   // Done items
  inProgress: string[]  // Active items
  pending: string[]     // Waiting items
  blockers: string[]    // Issues
  decisions: string[]   // Key choices made
}
```

### Token Reclamation Estimates

Typical compaction results:
- **70-80% reduction** in message tokens
- **Checkpoint grows by 20-30%** of original size
- **Net savings of 50-60%** of original tokens

Example:
- Before: 80,000 tokens (messages) + 500 tokens (checkpoint)
- After: 0 tokens (messages) + 2,000 tokens (checkpoint)
- Reclaimed: ~78,500 tokens

## Related Documentation

- [Session Architecture](./session-architecture.md) - Overall system design
- [API Reference](./api-reference.md) - SessionManager API documentation
