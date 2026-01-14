# Phase 21 Plan 01 Summary: PM Agent Task Creation Tool

**Status**: Complete
**Duration**: ~10 min
**Commit**: 68c3808

## What Was Built

Added PM Agent task creation capabilities to enable creating tasks via Feature Chat.

### Files Created

1. **src/shared/types/pm-tools.ts** - Type definitions for PM tools
   - `CreateTaskInput` - Task title, description, optional position
   - `CreateTaskResult` - Success/error response with taskId
   - `ListTasksInput` / `ListTasksResult` - Task listing types

2. **src/main/ipc/pm-tools-handlers.ts** - IPC handlers for PM operations
   - `pm-tools:setContext` - Set current feature for task creation
   - `pm-tools:getContext` - Get current feature context
   - `pm-tools:createTask` - Create new task in DAG
   - `pm-tools:listTasks` - List all tasks in current feature's DAG
   - Auto-positioning of new tasks below existing ones

3. **src/main/agent/pm-tool-handlers.ts** - PM tool definitions for SDK
   - CreateTask tool schema and handler
   - ListTasks tool schema and handler
   - Helper for PM tool instructions in system prompts

### Files Modified

1. **src/shared/types/index.ts** - Export pm-tools types
2. **src/main/ipc/handlers.ts** - Register PM tools handlers
3. **src/preload/index.ts** - Expose pmTools API
4. **src/preload/index.d.ts** - Add PMToolsAPI type declarations
5. **src/main/agent/tool-config.ts** - Add pmAgent preset
6. **src/main/agent/types.ts** - Add pmAgent to ToolPreset type
7. **src/renderer/src/stores/chat-store.ts**
   - Set PM tools context before agent query
   - Use pmAgent preset instead of featureChat
   - Refresh DAG after agent completes

## Key Implementation Details

- New tasks default to 'blocked' status unless they're the first task (then 'ready')
- Task positions auto-calculated below existing tasks
- Feature context must be set before PM tools can create tasks
- DAG automatically refreshes after agent query completes

## Verification

- [x] npm run typecheck passes
- [x] pm-tools types exported from @shared/types
- [x] PM tools IPC handlers registered
- [x] preload exposes pmTools API
- [x] pmAgent tool preset includes CreateTask, ListTasks
- [x] Feature Chat uses pmAgent preset
