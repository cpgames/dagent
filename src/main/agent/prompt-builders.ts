/**
 * Agent-specific prompt builders.
 * Generates system prompts with context for each agent type.
 */

import { getContextService } from '../ipc/context-handlers'
import { getPMToolInstructions } from './pm-tool-handlers'

/**
 * Options for building agent prompts.
 */
export interface AgentPromptOptions {
  featureId?: string
  taskId?: string
  agentType: 'pm' | 'investigation' | 'planning' | 'harness' | 'task' | 'merge' | 'qa'
}

/**
 * Agent type union for type safety.
 */
export type AgentType = 'pm' | 'investigation' | 'planning' | 'harness' | 'task' | 'merge' | 'qa'

/**
 * Build a system prompt for an agent with full context.
 *
 * @param options - Options specifying agent type and context IDs
 * @returns Complete system prompt with role instructions and context
 */
export async function buildAgentPrompt(options: AgentPromptOptions): Promise<string> {
  const contextService = getContextService()
  if (!contextService) {
    return getBasicPrompt(options.agentType)
  }

  try {
    const fullContext = await contextService.buildFullContext({
      featureId: options.featureId,
      taskId: options.taskId,
      includeGitHistory: true,
      includeClaudeMd: true
    })

    const contextSection = contextService.formatContextAsPrompt(fullContext)
    const roleSection = getAgentRoleInstructions(options.agentType)
    // PM, investigation, and planning agents all use PM tools (different subsets via presets)
    const needsToolInstructions = ['pm', 'investigation', 'planning'].includes(options.agentType)
    const toolSection = needsToolInstructions ? getPMToolInstructions() : ''

    return `${roleSection}\n\n${contextSection}\n\n${toolSection}`.trim()
  } catch (error) {
    console.error('[DAGent] Failed to build agent prompt with context:', error)
    return getBasicPrompt(options.agentType)
  }
}

/**
 * Get role-specific instructions for an agent type.
 *
 * @param agentType - The type of agent
 * @returns Role instructions for the system prompt
 */
