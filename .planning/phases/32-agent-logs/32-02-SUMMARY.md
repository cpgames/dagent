---
phase: 32-agent-logs
plan: 02
type: summary
status: complete
started: 2026-01-14T10:25:00Z
completed: 2026-01-14T10:35:00Z
---

## Summary

Added log buttons to TaskNode and PM chat header, wired up log dialog.

## Changes Made

### Task 1: Add log button to TaskNode
- **File:** `src/renderer/src/components/DAG/TaskNode.tsx`
- Added `onLog` callback to `TaskNodeData` interface
- Added log button (document icon) in header between edit and delete buttons
- Button triggers `onLog(task.id)` with tooltip "View agent logs for this task"

### Task 2: Wire task log button in DAGView
- **File:** `src/renderer/src/views/DAGView.tsx`
- Added `logEntries` state for LogDialog
- Added `handleLogTask` callback that:
  - Gets task title from DAG
  - Opens LogDialog with title "[Task Name] Logs"
  - Loads harness log and filters entries by taskId
- Updated `dagToNodes` to accept and pass `onLog` handler
- Added LogDialog rendering when `logDialogOpen && logDialogTitle`

### Task 3: Add PM log button to ChatPanel header
- **File:** `src/renderer/src/components/Chat/ChatPanel.tsx`
  - Added optional `onShowLogs` prop
  - Renders log button (document icon) next to Clear button when prop provided
  - Button tooltip: "View PM agent communication logs"

- **File:** `src/renderer/src/components/Chat/FeatureChat.tsx`
  - Added optional `onShowLogs` prop and forwards to ChatPanel

- **File:** `src/renderer/src/views/DAGView.tsx`
  - Added `handleShowPMLogs` callback that:
    - Opens LogDialog with title "PM Agent Logs"
    - Loads chat history and converts entries to LogEntry format
    - User messages become `pm-query`, assistant messages become `pm-response`
  - Passes `onShowLogs={handleShowPMLogs}` to FeatureChat

## Verification

- [x] `npm run typecheck` passes
- [x] Task nodes show log button
- [x] Clicking task log button opens dialog with task-filtered logs
- [x] PM chat header shows log button
- [x] Clicking PM log button opens dialog with PM communications

## Phase 32 Complete

Agent logs are now visible for tasks and PM:
- Each task node has a log button showing inter-agent communications for that task
- PM chat header has a log button showing PM agent communication history
- Log dialogs support filtering by agent type
