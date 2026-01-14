# Phase 31-01: Task Selection Context - Summary

## Completed
All tasks completed successfully.

## Changes Made

### Removed TaskChat Overlay
1. **src/renderer/src/components/Chat/index.ts** - Removed TaskChat export
2. **src/renderer/src/components/Chat/TaskChat.tsx** - DELETED
3. **src/renderer/src/views/DAGView.tsx**:
   - Removed TaskChat import and rendering
   - Removed handleChatTask callback
   - Removed taskChat state destructuring from useDialogStore
   - Updated dagToNodes to not require onChat handler
   - Added onNodeClick handler to select tasks
   - Updated handlePaneClick to clear node selection
4. **src/renderer/src/stores/dialog-store.ts** - Removed taskChatOpen, taskChatTaskId, taskChatFeatureId state and related actions
5. **src/renderer/src/components/DAG/TaskNode.tsx**:
   - Removed onChat from TaskNodeData interface
   - Removed chat button from header

### Added Task Selection Context
1. **src/renderer/src/views/DAGView.tsx**:
   - Added setSelectedNode from useDAGStore
   - Added handleNodeClick to set selected task on click
   - Clear selectedNode on pane click
2. **src/renderer/src/stores/chat-store.ts**:
   - Get selectedNodeId from dag-store
   - Pass as taskId to sdkAgent.query()
3. **src/main/agent/prompt-builders.ts**:
   - Added "Selected Task Context" section to PM agent instructions
   - PM agent now knows to interpret "this task" as the selected task
   - PM agent will describe selected task when asked

## Verification
1. Chat button removed from TaskNode - PASS
2. TaskChat overlay no longer appears - PASS
3. Clicking task node selects it (visual ring already exists) - PASS
4. PM agent receives selected task context via autoContext - PASS
5. Type check passes - PASS

## Files Changed
- src/renderer/src/components/Chat/index.ts (edited)
- src/renderer/src/components/Chat/TaskChat.tsx (DELETED)
- src/renderer/src/views/DAGView.tsx (edited)
- src/renderer/src/stores/dialog-store.ts (edited)
- src/renderer/src/stores/chat-store.ts (edited)
- src/renderer/src/components/DAG/TaskNode.tsx (edited)
- src/main/agent/prompt-builders.ts (edited)
