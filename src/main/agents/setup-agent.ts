/**
 * Setup Agent - Conversational agent for project investigation and CLAUDE.md generation.
 *
 * Unlike DevAgent which operates in git worktrees, SetupAgent works directly on the
 * project root and has limited tools for file inspection and CLAUDE.md writing.
 */

import { EventEmitter } from 'events'
import * as fs from 'fs/promises'
import * as path from 'path'
import { glob } from 'glob'
import { getAgentService } from '../agent'
import { ContextService } from '../context'
import type {
  SetupAgentState,
  SetupAgentStatus,
  ProjectInspection,
  TechStackInfo,
  ProjectStructureInfo
} from './setup-types'

/**
 * SetupAgent - Handles conversational project investigation and CLAUDE.md generation.
 */
export class SetupAgent extends EventEmitter {
  private state: SetupAgentState
  private contextService: ContextService

  constructor(projectRoot: string) {
    super()
    this.contextService = new ContextService(projectRoot)
    this.state = {
      status: 'idle',
      projectRoot,
      inspection: null,
      claudeMdDraft: null,
      error: null,
      sessionId: `setup-${Date.now()}`
    }
  }

  /**
   * Inspect the project to determine type and tech stack.
   */
  async inspectProject(): Promise<ProjectInspection> {
    this.updateStatus('inspecting')
    this.emit('setup-agent:inspecting')

    try {
      // Get project structure
      const structure = await this.contextService.getProjectStructure()

      // Check for CLAUDE.md
      const claudeMd = await this.contextService.getClaudeMd()
      const hasClaudeMd = claudeMd !== null

      // Detect tech stack from config files
      const techStack = await this.detectTechStack()

      // Count source files
      const fileCount = await this.countSourceFiles()

      // Determine if project is empty
      const isEmptyProject =
        fileCount === 0 && structure.configFiles.length === 0 && structure.srcDirs.length === 0

      const structureInfo: ProjectStructureInfo = {
        srcDirs: structure.srcDirs,
        hasTests: structure.hasTests,
        hasDocs: structure.hasDocs,
        fileCount
      }

      const inspection: ProjectInspection = {
        type: isEmptyProject ? 'empty' : 'brownfield',
        hasClaudeMd,
        techStack: isEmptyProject ? undefined : techStack,
        structure: structureInfo
      }

      this.state.inspection = inspection
      this.updateStatus('conversing')
      this.emit('setup-agent:inspection-complete', inspection)

      return inspection
    } catch (error) {
      this.state.error = (error as Error).message
      this.updateStatus('error')
      throw error
    }
  }

  /**
   * Build a context-aware greeting message based on inspection results.
   */
  buildGreetingMessage(): string {
    const inspection = this.state.inspection
    if (!inspection) {
      return "Hello! I'll help you set up your project documentation. Let me take a quick look at your project first."
    }

    if (inspection.type === 'empty') {
      return `Hello! I see this is a new project with no code yet.

**What would you like to build?**

Tell me about your project - what it does, what technologies you plan to use, and any specific patterns or conventions you want to follow. I'll help create a CLAUDE.md file to guide AI assistants working with your code.`
    }

    // Brownfield project - build descriptive greeting
    const tech = inspection.techStack
    let techDescription = 'an existing codebase'

    if (tech) {
      const parts: string[] = []
      if (tech.frameworks.length > 0) {
        parts.push(tech.frameworks.join('/'))
      }
      if (tech.languages.length > 0) {
        parts.push(`using ${tech.languages.join(' and ')}`)
      }
      if (parts.length > 0) {
        techDescription = `a ${parts.join(' ')} project`
      }
    }

    const structure = inspection.structure
    const structureDetails: string[] = []
    if (structure) {
      if (structure.fileCount > 0) {
        structureDetails.push(`${structure.fileCount} source files`)
      }
      if (structure.srcDirs.length > 0) {
        structureDetails.push(`source in ${structure.srcDirs.slice(0, 3).join(', ')}${structure.srcDirs.length > 3 ? '...' : ''}`)
      }
      if (structure.hasTests) {
        structureDetails.push('tests')
      }
    }

    let greeting = `Hello! I can see you have ${techDescription}.`

    if (structureDetails.length > 0) {
      greeting += ` I found ${structureDetails.join(', ')}.`
    }

    if (inspection.hasClaudeMd) {
      greeting += `\n\nI notice you already have a **CLAUDE.md** file. Would you like me to review and update it, or would you prefer to regenerate it from scratch?`
    } else {
      greeting += `\n\nI notice you don't have a **CLAUDE.md** file yet. I can explore your codebase and help create one that documents your project's architecture, conventions, and important patterns.`
    }

    greeting += `\n\nWhat aspects of your project would you like documented for AI assistants? Feel free to ask me to explore specific parts of the codebase.`

    return greeting
  }

