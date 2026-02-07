// src/main/agent/tool-config.ts

// Tool presets for different chat contexts
export const TOOL_PRESETS = {
  // Feature planning chat - read-only exploration
  featureChat: ['Read', 'Glob', 'Grep'],

  // Task execution - full capabilities
  taskAgent: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],

  // Harness agent - read + intent generation
  harnessAgent: ['Read', 'Glob', 'Grep'],

  // Merge agent - read + conflict analysis
  mergeAgent: ['Read', 'Glob', 'Grep', 'Bash'],

  // QA Agent - read-only code review (no write/edit)
  qaAgent: ['Read', 'Glob', 'Grep', 'Bash'],

  // Feature Agent - read + task management + spec management + DAG operations
  featureAgent: ['Read', 'Glob', 'Grep', 'CreateTask', 'ListTasks', 'AddDependency', 'RemoveDependency', 'GetTask', 'UpdateTask', 'DeleteTask', 'CreateSpec', 'UpdateSpec', 'GetSpec', 'DAGAddNode', 'DAGAddConnection', 'DAGRemoveNode', 'DAGRemoveConnection'],

  // Project Agent - codebase exploration + CLAUDE.md + feature management
  projectAgent: ['Read', 'Glob', 'Grep', 'WriteClaudeMd', 'GetFeatures', 'AddFeature'],

  // No tools - basic chat only
  none: []
} as const

export type ToolPreset = keyof typeof TOOL_PRESETS

export function getToolsForPreset(preset: ToolPreset): string[] {
  return [...TOOL_PRESETS[preset]]
}
