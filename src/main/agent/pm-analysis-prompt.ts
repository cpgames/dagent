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
  tasks?: Array<{
    title: string
    description: string
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
Description: ${task.description || '(No description)'}

## Your Decision

Analyze this task's COMPLEXITY and SCOPE:

1. **Estimate the work**: How many distinct implementation steps?
2. **Check independence**: Are there logically separate deliverables?
3. **Consider scope**: Would this be too large for one dev session?

**Decision Options:**

A) **KEEP** - Task is appropriately scoped
   - Single deliverable or tightly coupled items
   - Reasonable amount of work
   - No need to split

B) **SPLIT** - Task is too complex
   - Multiple independent deliverables
   - Would benefit from separate implementation
   - Define subtasks with dependencies

## Output Format

Respond with ONLY a JSON object (no markdown code blocks, no explanation):

If KEEP:
{
  "decision": "keep"
}

If SPLIT:
{
  "decision": "split",
  "tasks": [
    {
      "title": "First subtask title",
      "description": "What this subtask accomplishes",
      "dependsOn": []
    },
    {
      "title": "Second subtask title",
      "description": "What this subtask accomplishes",
      "dependsOn": ["First subtask title"]
    }
  ]
}

## IMPORTANT RULES

1. **Never create verification/QA tasks** - Verification is automatic
2. **Never create planning tasks** - Planning is part of implementation
3. **Use dependsOn when task B needs output from task A** - Reference by title
4. **Keep tasks focused and actionable** - Each task should have a clear outcome
5. **No circular dependencies** - Task A cannot depend on Task B if B depends on A
6. **Prefer KEEP over SPLIT** - Only split if clearly too complex
7. **2-5 subtasks max** - If you need more, consider if the parent task is well-defined`
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

  // Try to find JSON object in the response
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      decision: 'keep',
      error: 'No JSON object found in response'
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])

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
        if (!task.description || typeof task.description !== 'string') {
          return {
            decision: 'keep',
            error: `Task ${i} missing or invalid description`
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
          (t: { title: string; description: string; dependsOn?: string[] }) => ({
            title: t.title,
            description: t.description,
            dependsOn: t.dependsOn || []
          })
        )
      }
    }

    // Keep decision
    return {
      decision: 'keep'
    }
  } catch (err) {
    return {
      decision: 'keep',
      error: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}
