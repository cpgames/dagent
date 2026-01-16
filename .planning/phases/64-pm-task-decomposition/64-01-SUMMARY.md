---
phase: 64-pm-task-decomposition
plan: 01
status: complete
completed_at: 2026-01-15
---

# Phase 64-01 Summary: PM Task Decomposition

## What Was Built

Implemented intelligent task decomposition in the PM agent, enabling it to analyze feature spec complexity and create appropriately-sized tasks instead of creating one overwhelming task for complex features.

## Files Modified

### Modified Files
- **src/main/agent/prompt-builders.ts**
  - Added Task Decomposition section to PM agent role instructions
  - Instructions cover: complexity analysis (simple vs complex), grouping requirements into logical tasks, adding dependencies between tasks
  - PM now calls DecomposeSpec after creating/updating specs

- **src/main/agent/pm-mcp-server.ts**
  - Added `DecomposeSpec` MCP tool with complexity analysis logic
  - Analyzes requirement count (3+ = complex)
  - Detects cross-cutting concerns (API, UI, database, etc.)
  - Groups requirements by concern type (data layer, API, UI, other)
  - Returns suggested tasks with titles, descriptions, requirement IDs, and dependencies
  - Added to `getPMToolNamesForAllowedTools()` array

- **src/main/agent/tool-config.ts**
  - Added `DecomposeSpec` to pmAgent preset

## Architecture

```
User describes feature → PM creates spec → PM calls DecomposeSpec
                                                    ↓
                                         Complexity Analysis:
                                         - Count requirements
                                         - Detect cross-cutting concerns
                                                    ↓
                         ┌──────────────────────────┴──────────────────────────┐
                         │                                                      │
                    Simple (1-2 reqs)                              Complex (3+ reqs OR cross-cutting)
                         ↓                                                      ↓
                  Single task                                    Suggested task breakdown:
                                                                 - Data layer (models, schema)
                                                                 - API (endpoints, backend)
                                                                 - UI (components, frontend)
                                                                 - Other requirements
                                                                 With dependency chain
```

## DecomposeSpec Tool Details

**Complexity Detection:**
- 3+ requirements → complex
- Cross-cutting keywords detected in 2+ requirements → complex
- Keywords: api, ui, database, backend, frontend, migration, auth

**Task Grouping:**
- Data layer: database, migration, schema, model
- API: api, endpoint, backend
- UI: ui, component, frontend, display
- Other: remaining requirements

**Dependency Chain:**
- Data layer → API → UI → Other
- Each layer depends on the previous if present

## Verification

- [x] npm run build succeeds
- [x] PM prompt includes Task Decomposition section with complexity analysis
- [x] DecomposeSpec tool registered in MCP server
- [x] DecomposeSpec added to pmAgent tool preset
- [x] DecomposeSpec added to allowedTools list

## Usage

When PM agent creates or updates a spec with requirements:
1. PM calls DecomposeSpec to analyze complexity
2. If simple: Creates single task covering all requirements
3. If complex: Uses suggested task breakdown to create multiple tasks with CreateTask
4. PM explains briefly: "Breaking into N tasks: [task1], [task2]..."
5. Tasks reference spec requirements by ID (e.g., "Implements REQ-001, REQ-002")