function getAgentRoleInstructions(agentType: AgentType): string {
  switch (agentType) {
    case 'pm':
      return `You are a PM (Project Manager) Agent. You manage feature specifications and tasks.

## CRITICAL: Always Update Spec First
BEFORE creating any task, you MUST update the feature spec:
1. Call GetSpec to check current spec
2. If no spec: call CreateSpec with the feature name and user's request as a requirement
3. If spec exists: call UpdateSpec to add the new requirement
4. THEN create the task

This ensures the spec is always the source of truth for what the feature should do.

## Spec Content
- Extract requirements from ANY user request, even simple ones like "delete file X"
- Requirements should be actionable: "Delete helloworld.txt" not "User wants deletion"
- Each requirement MUST have a matching acceptance criterion that defines "done"
- When updating requirements, ALWAYS update acceptance criteria to match
- Example: Requirement "Delete file X" → Acceptance Criterion "File X no longer exists"

## Task Management Modes
- When in PLANNING mode: Do NOT create tasks. Only create the feature spec.
- When in INTERACTIVE mode (user requests): You CAN create/modify tasks via DAGAddNode
- Tasks start as needs_analysis and get analyzed by the orchestrator

## Task Decomposition - USE JUDGMENT (Interactive Mode)
When user explicitly requests task creation, think about SCOPE and COMPLEXITY.

**Reasoning approach:**
1. How much work is involved? Simple tasks can be grouped. Complex work should be split.
2. Are these logically independent? If one can fail without affecting the other, maybe split.
3. Would a developer naturally do these together or separately?

**Split when:**
- Individual items require significant work (e.g., "write two detailed essays" → 2 tasks)
- Items are logically independent features (e.g., "login page + profile page" → 2 tasks)
- Combining would make the task too large to reason about

**Keep together when:**
- Items are trivial (e.g., "create test1.txt and test2.txt" → 1 task, just two simple files)
- Items are tightly coupled (e.g., "add button and its click handler" → 1 task)
- Splitting would create artificial boundaries

**NEVER create:**
- "Verification" or "QA" tasks - verification is automatic
- "Planning" or "determine X" tasks - planning is part of implementation
- Tasks that are just execution steps of the same work

## Task Management
- User asks to DO something → UPDATE SPEC first, THEN CREATE TASK
- Always call ListTasks first to see existing tasks
- Be CONCISE: just confirm actions taken

## DAG Operations (via DAGManager)
- Use DAGAddNode to create tasks with automatic vertical placement
  - DAGManager handles positioning in top-to-bottom flow
  - Tasks without dependencies appear at top
  - Dependent tasks appear below blockers
- Use DAGAddConnection to add dependencies with cycle validation
  - Returns error if connection would create a cycle
  - Source task must complete before target task starts
- DAGRemoveNode removes task and all connected edges
- DAGRemoveConnection removes single dependency edge

## When to use DAG tools vs legacy CreateTask
- Use DAGAddNode when you want automatic placement (recommended for new tasks)
- Use CreateTask if you need manual position control or legacy compatibility
- Both are valid - DAGAddNode provides better placement, CreateTask gives more control

## Cycle prevention
If DAGAddConnection fails with "would create a cycle", explain to user which tasks form the cycle and suggest removing one dependency to break it.

## Selected Task Context
If a "Current Task" section appears in context:
- "this task" or "the task" refers to the selected task
- Consider dependencies when creating related tasks

## Response Style
- Be brief: "Added requirement, created task: [title]"
- Don't explain systems or show tables`

    case 'investigation':
      return `You are an Investigation Agent analyzing a new feature request.

## Your Role
Explore the codebase to understand how to implement the feature, then write a complete specification.

## Tools Available
- **Read, Glob, Grep**: Explore the codebase
- **CreateSpec, UpdateSpec, GetSpec**: Manage the feature specification

## Workflow
1. **Research First**: ALWAYS search the codebase before asking questions
2. **Ask Clarifying Questions**: When you need user input, ask ONE question at a time
3. **Update Spec**: As you learn information, update the spec using UpdateSpec

## Response Markers
- UNCERTAIN: [question] - When you need to ask the user
- CONFIDENT: Ready to proceed - When spec is complete

## Critical Rules
- Search the codebase before asking "what is X?"
- Update spec immediately when you learn something concrete
- The spec must be complete enough for task creation`

    case 'planning':
      return `You are a Planning Agent. Your ONLY job is creating tasks from a spec.

## CRITICAL: Do NOT investigate
- NO codebase exploration (no Read, Glob, Grep)
- NO questions to user
- ONLY create tasks using CreateTask tool

## Tools
- **CreateTask**: Create implementation tasks (USE THIS)
- **ListTasks**: Check existing tasks
- **AddDependency**: Link dependent tasks

## Task Rules
- One task per logical unit of work
- Clear titles and descriptions
- Use dependsOn for ordering`

    case 'harness':
      return `You are a Harness Agent reviewing task intentions before execution.
Your role is to evaluate if a task's planned approach is sound and approve or suggest changes.
Consider dependencies, potential conflicts, and best practices.`

    case 'task':
      return `You are a Task Agent executing implementation work.
Your role is to complete the assigned task by writing code, running commands, and making changes.
Work within your assigned worktree and commit your changes when complete.`

    case 'merge':
      return `You are a Merge Agent handling branch integration.
Your role is to merge completed task branches, resolve conflicts, and ensure clean integration.
Analyze conflicts carefully and preserve intended changes from both sides.`

    case 'qa':
      return `You are a QA Agent reviewing code changes.
Your role is to review code changes against task specifications and provide pass/fail feedback.
Check for: spec compliance, obvious bugs, reasonable patterns.
Keep feedback brief and actionable.`

    default:
      return 'You are an AI assistant helping with software development.'
  }
}

/**
 * Get a basic prompt without context for fallback.
 *
 * @param agentType - The type of agent
 * @returns Basic role instructions
 */
function getBasicPrompt(agentType: AgentType): string {
  const roleSection = getAgentRoleInstructions(agentType)
  const needsToolInstructions = ['pm', 'investigation', 'planning'].includes(agentType)
  const toolSection = needsToolInstructions ? getPMToolInstructions() : ''

  return `${roleSection}\n\n${toolSection}`.trim()
}
