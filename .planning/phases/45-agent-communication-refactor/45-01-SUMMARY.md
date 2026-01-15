---
phase: 45-agent-communication-refactor
plan: 01
title: Simplify Agent Communication
status: complete
completed: 2026-01-15
duration: ~5 min
---

# Summary

Simplified agent communication model by making MergeAgent fully autonomous (no harness calls).

## What Was Done

### Task 1: Remove Harness Notifications from MergeAgent

Removed all `getHarnessAgent()` imports and calls from MergeAgent:

**Changes to `src/main/agents/merge-agent.ts`:**

1. **Removed import**: `getHarnessAgent` from './harness-agent'

2. **Removed from `initialize()`**:
   - Was: `getHarnessAgent().markTaskMerging(this.state.taskId)`
   - Now: Comment explaining orchestrator handles state tracking

3. **Removed from `executeMerge()` success path**:
   - Was: `getHarnessAgent().completeTask(this.state.taskId)`
   - Now: Comment explaining orchestrator handles status transition

4. **Removed from `executeMerge()` failure paths** (2 locations):
   - Was: `getHarnessAgent().failTask(this.state.taskId, error)`
   - Now: Comment explaining orchestrator handles status transition

5. **Removed from `proposeIntention()`**:
   - Was: `getHarnessAgent().receiveIntention(agentId, taskId, intention)`
   - Now: Comment explaining orchestrator auto-approves via `receiveApproval()`

## Communication Model After Phase 45

| Agent | Talks to Harness? | Mechanism |
|-------|-------------------|-----------|
| Dev (TaskAgent) | Yes | MessageBus for intention approval workflow |
| QA (QAAgent) | No | Autonomous - returns QAReviewResult |
| Merge (MergeAgent) | No | Autonomous - emits events, orchestrator handles |
| PM | Yes | Human interaction channel |

## Why This Works

1. **Orchestrator is the coordinator**: It spawns agents and handles their results
2. **Events for visibility**: Agents emit events (e.g., `merge-agent:completed`) that orchestrator subscribes to
3. **Direct status updates**: Orchestrator updates task status via TaskPoolManager
4. **No redundant notifications**: Harness doesn't need to know about merge state - orchestrator handles it

## Files Changed

- **Modified**: `src/main/agents/merge-agent.ts` (-15 lines)
  - Removed harness import
  - Removed 5 harness method calls
  - Added comments explaining autonomous pattern

## Verification

- [x] `npm run build` succeeds without errors
- [x] MergeAgent no longer imports HarnessAgent
- [x] MergeAgent no longer calls any harness methods
- [x] Event emissions preserved for orchestrator integration
- [x] Orchestrator already handles merge results directly (no change needed)

## Phase 45 Complete

Agent Communication Refactor is complete. The communication model is now:
- **TaskAgent** → MessageBus → **HarnessAgent** (for intention approval)
- **QAAgent** → Returns result directly (autonomous)
- **MergeAgent** → Emits events, returns result (autonomous)
- **Orchestrator** handles all status transitions and cascades