  /**
   * Stream a conversation turn with the user.
   */
  async *streamConversation(userMessage: string): AsyncGenerator<unknown> {
    this.updateStatus('conversing')

    const systemPrompt = this.buildSystemPrompt()
    const agentService = getAgentService()

    try {
      for await (const event of agentService.streamQuery({
        prompt: userMessage,
        systemPrompt,
        toolPreset: 'projectAgent',
        permissionMode: 'bypassPermissions',
        cwd: this.state.projectRoot,
        agentType: 'project',
        agentId: this.state.sessionId || `setup-${Date.now()}`
      })) {
        yield event
      }
    } catch (error) {
      this.state.error = (error as Error).message
      this.updateStatus('error')
      throw error
    }
  }

  /**
   * Write CLAUDE.md content to the project root.
   */
  async writeClaudeMd(content: string): Promise<{ success: boolean; error?: string }> {
    this.updateStatus('generating')

    try {
      const claudeMdPath = path.join(this.state.projectRoot, 'CLAUDE.md')
      await fs.writeFile(claudeMdPath, content, 'utf-8')
      this.state.claudeMdDraft = content
      this.updateStatus('completed')
      this.emit('setup-agent:claude-md-written')
      return { success: true }
    } catch (error) {
      this.state.error = (error as Error).message
      this.updateStatus('error')
      return { success: false, error: this.state.error }
    }
  }

  /**
   * Get current agent state.
   */
  getState(): SetupAgentState {
    return { ...this.state }
  }

  /**
   * Reset agent to initial state.
   */
  reset(): void {
    this.state = {
      status: 'idle',
      projectRoot: this.state.projectRoot,
      inspection: null,
      claudeMdDraft: null,
      error: null,
      sessionId: `setup-${Date.now()}`
    }
    this.emit('setup-agent:reset')
  }

  /**
   * Build the system prompt for the agent.
   */
  private buildSystemPrompt(): string {
    const inspection = this.state.inspection

    return `You are the Setup Agent for DAGent, a project management tool for AI-assisted development.

Your role is to have a natural conversation with the user to understand their project and create appropriate CLAUDE.md documentation.

## Project Information
${
  inspection
    ? `
- **Project Type:** ${inspection.type === 'empty' ? 'New/Empty Project' : 'Existing Codebase'}
- **Has CLAUDE.md:** ${inspection.hasClaudeMd ? 'Yes' : 'No'}
${
  inspection.techStack
    ? `- **Tech Stack:** ${[...inspection.techStack.frameworks, ...inspection.techStack.languages].join(', ')}`
    : ''
}
${
  inspection.structure
    ? `- **Source Directories:** ${inspection.structure.srcDirs.join(', ') || 'None detected'}
- **Has Tests:** ${inspection.structure.hasTests ? 'Yes' : 'No'}
- **File Count:** ${inspection.structure.fileCount}`
    : ''
}
`
    : 'Project inspection pending'
}

## Your Capabilities

1. **Explore the codebase** using Read, Glob, and Grep tools to understand the project structure
2. **Write CLAUDE.md** using the WriteClaudeMd tool when you have enough information

## Guidelines

- Have a **natural conversation** - don't follow a rigid questionnaire format
- **Ask clarifying questions** when needed to understand the project better
- **Use your tools** to inspect the codebase and verify information the user provides
- When you have gathered enough information, use the **WriteClaudeMd** tool to create the file
- Keep CLAUDE.md **concise but comprehensive**
- Focus on information that will help AI assistants work effectively with the code

## CLAUDE.md Structure

When writing CLAUDE.md, include relevant sections:

\`\`\`markdown
# CLAUDE.md

## Project Overview
Brief description of what the project does and its purpose.

## Tech Stack
Key technologies, frameworks, and tools used.

## Build & Development Commands
Common commands for building, testing, and running the project.

## Architecture Overview
Key architectural decisions and patterns used.

## Code Conventions
Coding standards, naming conventions, and style guidelines.

## Important Files & Directories
Key files and their purposes.

## Additional Notes
Any other important information for AI assistants.
\`\`\`

Adapt this structure based on the project - not all sections may be relevant for every project.`
  }

