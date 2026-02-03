/**
 * PM Analysis Prompt Builder
 *
 * Generates prompts for PM agent to analyze task complexity
 * and decide whether to keep or split tasks.
 */

import type { Task } from '@shared/types'

/**
 * Parsed response from PM analysis.
 */
export interface ParsedAnalysisResponse {
  decision: 'keep' | 'split'
  /** Refined title (for keep decisions) */
  refinedTitle?: string
  /** Refined spec (for keep decisions) */
  refinedSpec?: string
  tasks?: Array<{
    title: string
    spec: string
    dependsOn?: string[]
  }>
  error?: string
}

/**
 * Build a prompt for PM to analyze a task's complexity.
 *
 * @param task - The task to analyze
 * @param featureSpec - The feature specification content
 * @returns Prompt string for PM analysis
 */
export function buildAnalysisPrompt(task: Task, featureSpec: string): string {
  return `You are analyzing a task to determine if it should be split.

## Feature Spec
${featureSpec || '(No spec available)'}

## Task to Analyze
Title: ${task.title}
Spec: ${task.spec || '(No spec)'}

## Your Decision

**FIRST, check the Feature Spec for task breakdown instructions.**
If the spec contains requirements like:
- "one task per X"
- "separate tasks for each Y"
- "split into N tasks"
- specific task structure requirements

**YOU MUST FOLLOW THOSE INSTRUCTIONS.** User-specified task breakdown requirements take absolute priority over default complexity analysis.

**THEN, if no breakdown instructions exist**, analyze complexity:
1. **Estimate the work**: How many distinct implementation steps?
2. **Check independence**: Are there logically separate deliverables?
3. **Consider scope**: Would this be too large for one dev session?

**Decision Options:**

A) **KEEP** - Task is appropriately scoped
   - Single deliverable or tightly coupled items
   - Reasonable amount of work
   - No need to split

B) **SPLIT** - Task needs to be broken down
   - Spec requires specific task structure (HIGHEST PRIORITY)
   - Multiple independent deliverables
   - Would benefit from separate implementation

## Output Format

Respond with ONLY a JSON object (no markdown code blocks, no explanation):

If KEEP:
{
  "decision": "keep",
  "title": "Refined, clear task title",
  "spec": "Detailed specification of what needs to be done, implementation approach, and expected outcome"
}

If SPLIT:
{
  "decision": "split",
  "tasks": [
    {
      "title": "First subtask title",
      "spec": "What this subtask accomplishes",
      "dependsOn": []
    },
    {
      "title": "Second subtask title",
      "spec": "What this subtask accomplishes",
      "dependsOn": ["First subtask title"]
    }
  ]
}

**For KEEP decisions, ALWAYS provide refined title and spec:**
- Title should be clear, action-oriented (e.g., "Add user authentication endpoint" not "Auth stuff")
- Spec should explain WHAT needs to be built, HOW to approach it, and acceptance criteria

## IMPORTANT RULES

1. **PRIORITIZE spec-defined task structure** - If spec says "one task per X", create one task per X
2. **Never create verification/QA tasks** - Verification is automatic
3. **Never create planning tasks** - Planning is part of implementation
4. **Use dependsOn when task B needs output from task A** - Reference by title
5. **Keep tasks focused and actionable** - Each task should have a clear outcome
6. **No circular dependencies** - Task A cannot depend on Task B if B depends on A
7. **2-5 subtasks max** - Unless spec explicitly requires more`
}

/**
 * Extract a balanced JSON object from a string.
 * Handles nested braces correctly.
 */
function extractJsonObject(str: string): string | null {
  const start = str.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < str.length; i++) {
    const char = str[i]

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\' && inString) {
      escape = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '{') depth++
    if (char === '}') {
      depth--
      if (depth === 0) {
        return str.slice(start, i + 1)
      }
    }
  }

  return null
}

/**
 * Parse PM analysis response and extract decision.
 *
 * Handles:
 * - Raw JSON responses
 * - JSON wrapped in markdown code blocks
 * - Malformed responses
 *
 * @param response - Raw PM response string
 * @returns Parsed analysis response or error
 */
export function parseAnalysisResponse(response: string): ParsedAnalysisResponse {
  // Try to extract JSON from the response
  let jsonStr = response.trim()

  // Handle markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  // Try to find balanced JSON object in the response
  const jsonObject = extractJsonObject(jsonStr)
  if (!jsonObject) {
    return {
      decision: 'keep',
      error: 'No JSON object found in response'
    }
  }

  try {
    const parsed = JSON.parse(jsonObject)

    // Validate decision field
    if (parsed.decision !== 'keep' && parsed.decision !== 'split') {
      return {
        decision: 'keep',
        error: `Invalid decision value: ${parsed.decision}`
      }
    }

    // For split decisions, validate tasks array
    if (parsed.decision === 'split') {
      if (!Array.isArray(parsed.tasks)) {
        return {
          decision: 'keep',
          error: 'Split decision missing tasks array'
        }
      }

      if (parsed.tasks.length === 0) {
        return {
          decision: 'keep',
          error: 'Split decision has empty tasks array'
        }
      }

      // Validate each task has required fields
      for (let i = 0; i < parsed.tasks.length; i++) {
        const task = parsed.tasks[i]
        if (!task.title || typeof task.title !== 'string') {
          return {
            decision: 'keep',
            error: `Task ${i} missing or invalid title`
          }
        }
        if (!task.spec || typeof task.spec !== 'string') {
          return {
            decision: 'keep',
            error: `Task ${i} missing or invalid spec`
          }
        }
        // Validate dependsOn is array if present
        if (task.dependsOn !== undefined && !Array.isArray(task.dependsOn)) {
          return {
            decision: 'keep',
            error: `Task ${i} has invalid dependsOn (must be array)`
          }
        }
      }

      return {
        decision: 'split',
        tasks: parsed.tasks.map(
          (t: { title: string; spec: string; dependsOn?: string[] }) => ({
            title: t.title,
            spec: t.spec,
            dependsOn: t.dependsOn || []
          })
        )
      }
    }

    // Keep decision - extract refined title/spec if provided
    const result: ParsedAnalysisResponse = {
      decision: 'keep'
    }

    if (parsed.title && typeof parsed.title === 'string') {
      result.refinedTitle = parsed.title
    }
    if (parsed.spec && typeof parsed.spec === 'string') {
      result.refinedSpec = parsed.spec
    }

    return result
  } catch (err) {
    return {
      decision: 'keep',
      error: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}
