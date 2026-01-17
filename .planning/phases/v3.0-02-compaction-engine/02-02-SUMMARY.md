# Phase v3.0-02 Plan 02: Monitoring & Events - Summary

**Status:** ✅ Complete
**Completed:** 2026-01-17

## Objective

Add monitoring, events, and manual control for the compaction system to enable UI visibility into compaction operations and provide manual trigger capability for debugging and user control.

## What Was Built

### 1. Compaction Events in SessionManager

Extended the `compact()` method in [SessionManager](src/main/services/session-manager.ts) to emit lifecycle events:

**Event Emission:**
- `session:compaction-start` - Emitted at start of compaction
  - Data: sessionId, featureId, taskId, messagesCount, estimatedTokens
- `session:compaction-complete` - Emitted on successful compaction
  - Data: sessionId, featureId, taskId, messagesCompacted, tokensReclaimed, newCheckpointVersion, compactedAt
- `session:compaction-error` - Emitted on compaction failure
  - Data: sessionId, error

**Implementation Details:**
- Events broadcast to all renderer windows via `BrowserWindow.getAllWindows()`
- Check `!win.isDestroyed()` before sending to prevent errors
- Error events include error message from caught exception

### 2. Compaction Metrics Getter

Added `getCompactionMetrics()` public method to SessionManager:

```typescript
async getCompactionMetrics(sessionId: string, featureId: string): Promise<{
  totalCompactions: number
  totalMessagesCompacted: number
  totalTokens: number
  lastCompactionAt?: string
} | null>
```

**Returns:**
- `null` if session or checkpoint not found
- Metrics object with:
  - `totalCompactions` - Total number of compactions performed
  - `totalMessagesCompacted` - Cumulative messages compacted
  - `totalTokens` - Cumulative tokens compacted
  - `lastCompactionAt` - ISO timestamp of last compaction

**Data Source:**
- Reads from `checkpoint.stats` and `checkpoint.compactionInfo`

### 3. Manual Compaction Trigger

Added `forceCompact()` public method to SessionManager:

```typescript
async forceCompact(sessionId: string, featureId: string): Promise<void>
```

**Behavior:**
- Throws error if session not found
- Calls private `compact()` method directly
- Bypasses the 90k token threshold check
- Useful for testing and user-initiated compaction

### 4. IPC Handlers

Added two new IPC handlers in [session-handlers.ts](src/main/ipc/session-handlers.ts):

**`session:getMetrics`**
- Parameters: projectRoot, sessionId, featureId
- Returns: Compaction metrics object or null
- Calls `SessionManager.getCompactionMetrics()`

**`session:forceCompact`**
- Parameters: projectRoot, sessionId, featureId
- Returns: void
- Calls `SessionManager.forceCompact()`

### 5. Preload API

Extended SessionAPI interface in [index.d.ts](src/preload/index.d.ts) and added implementations in [index.ts](src/preload/index.ts):

**Method APIs:**
- `getMetrics(projectRoot, sessionId, featureId)` - Returns metrics promise
- `forceCompact(projectRoot, sessionId, featureId)` - Returns void promise

**Event Subscription APIs:**
- `onCompactionStart(callback)` - Subscribe to start events, returns unsubscribe function
- `onCompactionComplete(callback)` - Subscribe to complete events, returns unsubscribe function
- `onCompactionError(callback)` - Subscribe to error events, returns unsubscribe function

**Implementation Pattern:**
- All event subscriptions return cleanup functions for unregistering listeners
- Uses `ipcRenderer.on()` and `ipcRenderer.removeListener()`
- Typed callbacks with specific event data structures

## Verification Results

✅ TypeScript builds without errors
✅ All IPC handlers registered in session-handlers.ts
✅ Preload API fully typed and implemented
✅ Event system implemented (start, complete, error events)
✅ All must-haves verified:
- Compaction events emitted to renderer process
- UI can subscribe to compaction events
- Compaction metrics tracked (total compactions, messages compacted, tokens saved)
- Manual compaction can be triggered via IPC

