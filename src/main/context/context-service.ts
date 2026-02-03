/**
 * ContextService - Provides comprehensive project and codebase context for all agents.
 * Assembles context from project structure, CLAUDE.md, PROJECT.md, git history,
 * and current feature/task information.
 */

import { simpleGit, SimpleGit } from 'simple-git'
import { promises as fs } from 'fs'
import * as path from 'path'
import type { Task, TaskStatus } from '@shared/types'
import { buildFeatureContext, type FeatureContext } from '../chat/context-builder'
import { FeatureStore } from '../storage/feature-store'

/**
 * Extended feature context (same as FeatureContext - questions removed from spec).
 */
export type ExtendedFeatureContext = FeatureContext

// ============================================
// Types
// ============================================

/**
 * Summary of project directory structure.
 */
export interface ProjectStructure {
  srcDirs: string[]
  configFiles: string[]
  hasTests: boolean
  hasDocs: boolean
}

/**
 * Git commit information.
 */
export interface GitCommit {
  hash: string
  message: string
  author: string
  date: string
}

/**
 * Full project context including structure, docs, and git history.
 */
export interface ProjectContext {
  structure: ProjectStructure
  claudeMd: string | null
  projectMd: string | null
  recentCommits: GitCommit[]
}

/**
 * Task context with dependency information.
 */
export interface TaskContext {
  task: Task
  dependencies: TaskDependencyInfo[]
  dependents: TaskDependencyInfo[]
  filePaths: string[]
}

/**
 * Simplified dependency info for context.
 */
export interface TaskDependencyInfo {
  id: string
  title: string
  status: TaskStatus
}

/**
 * Options for building context.
 */
export interface ContextOptions {
  featureId?: string
  taskId?: string
  includeGitHistory?: boolean
  includeClaudeMd?: boolean
  maxCommits?: number
}

/**
 * Full context combining project, feature, and task information.
 */
export interface FullContext {
  project: ProjectContext
  feature?: ExtendedFeatureContext
  task?: TaskContext
}

// ============================================
// ContextService Class
// ============================================

