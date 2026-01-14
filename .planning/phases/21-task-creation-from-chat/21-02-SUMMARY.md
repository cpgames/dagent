# Phase 21 Plan 02 Summary: Intelligent Task Placement with Dependency Inference

**Status**: Complete
**Duration**: ~12 min
**Commit**: 317f857

## What Was Built

Added intelligent dependency inference for task creation via PM Agent. Tasks can now be created with explicit dependencies, and the PM Agent is instructed to analyze existing tasks before creating new ones.

### Files Modified

1. **src/shared/types/pm-tools.ts**
   - Added `dependsOn?: string[]` to CreateTaskInput
   - Added `AddDependencyInput` and `AddDependencyResult` types
   - Added `GetTaskInput` and `GetTaskResult` types with dependency info

2. **src/main/ipc/pm-tools-handlers.ts**
   - Updated `calculatePosition()` to position tasks below their dependencies
   - Updated createTask handler to:
     - Set status based on dependency completion
     - Create connections for specified dependencies
   - Added `addDependency` handler with cycle detection
   - Added `getTask` handler returning dependency/dependent info

3. **src/main/ipc/chat-handlers.ts**
   - Set PM tools feature context when loading chat context

4. **src/main/agent/pm-tool-handlers.ts**
   - Added AddDependency and GetTask tool definitions
   - Updated tool schemas with dependency support
   - Updated getPMToolInstructions() with dependency workflow

5. **src/main/agent/tool-config.ts**
   - Added AddDependency and GetTask to pmAgent preset

6. **src/shared/types/agent-config.ts**
   - Updated PM Agent default instructions with:
     - Always call ListTasks first
     - Analyze dependencies based on logical workflow
     - Example workflow for task creation
     - Guidance for manual dependency management

7. **src/preload/index.ts** & **src/preload/index.d.ts**
   - Added `addDependency` and `getTask` methods to PMToolsAPI

## Key Features

### Dependency-Aware Task Creation
- New tasks can specify `dependsOn` array with task IDs
- Task status auto-set to 'blocked' if dependencies incomplete
- Task position calculated below dependency tasks

### AddDependency Tool
- Connect existing tasks with dependencies
- Prevents circular dependencies
- Updates blocked status as needed

### GetTask Tool
- Returns task details with dependency and dependent IDs
- Useful for PM Agent to understand task relationships

### PM Agent Workflow
The default PM Agent instructions now guide it to:
1. Always call ListTasks before creating tasks
2. Analyze logical dependencies based on workflow order
3. Use dependsOn in CreateTask with relevant task IDs
4. Explain dependency reasoning to the user

## Verification

- [x] npm run typecheck passes
- [x] CreateTask accepts dependsOn array
- [x] New tasks connected to specified dependencies
- [x] Task status correctly set (blocked if deps incomplete)
- [x] AddDependency creates connections between tasks
- [x] Circular dependency prevention works
- [x] GetTask returns dependency information
- [x] PM Agent instructions include dependency guidance
