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

  // PM Agent - read + full task management (CRUD + dependency inference)
  pmAgent: ['Read', 'Glob', 'Grep', 'CreateTask', 'ListTasks', 'AddDependency', 'GetTask', 'UpdateTask', 'DeleteTask'],

  // No tools - basic chat only
  none: []
} as const

export type ToolPreset = keyof typeof TOOL_PRESETS

export function getToolsForPreset(preset: ToolPreset): string[] {
  return [...TOOL_PRESETS[preset]]
}
