# Phase v3.1-02-analysis-orchestrator Plan 02 Summary

## Execution Details

- **Plan**: 02-02 PM Analysis prompt builder
- **Status**: Complete
- **Duration**: ~5 minutes
- **Date**: 2026-01-18

## Tasks Completed

### Task 1: Create PM analysis prompt builder

Created `src/main/agent/pm-analysis-prompt.ts` with:

1. **buildAnalysisPrompt(task, featureSpec)**: Generates analysis prompt with:
   - Feature spec context section
   - Task details section (title, description)
   - Decision framework with clear KEEP vs SPLIT criteria
   - JSON output format specification for both decisions
   - Important rules (no verification tasks, no planning tasks, no circular dependencies)

2. **Prompt Structure**:
   - KEEP: Single deliverable, tightly coupled, reasonable scope
   - SPLIT: Multiple independent deliverables, too complex for one session
   - 2-5 subtasks max guideline to prevent over-splitting

### Task 2: Add response parsing helper

Added `parseAnalysisResponse(response)` function that:

1. **Handles response formats**:
   - Raw JSON responses
   - JSON wrapped in markdown code blocks (```json ... ```)
   - JSON embedded in other text

2. **Validates responses**:
   - Checks decision is 'keep' or 'split'
   - For split: validates tasks array exists and is non-empty
   - Validates each task has title (string), description (string), dependsOn (array if present)

3. **Returns ParsedAnalysisResponse**:
   - `decision`: 'keep' | 'split'
   - `tasks?`: Array of subtask definitions (for split)
   - `error?`: Error message for malformed responses

4. **Graceful fallback**: Returns `{ decision: 'keep', error: '...' }` on parse failure

## Verification

- [x] npm run build succeeds
- [x] src/main/agent/pm-analysis-prompt.ts exists (200 lines)
- [x] Exports: buildAnalysisPrompt, parseAnalysisResponse, ParsedAnalysisResponse
- [x] Prompt includes JSON output format specification
- [x] Prompt includes decision framework (keep vs split)
- [x] Uses Task type from @shared/types

## Files Modified

| File | Action | Lines |
|------|--------|-------|
| src/main/agent/pm-analysis-prompt.ts | Created | 200 |

## Key Implementation Details

- Prompt emphasizes "Prefer KEEP over SPLIT" to prevent over-splitting
- JSON output format clearly specified for both decision types
- Response parser handles various LLM output quirks (code blocks, extra text)
- Subtask dependencies use titles for reference (will be resolved to IDs by orchestrator)
- ParsedAnalysisResponse interface provides typed error handling

## Commit

```
feat(v3.1-02-02): add PM analysis prompt builder
```
