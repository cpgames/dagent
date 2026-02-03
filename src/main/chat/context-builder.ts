import type { Feature, DAGGraph, TaskStatus } from '@shared/types'

export interface FeatureContext {
  featureId: string
  featureName: string
  goal: string
  tasks: TaskSummary[]
  dagSummary: string
}

interface TaskSummary {
  id: string
  title: string
  status: TaskStatus
  spec?: string
}

export function buildFeatureContext(feature: Feature, dag: DAGGraph | null): FeatureContext {
  const tasks: TaskSummary[] =
    dag?.nodes.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      spec: t.spec
    })) || []

  const statusCounts = tasks.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const dagSummary =
    Object.entries(statusCounts)
      .map(([status, count]) => `${status}: ${count}`)
      .join(', ') || 'No tasks'

  return {
    featureId: feature.id,
    featureName: feature.name,
    goal: `Feature: ${feature.name}`, // Feature doesn't have goal field, use name
    tasks,
    dagSummary
  }
}

export function buildSystemPrompt(context: FeatureContext): string {
  const taskList =
    context.tasks.length > 0
      ? context.tasks
          .map((t) => `- [${t.status}] ${t.title}${t.spec ? `: ${t.spec}` : ''}`)
          .join('\n')
      : 'No tasks defined yet.'

  return `You are an AI assistant helping with a software development feature.

## Current Feature
**Name:** ${context.featureName}
**Goal:** ${context.goal}

## Task Status
${context.dagSummary}

## Task List
${taskList}

## Your Role
- Help the user plan, execute, and complete tasks for this feature
- Provide guidance on next steps based on task dependencies and status
- Answer questions about the feature implementation
- Suggest improvements to the task breakdown if asked

Be concise and actionable in your responses. Focus on helping complete the feature.`
}
