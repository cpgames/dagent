---
phase: 63-pm-spec-management
plan: 01
status: complete
completed_at: 2026-01-15
---

# Phase 63-01 Summary: PM Spec Management

## What Was Built

Enabled PM agent to create and manage feature specifications through chat, implementing a spec-first workflow where the PM agent captures user intent before creating tasks.

## Files Modified

### New Files
- **src/main/ipc/pm-spec-handlers.ts**
  - IPC handlers for spec CRUD operations
  - Direct function exports for MCP server: `pmCreateSpec`, `pmUpdateSpec`, `pmGetSpec`
  - Uses `getCurrentProjectPath()` for project context
  - Uses `getPMToolsFeatureContext()` via pm-mcp-server for feature context

### Modified Files
- **src/main/agents/feature-spec-types.ts**
  - Added input/result types for spec operations
  - `CreateSpecInput`, `CreateSpecResult`
  - `UpdateSpecInput`, `UpdateSpecResult`
  - `GetSpecInput`, `GetSpecResult`

- **src/main/ipc/handlers.ts**
  - Added import and registration for `registerPMSpecHandlers`

- **src/preload/index.ts**
  - Added `pmSpec` API with `createSpec`, `updateSpec`, `getSpec` methods
  - Added type imports for spec types

- **src/preload/index.d.ts**
  - Added `PMSpecAPI` interface
  - Added `pmSpec` to `ElectronAPI` interface

- **src/main/agent/pm-mcp-server.ts**
  - Added `CreateSpec`, `UpdateSpec`, `GetSpec` MCP tools
  - Updated `getPMToolNamesForAllowedTools()` to include spec tools
  - Tools automatically use current feature context

- **src/main/agent/tool-config.ts**
  - Added `CreateSpec`, `UpdateSpec`, `GetSpec` to pmAgent preset

- **src/main/agent/prompt-builders.ts**
  - Updated PM agent role instructions for spec-first workflow
  - PM now checks for spec first, creates/updates as needed
  - Clear instructions on spec vs task management

## Architecture

```
User Chat → PM Agent → MCP Server → pm-spec-handlers → FeatureSpecStore → feature-spec.md
                                                    ↘                    ↗
                                              getCurrentProjectPath()
                                              getPMToolsFeatureContext()
```

## Key Patterns

1. **IPC + Direct Export**: Same pattern as pm-tools-handlers - both IPC handlers for renderer and direct function exports for MCP server
2. **Context Inheritance**: Uses existing context from pm-tools-handlers (`getPMToolsFeatureContext`) and project-handlers (`getCurrentProjectPath`)
3. **MCP Tool Integration**: Tools registered in pm-mcp-server, added to tool-config preset, prompt updated with instructions

## Verification

- [x] `npm run build` succeeds without errors
- [x] All new types exported from feature-spec-types.ts
- [x] IPC handlers registered and callable
- [x] Preload API includes pm-spec methods
- [x] MCP server includes CreateSpec, UpdateSpec, GetSpec tools
- [x] PM agent prompt includes spec management instructions
- [x] Tool names added to allowedTools list

## Usage

When user describes a feature to PM agent:
1. PM agent calls `GetSpec` to check if spec exists
2. If no spec: calls `CreateSpec` with extracted goals, requirements, constraints, acceptance criteria
3. If spec exists: calls `UpdateSpec` to add new items
4. Responds concisely: "Created spec with N goals, M requirements"

The spec persists to `.dagent/{featureId}/feature-spec.md` and serves as the source of truth for all agents (Dev, QA, Merge) working on the feature.
