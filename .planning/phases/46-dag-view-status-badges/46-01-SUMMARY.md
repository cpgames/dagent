---
phase: 46-dag-view-status-badges
plan: 01
title: Task State Badges with Tooltips
status: complete
completed: 2026-01-15
duration: ~5 min
---

# Summary

Added dynamic status badges to TaskNode that show active execution state with tooltips.

## What Was Done

### Task 1: Replace Static Badges with Dynamic State Badge

Replaced the static agent type badges (Dev/QA/Merge) with dynamic state badges that only appear during active execution states.

**Changes to `src/renderer/src/components/DAG/TaskNode.tsx`:**

1. **Added state badge configuration** (lines 32-40):
   ```typescript
   const stateBadgeConfig: Partial<
     Record<TaskStatus, { label: string; bgColor: string; textColor: string }>
   > = {
     dev: { label: 'DEV', bgColor: 'bg-blue-500/20', textColor: 'text-blue-400' },
     qa: { label: 'QA', bgColor: 'bg-yellow-500/20', textColor: 'text-yellow-400' },
     merging: { label: 'MERGE', bgColor: 'bg-purple-500/20', textColor: 'text-purple-400' },
     failed: { label: 'FAILED', bgColor: 'bg-red-500/20', textColor: 'text-red-400' }
   }
   ```

2. **Replaced static badges section** with dynamic rendering:
   - Removed unconditional Dev/QA badges
   - Badge only renders when `stateBadgeConfig[task.status]` exists
   - Uses native `title` attribute for tooltip

### Task 2: Add Execution Info to Tooltip

Added `assignedAgentId` field to Task type and included it in tooltip.

**Changes to `src/shared/types/task.ts`:**

1. Added optional `assignedAgentId` field:
   ```typescript
   assignedAgentId?: string; // ID of agent currently working on this task
   ```

**Tooltip format:**
- Always shows: `State: DEV` (or QA/MERGE/FAILED)
- If agent assigned: `Agent: task-abc123` (on second line)

## Badge Visibility

| Task Status | Badge Shown? | Color |
|-------------|--------------|-------|
| blocked | No | - |
| ready | No | - |
| dev | Yes | Blue |
| qa | Yes | Yellow |
| merging | Yes | Purple |
| completed | No | - |
| failed | Yes | Red |

## Files Changed

- **Modified**: `src/renderer/src/components/DAG/TaskNode.tsx`
  - Added `stateBadgeConfig` constant
  - Replaced static badge section with conditional dynamic badge
  - Badge includes tooltip with state and optional agent ID

- **Modified**: `src/shared/types/task.ts`
  - Added `assignedAgentId?: string` field to Task interface

## Verification

- [x] `npm run build` succeeds without errors
- [x] Tasks with `dev` status show blue "DEV" badge
- [x] Tasks with `qa` status show yellow "QA" badge
- [x] Tasks with `merging` status show purple "MERGE" badge
- [x] Tasks with `failed` status show red "FAILED" badge
- [x] Tasks with `blocked`/`ready`/`completed` status show NO badge
- [x] Hover on badge shows tooltip with state name

## Phase 46 Complete

DAG View Status Badges is complete. Task nodes now display:
- Dynamic state badges during active execution (dev, qa, merging, failed)
- Tooltips with state name and agent ID (when available)
- Color scheme matching v2.0 roadmap specification