## Files Modified

1. [src/main/services/session-manager.ts](src/main/services/session-manager.ts) - Added event emission, metrics, and manual trigger
2. [src/main/ipc/session-handlers.ts](src/main/ipc/session-handlers.ts) - Added getMetrics and forceCompact handlers
3. [src/preload/index.d.ts](src/preload/index.d.ts) - Extended SessionAPI interface with 5 new methods
4. [src/preload/index.ts](src/preload/index.ts) - Implemented SessionAPI methods

## Must-Haves Verification

### Truths (Observable Behaviors)
✅ Compaction events are emitted to renderer process
✅ UI can subscribe to compaction events
✅ Compaction metrics are tracked (total compactions, messages compacted, tokens saved)
✅ Manual compaction can be triggered via IPC

### Artifacts (Files/Exports)
✅ `src/main/services/session-manager.ts` contains event emission code
✅ `src/main/ipc/session-handlers.ts` exports `session:getMetrics` and `session:forceCompact` handlers
✅ `src/preload/index.ts` contains `onCompactionStart`, `onCompactionComplete`, `onCompactionError` methods

### Key Links (Critical Connections)
✅ `SessionManager.compact` → `BrowserWindow.send` via event emission to renderer
✅ `session-handlers` → `SessionManager.compact` via manual compaction trigger (ipcMain.handle)

## Usage Examples

### Subscribing to Compaction Events (Renderer)

```typescript
// Subscribe to compaction lifecycle
const unsubscribeStart = window.electronAPI.session.onCompactionStart((data) => {
  console.log(`Compaction started for ${data.sessionId}`)
  console.log(`Compacting ${data.messagesCount} messages (~${data.estimatedTokens} tokens)`)
})

const unsubscribeComplete = window.electronAPI.session.onCompactionComplete((data) => {
  console.log(`Compaction complete for ${data.sessionId}`)
  console.log(`Compacted ${data.messagesCompacted} messages`)
  console.log(`Reclaimed ${data.tokensReclaimed} tokens`)
  console.log(`New checkpoint version: ${data.newCheckpointVersion}`)
})

const unsubscribeError = window.electronAPI.session.onCompactionError((data) => {
  console.error(`Compaction failed for ${data.sessionId}: ${data.error}`)
})

// Later: cleanup
unsubscribeStart()
unsubscribeComplete()
unsubscribeError()
```

### Getting Compaction Metrics (Renderer)

```typescript
const metrics = await window.electronAPI.session.getMetrics(
  projectRoot,
  sessionId,
  featureId
)

if (metrics) {
  console.log(`Total compactions: ${metrics.totalCompactions}`)
  console.log(`Total messages compacted: ${metrics.totalMessagesCompacted}`)
  console.log(`Total tokens saved: ${metrics.totalTokens}`)
  console.log(`Last compaction: ${metrics.lastCompactionAt}`)
}
```

### Manual Compaction Trigger (Renderer)

```typescript
try {
  await window.electronAPI.session.forceCompact(projectRoot, sessionId, featureId)
  console.log('Manual compaction triggered successfully')
} catch (error) {
  console.error('Failed to trigger compaction:', error)
}
```

## Next Steps

Phase v3.0-02 (Compaction Engine) is now **complete** with both plans executed:
- ✅ Plan 02-01: Compaction Core
- ✅ Plan 02-02: Monitoring & Events

The application now has a fully functional compaction system with:
- Automatic compaction at 90k tokens
- Event-driven UI updates for monitoring
- Metrics tracking for visibility
- Manual compaction trigger for debugging

**Next phase:** Build Request Builder (Phase v3.0-03) to assemble complete agent requests from sessions.

## Notes

- Event listeners properly clean up when unsubscribed
- Metrics return `null` if session/checkpoint not found (not an error)
- Manual compaction bypasses token threshold (runs even if under 90k)
- Events broadcast to all renderer windows (multi-window support)
- Error events include error message but don't crash the app
