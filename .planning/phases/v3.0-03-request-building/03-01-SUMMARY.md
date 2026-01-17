# Phase v3.0-03-request-building Plan 01: Request Building - Summary

**Status:** ✅ Complete
**Completed:** 2026-01-17

## Objective

Implement request building functionality that combines all session components into complete agent prompts ready for Claude Agent SDK.

Purpose: Enable rendering agents to build complete requests with all context (agent description, project context, checkpoint summary, and recent messages) formatted as proper system and user prompts.

Output:
- `buildRequest()` method that assembles complete prompts from session components
- `previewRequest()` method that shows token breakdown before sending
- IPC handlers for request building
- Preload API for renderer integration

## What Was Built

### Task 1: Request Building Methods in SessionManager

Added two new public methods to the SessionManager class:

1. **buildRequest(sessionId, featureId, userMessage)**: Returns complete request ready for Claude Agent SDK
   - Loads all session components (chat, checkpoint, context, agent description)
   - Formats context, checkpoint, and messages using existing formatter functions
   - Builds system prompt by concatenating:
     - Agent description (roleInstructions + toolInstructions)
     - Formatted context (project, feature, task info)
     - Formatted checkpoint (if exists)
     - Formatted messages (recent conversation)
   - User prompt is the userMessage parameter
   - Returns object with systemPrompt, userPrompt, and totalTokens
   - Includes comprehensive error handling for missing components

2. **previewRequest(sessionId, featureId, userMessage?)**: Returns request preview with detailed token breakdown
   - Same logic as buildRequest but with detailed breakdown
   - userMessage is optional (defaults to empty string for preview)
   - Returns breakdown object containing:
     - agentDescTokens (agent description tokens)
     - contextTokens (project/feature/task context)
     - checkpointTokens (compressed conversation history)
     - messagesTokens (recent messages)
     - userPromptTokens (user message)
     - total (sum of all components)
   - Useful for debugging and UI display

Both methods:
- Import formatting functions from token-estimator.ts
- Import estimation functions for token counting
- Are async and public
- Use consistent error handling with descriptive messages
- Follow existing code patterns in SessionManager

### Task 2: IPC Handlers and Preload API

**session-handlers.ts:**
Added two new IPC handlers:
- `session:buildRequest` - Calls manager.buildRequest() and returns complete request
- `session:previewRequest` - Calls manager.previewRequest() and returns request with breakdown

Both handlers:
- Accept projectRoot, sessionId, featureId parameters
- buildRequest requires userMessage parameter
- previewRequest has optional userMessage parameter
- Return properly typed responses matching SessionManager methods

**preload/index.d.ts:**
Extended SessionAPI interface with:
- `buildRequest()` method signature with proper TypeScript types
- `previewRequest()` method signature with optional userMessage
- Complete type definitions for return objects including breakdown structure

**preload/index.ts:**
Implemented both methods in session object:
- `buildRequest()` - Invokes 'session:buildRequest' IPC handler
- `previewRequest()` - Invokes 'session:previewRequest' IPC handler
- Both properly pass all parameters via ipcRenderer.invoke()

## Verification

All verification checks passed:

- ✅ npm run build succeeds with no errors
- ✅ SessionManager has buildRequest() and previewRequest() methods
- ✅ IPC handlers registered for session:buildRequest and session:previewRequest
- ✅ Preload API exposes both methods with correct signatures
- ✅ All imports resolved correctly
- ✅ No TypeScript compilation errors
- ✅ buildRequest() returns complete request with systemPrompt + userPrompt + totalTokens
- ✅ previewRequest() returns request with detailed token breakdown
- ✅ IPC integration complete for renderer access

## Files Modified

- `src/main/services/session-manager.ts` - Added buildRequest() and previewRequest() methods
- `src/main/ipc/session-handlers.ts` - Added session:buildRequest and session:previewRequest handlers
- `src/preload/index.d.ts` - Extended SessionAPI interface with new method signatures
- `src/preload/index.ts` - Implemented preload methods for request building

## Must-Haves Verification

### Truths (Observable Behaviors)

✅ **SessionManager can build complete agent requests from session components**
- buildRequest() successfully loads and combines all 4 components

✅ **Request includes all 4 components: agent description + context + checkpoint + messages**
- System prompt contains roleInstructions, toolInstructions, formatted context, formatted checkpoint, and formatted messages
- Each component is properly separated and formatted

✅ **Request preview shows token breakdown by component**
- previewRequest() returns detailed breakdown with agentDescTokens, contextTokens, checkpointTokens, messagesTokens, userPromptTokens, and total

✅ **Token estimates are accurate and prevent overflow**
- Uses existing estimateRequest() function for accurate token counting
- Token estimates help determine when compaction is needed

### Artifacts (Files/Exports)

✅ **src/main/services/session-manager.ts**
- Provides: Request building methods
- Exports: buildRequest, previewRequest
- Min lines: 1000 (file is 1149 lines after changes)

✅ **src/main/ipc/session-handlers.ts**
- Provides: IPC handlers for request operations
- Contains: "session:buildRequest" and "session:previewRequest" handlers

✅ **src/preload/index.d.ts**
- Provides: Type definitions for request API
- Contains: buildRequest and previewRequest in SessionAPI interface

✅ **src/preload/index.ts**
- Provides: Preload implementation for request API
- Contains: buildRequest and previewRequest implementations

### Key Links (Critical Connections)

✅ **src/main/services/session-manager.ts → token-estimator.ts**
- Via: imports and uses formatContextAsPrompt, formatCheckpointAsPrompt, formatMessagesAsPrompt
- Pattern: All three formatting functions imported and used
- Verified: Lines 30-32 import formatting functions, used in buildRequest() and previewRequest()

✅ **src/main/ipc/session-handlers.ts → SessionManager.buildRequest**
- Via: IPC handler calls manager.buildRequest()
- Pattern: manager\.buildRequest
- Verified: Line 301 calls manager.buildRequest()

## Commits

- ff31035: feat(v3.0-03-01-1): add request building methods to SessionManager
- 70f7036: feat(v3.0-03-01-2): add IPC handlers for request building

## Next Steps

The request building functionality is now complete and ready for integration with agent systems. This enables:

1. Renderer processes to build complete agent requests with all session context
2. Token estimation and breakdown for UI display and debugging
3. Future integration with Claude Agent SDK for sending requests
4. Proper context management across all agent types (PM, Dev, QA, Harness, Merge)

Next phases in the v3.0 milestone can now utilize these methods for agent communication and context management.
