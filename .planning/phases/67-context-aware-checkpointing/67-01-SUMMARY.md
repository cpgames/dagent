---
phase: 67-context-aware-checkpointing
plan: 01
status: complete
completed: 2026-01-15
commits:
  - hash: 50abcf9
    message: "feat(67): implement context-aware checkpointing for task loop"
---

# Summary: Context-Aware Checkpointing

## What Was Built

Replaced fixed `maxIterations: 10` limit with intelligent token-based checkpointing. The TaskController now tracks cumulative token usage across iterations and exits when approaching context limits (~150k tokens) rather than after an arbitrary iteration count.

## Key Changes

### 1. Token Usage Types (`src/main/agent/types.ts`, `src/main/agents/dev-types.ts`)

- Added `TokenUsage` interface to `AgentStreamEvent` for per-message SDK usage tracking
- Added `IterationTokenUsage` to `TaskExecutionResult` for per-iteration totals

### 2. SDK Token Extraction (`src/main/agent/agent-service.ts`)

- Added cumulative token tracking fields to AgentService
- Reset counters at start of each query
- Extract `input_tokens` and `output_tokens` from SDK messages
- Include cumulative totals in `done` event

### 3. TaskController Configuration (`src/main/dag-engine/task-controller-types.ts`)

- Added `useContextCheckpointing: boolean` (default: true)
- Added `contextTokenLimit: number` (default: 150000)
- Added `CumulativeTokenUsage` interface
- Added `cumulativeTokens` to `TaskControllerState`
- Added `'context_limit_reached'` to `LoopExitReason`
- Increased `maxIterations` default to 50 (safety backstop)

### 4. Context-Aware Loop (`src/main/dag-engine/task-controller.ts`)

- Initialize `cumulativeTokens` in state constructor
- `checkExitConditions()` checks context limit before iteration count
- Accumulate token usage after each iteration
- Include token usage in `iteration:complete` event
- Update `buildIterationSummary()` to include token counts

### 5. DevAgent Token Tracking (`src/main/agents/dev-agent.ts`)

- Track `cumulativeInputTokens` and `cumulativeOutputTokens` during stream
- Return `tokenUsage` in `TaskExecutionResult`
- Log token usage in stream completion message

## Token Flow

```
SDK Message (usage: {input_tokens, output_tokens})
    ↓
AgentService.convertMessage() → AgentStreamEvent.usage
    ↓
DevAgent.executeIteration() → TaskExecutionResult.tokenUsage
    ↓
TaskController.runIterationLoop() → state.cumulativeTokens
    ↓
TaskController.checkExitConditions() → 'context_limit_reached'
```

## Configuration

```typescript
DEFAULT_TASK_CONTROLLER_CONFIG = {
  maxIterations: 50,           // Safety backstop (was 10)
  contextTokenLimit: 150000,   // ~150k tokens soft limit
  useContextCheckpointing: true,
  // ... other options
}
```

## Benefits

1. **Intelligent checkpointing** - Tasks work until context fills up naturally
2. **No arbitrary limits** - Remove confusing "Loop 3/10" for users
3. **Flexibility** - Tasks can use as many iterations as needed
4. **Visibility** - Token usage tracked and visible in iteration summaries
5. **Safety backstop** - maxIterations=50 prevents runaway loops

## Verification

- [x] npm run typecheck passes
- [x] npm run build passes
- [x] TaskControllerConfig has contextTokenLimit field
- [x] TaskControllerState tracks cumulativeTokens
- [x] AgentService extracts usage from SDK messages
- [x] DevAgent.executeIteration returns tokenUsage
- [x] TaskController checks context limit in exit conditions