  /**
   * Detect the project's tech stack from config files.
   */
  private async detectTechStack(): Promise<TechStackInfo> {
    const techStack: TechStackInfo = {
      languages: [],
      frameworks: [],
      buildTools: [],
      configFiles: []
    }

    try {
      // Check for package.json (Node.js/JavaScript)
      const packageJsonPath = path.join(this.state.projectRoot, 'package.json')
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
        techStack.configFiles.push('package.json')

        // Detect languages from devDependencies
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
        if (deps.typescript) {
          techStack.languages.push('TypeScript')
        } else {
          techStack.languages.push('JavaScript')
        }

        // Detect frameworks
        if (deps.react) techStack.frameworks.push('React')
        if (deps.vue) techStack.frameworks.push('Vue')
        if (deps.angular || deps['@angular/core']) techStack.frameworks.push('Angular')
        if (deps.svelte) techStack.frameworks.push('Svelte')
        if (deps.electron) techStack.frameworks.push('Electron')
        if (deps.next) techStack.frameworks.push('Next.js')
        if (deps.express) techStack.frameworks.push('Express')
        if (deps.fastify) techStack.frameworks.push('Fastify')
        if (deps.nest || deps['@nestjs/core']) techStack.frameworks.push('NestJS')

        // Detect build tools
        if (deps.vite) techStack.buildTools.push('Vite')
        if (deps.webpack) techStack.buildTools.push('Webpack')
        if (deps.esbuild) techStack.buildTools.push('esbuild')
        if (deps.rollup) techStack.buildTools.push('Rollup')
        if (packageJson.scripts?.build?.includes('tsc')) techStack.buildTools.push('tsc')
      } catch {
        // No package.json or couldn't parse it
      }

      // Check for Cargo.toml (Rust)
      try {
        await fs.access(path.join(this.state.projectRoot, 'Cargo.toml'))
        techStack.languages.push('Rust')
        techStack.configFiles.push('Cargo.toml')
        techStack.buildTools.push('Cargo')
      } catch {
        // No Cargo.toml
      }

      // Check for go.mod (Go)
      try {
        await fs.access(path.join(this.state.projectRoot, 'go.mod'))
        techStack.languages.push('Go')
        techStack.configFiles.push('go.mod')
      } catch {
        // No go.mod
      }

      // Check for pyproject.toml or requirements.txt (Python)
      try {
        await fs.access(path.join(this.state.projectRoot, 'pyproject.toml'))
        techStack.languages.push('Python')
        techStack.configFiles.push('pyproject.toml')
      } catch {
        try {
          await fs.access(path.join(this.state.projectRoot, 'requirements.txt'))
          techStack.languages.push('Python')
          techStack.configFiles.push('requirements.txt')
        } catch {
          // No Python config files
        }
      }

      // Check for tsconfig.json
      try {
        await fs.access(path.join(this.state.projectRoot, 'tsconfig.json'))
        techStack.configFiles.push('tsconfig.json')
        if (!techStack.languages.includes('TypeScript')) {
          techStack.languages.push('TypeScript')
        }
      } catch {
        // No tsconfig.json
      }
    } catch (error) {
      console.error('[SetupAgent] Error detecting tech stack:', error)
    }

    return techStack
  }

  /**
   * Count source files in the project.
   */
  private async countSourceFiles(): Promise<number> {
    try {
      const patterns = [
        '**/*.ts',
        '**/*.tsx',
        '**/*.js',
        '**/*.jsx',
        '**/*.py',
        '**/*.rs',
        '**/*.go',
        '**/*.java',
        '**/*.cpp',
        '**/*.c',
        '**/*.h'
      ]

      let totalCount = 0
      for (const pattern of patterns) {
        const files = await glob(pattern, {
          cwd: this.state.projectRoot,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/target/**', '**/.dagent/**', '**/.dagent-worktrees/**']
        })
        totalCount += files.length
      }

      return totalCount
    } catch (error) {
      console.error('[SetupAgent] Error counting source files:', error)
      return 0
    }
  }

  /**
   * Update agent status and emit event.
   */
  private updateStatus(status: SetupAgentStatus): void {
    this.state.status = status
    this.emit('setup-agent:status-changed', status)
  }
}

// ============================================
// Singleton Management
// ============================================

let setupAgentInstance: SetupAgent | null = null

/**
 * Get or create the SetupAgent singleton for a project.
 */
export function getSetupAgent(projectRoot: string): SetupAgent {
  if (!setupAgentInstance || setupAgentInstance.getState().projectRoot !== projectRoot) {
    setupAgentInstance = new SetupAgent(projectRoot)
  }
  return setupAgentInstance
}

/**
 * Reset the SetupAgent singleton.
 */
export function resetSetupAgent(): void {
  if (setupAgentInstance) {
    setupAgentInstance.reset()
  }
  setupAgentInstance = null
}