export class ContextService {
  private git: SimpleGit
  private projectRoot: string

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
    this.git = simpleGit({ baseDir: projectRoot })
  }

  /**
   * Get the project root path.
   */
  getProjectRoot(): string {
    return this.projectRoot
  }

  /**
   * Get project directory structure summary.
   */
  async getProjectStructure(): Promise<ProjectStructure> {
    const structure: ProjectStructure = {
      srcDirs: [],
      configFiles: [],
      hasTests: false,
      hasDocs: false
    }

    try {
      const entries = await fs.readdir(this.projectRoot, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Check for common source directories
          if (['src', 'lib', 'app', 'packages'].includes(entry.name)) {
            // Look for subdirectories within src
            if (entry.name === 'src') {
              const srcPath = path.join(this.projectRoot, 'src')
              const srcEntries = await fs.readdir(srcPath, { withFileTypes: true }).catch(() => [])
              for (const srcEntry of srcEntries) {
                if (srcEntry.isDirectory()) {
                  structure.srcDirs.push(`src/${srcEntry.name}`)
                }
              }
            } else {
              structure.srcDirs.push(entry.name)
            }
          }

          // Check for tests
          if (['test', 'tests', '__tests__', 'spec'].includes(entry.name)) {
            structure.hasTests = true
          }

          // Check for docs
          if (['docs', 'documentation'].includes(entry.name)) {
            structure.hasDocs = true
          }
        } else if (entry.isFile()) {
          // Check for config files
          const configPatterns = [
            'package.json',
            'tsconfig.json',
            'electron-builder.yml',
            'vite.config.ts',
            'eslint.config.mjs',
            '.prettierrc.yaml',
            '.env',
            'Cargo.toml',
            'pyproject.toml',
            'go.mod'
          ]
          if (configPatterns.includes(entry.name)) {
            structure.configFiles.push(entry.name)
          }
        }
      }
    } catch (error) {
      console.error('[ContextService] Failed to read project structure:', error)
    }

    return structure
  }

  /**
   * Read CLAUDE.md from project root if it exists.
   */
  async getClaudeMd(): Promise<string | null> {
    const claudeMdPath = path.join(this.projectRoot, 'CLAUDE.md')
    try {
      const content = await fs.readFile(claudeMdPath, 'utf-8')
      return content
    } catch {
      return null
    }
  }

  /**
   * Read PROJECT.md from project root if it exists.
   */
  async getProjectMd(): Promise<string | null> {
    const projectMdPath = path.join(this.projectRoot, 'PROJECT.md')
    try {
      const content = await fs.readFile(projectMdPath, 'utf-8')
      return content
    } catch {
      return null
    }
  }

  /**
   * Get recent git commit history.
   */
  async getRecentGitHistory(limit: number = 10): Promise<GitCommit[]> {
    try {
      const isRepo = await this.git.checkIsRepo()
      if (!isRepo) {
        return []
      }

      // Check if repo has any commits by trying to get HEAD
      // Fresh repos with no commits will fail this check
      try {
        await this.git.revparse(['HEAD'])
      } catch {
        // No commits yet - return empty array
        return []
      }

      const log = await this.git.log({ maxCount: limit })
      return log.all.map((entry) => ({
        hash: entry.hash.substring(0, 7),
        message: entry.message,
        author: entry.author_name,
        date: entry.date
      }))
    } catch (error) {
      console.error('[ContextService] Failed to get git history:', error)
      return []
    }
  }

  /**
   * Build comprehensive project context.
   */
  async buildProjectContext(): Promise<ProjectContext> {
    const [structure, claudeMd, projectMd, recentCommits] = await Promise.all([
      this.getProjectStructure(),
      this.getClaudeMd(),
      this.getProjectMd(),
      this.getRecentGitHistory()
    ])

    return {
      structure,
      claudeMd,
      projectMd,
      recentCommits
    }
  }

  /**
   * Get feature context using existing buildFeatureContext helper.
   * Also loads spec Q&A for PM agent context.
   */
  async getFeatureContext(featureId: string): Promise<ExtendedFeatureContext | null> {
    try {
      const featureStore = new FeatureStore(this.projectRoot)
      const feature = await featureStore.loadFeature(featureId)
      if (!feature) {
        return null
      }

      const dag = await featureStore.loadDag(featureId)
      const baseContext = buildFeatureContext(feature, dag)

      return baseContext
    } catch (error) {
      console.error('[ContextService] Failed to get feature context:', error)
      return null
    }
  }

  /**
   * Get task context with dependencies and dependents.
   */
  async getTaskContext(taskId: string, featureId: string): Promise<TaskContext | null> {
    try {
      const featureStore = new FeatureStore(this.projectRoot)
      const dag = await featureStore.loadDag(featureId)
      if (!dag) {
        return null
      }

      // Find the task
      const task = dag.nodes.find((n) => n.id === taskId)
      if (!task) {
        return null
      }

      // Get task's dependencies (upstream tasks)
      const dependencyIds = new Set<string>()
      for (const conn of dag.connections) {
        if (conn.to === taskId) {
          dependencyIds.add(conn.from)
        }
      }

      const dependencies: TaskDependencyInfo[] = dag.nodes
        .filter((n) => dependencyIds.has(n.id))
        .map((n) => ({
          id: n.id,
          title: n.title,
          status: n.status
        }))

      // Get task's dependents (downstream tasks)
      const dependentIds = new Set<string>()
      for (const conn of dag.connections) {
        if (conn.from === taskId) {
          dependentIds.add(conn.to)
        }
      }

      const dependents: TaskDependencyInfo[] = dag.nodes
        .filter((n) => dependentIds.has(n.id))
        .map((n) => ({
          id: n.id,
          title: n.title,
          status: n.status
        }))

      // File paths would come from task metadata (not currently in Task type)
      const filePaths: string[] = []

      return {
        task,
        dependencies,
        dependents,
        filePaths
      }
    } catch (error) {
      console.error('[ContextService] Failed to get task context:', error)
      return null
    }
  }

  /**
   * Build full context based on options.
   */
  async buildFullContext(options: ContextOptions = {}): Promise<FullContext> {
    const {
      featureId,
      taskId,
      includeGitHistory = true,
      includeClaudeMd = true,
      maxCommits = 10
    } = options

    // Build project context
    const [structure, claudeMd, projectMd, recentCommits] = await Promise.all([
      this.getProjectStructure(),
      includeClaudeMd ? this.getClaudeMd() : Promise.resolve(null),
      this.getProjectMd(),
      includeGitHistory ? this.getRecentGitHistory(maxCommits) : Promise.resolve([])
    ])

    const project: ProjectContext = {
      structure,
      claudeMd,
      projectMd,
      recentCommits
    }

    const result: FullContext = { project }

    // Add feature context if featureId provided
    if (featureId) {
      const featureContext = await this.getFeatureContext(featureId)
      if (featureContext) {
        result.feature = featureContext
      }
    }

    // Add task context if taskId and featureId provided
    if (taskId && featureId) {
      const taskContext = await this.getTaskContext(taskId, featureId)
      if (taskContext) {
        result.task = taskContext
      }
    }

    return result
  }

  /**
   * Format context as a structured prompt for agents.
   */
  formatContextAsPrompt(context: FullContext): string {
    const sections: string[] = []

    // Project Context Section
    sections.push('## Project Context')
    sections.push('')

    // Structure
    const { structure } = context.project
    sections.push('**Project Structure:**')
    if (structure.srcDirs.length > 0) {
      sections.push(`- Source directories: ${structure.srcDirs.join(', ')}`)
    }
    if (structure.configFiles.length > 0) {
      sections.push(`- Config files: ${structure.configFiles.join(', ')}`)
    }
    sections.push(`- Has tests: ${structure.hasTests ? 'Yes' : 'No'}`)
    sections.push(`- Has docs: ${structure.hasDocs ? 'Yes' : 'No'}`)
    sections.push('')

    // CLAUDE.md
    sections.push('**CLAUDE.md Guidelines:**')
    if (context.project.claudeMd) {
      sections.push(context.project.claudeMd)
    } else {
      sections.push('No CLAUDE.md found')
    }
    sections.push('')

    // PROJECT.md (if exists)
    if (context.project.projectMd) {
      sections.push('**PROJECT.md:**')
      sections.push(context.project.projectMd)
      sections.push('')
    }

    // Recent Git Activity
    if (context.project.recentCommits.length > 0) {
      sections.push('**Recent Git Activity:**')
      for (const commit of context.project.recentCommits.slice(0, 5)) {
        const relativeDate = this.formatRelativeDate(commit.date)
        sections.push(`- ${commit.hash}: ${commit.message} (${relativeDate})`)
      }
      sections.push('')
    }

    // Feature Context Section
    if (context.feature) {
      sections.push('## Current Feature')
      sections.push(`**Name:** ${context.feature.featureName}`)
      sections.push(`**Goal:** ${context.feature.goal}`)
      sections.push(`**Tasks:** ${context.feature.dagSummary}`)
      sections.push('')

      if (context.feature.tasks.length > 0) {
        sections.push('**Task List:**')
        for (const task of context.feature.tasks) {
          sections.push(
            `- [${task.status}] ${task.title}${task.spec ? `: ${task.spec}` : ''}`
          )
        }
        sections.push('')
      }

      // Note: Q&A is now tracked in chat history, not in spec
    }

    // Task Context Section
    if (context.task) {
      sections.push('## Current Task')
      sections.push(`**ID:** ${context.task.task.id}`)
      sections.push(`**Title:** ${context.task.task.title}`)
      sections.push(`**Status:** ${context.task.task.status}`)
      if (context.task.task.spec) {
        sections.push(`**Spec:** ${context.task.task.spec}`)
      }
      sections.push('')

      if (context.task.dependencies.length > 0) {
        sections.push('**Dependencies (must complete before this task):**')
        for (const dep of context.task.dependencies) {
          sections.push(`- [${dep.status}] ${dep.title}`)
        }
        sections.push('')
      }

      if (context.task.dependents.length > 0) {
        sections.push('**Dependents (blocked by this task):**')
        for (const dep of context.task.dependents) {
          sections.push(`- [${dep.status}] ${dep.title}`)
        }
        sections.push('')
      }

      if (context.task.filePaths.length > 0) {
        sections.push('**Related Files:**')
        for (const filePath of context.task.filePaths) {
          sections.push(`- ${filePath}`)
        }
        sections.push('')
      }
    }

    return sections.join('\n')
  }

  /**
   * Format a date as relative time (e.g., "2 days ago").
   */
  private formatRelativeDate(dateString: string): string {
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays === 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        if (diffHours === 0) {
          const diffMinutes = Math.floor(diffMs / (1000 * 60))
          return diffMinutes <= 1 ? 'just now' : `${diffMinutes} minutes ago`
        }
        return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
      }
      if (diffDays === 1) return '1 day ago'
      if (diffDays < 7) return `${diffDays} days ago`
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
      return `${Math.floor(diffDays / 30)} months ago`
    } catch {
      return dateString
    }
  }
}

// ============================================
// Singleton
// ============================================

let contextService: ContextService | null = null

export function getContextService(): ContextService | null {
  return contextService
}

export function initContextService(projectRoot: string): ContextService {
  contextService = new ContextService(projectRoot)
  return contextService
}

export function resetContextService(): void {
  contextService = null
}
