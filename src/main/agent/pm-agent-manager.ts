import { EventEmitter } from 'events'
import type { FeatureStore } from '../storage/feature-store'
import { getFeatureDir } from '../storage/paths'
import { AgentService } from './agent-service'
import { FeatureStatusManager } from '../services/feature-status-manager'
import * as path from 'path'
import * as fs from 'fs/promises'

/**
 * PMAgentManager - Manages PM agent lifecycle for feature planning workflow.
 *
 * Responsibilities:
 * - Start PM agent when a new feature is created
 * - Load feature context (description, attachments)
 * - Monitor PM agent progress
 * - Move feature to backlog when planning completes
 * - Handle planning failures gracefully
 */
export class PMAgentManager {
  private agentService: AgentService
  private featureStore: FeatureStore
  private statusManager: FeatureStatusManager
  private eventEmitter: EventEmitter
  private projectRoot: string

  constructor(
    agentService: AgentService,
    featureStore: FeatureStore,
    statusManager: FeatureStatusManager,
    eventEmitter: EventEmitter,
    projectRoot: string
  ) {
    this.agentService = agentService
    this.featureStore = featureStore
    this.statusManager = statusManager
    this.eventEmitter = eventEmitter
    this.projectRoot = projectRoot
  }

  /**
   * Start planning workflow for a feature.
   * Runs asynchronously - does not block feature creation.
   *
   * @param featureId - Feature ID
   * @param featureName - Feature name
   * @param description - Optional feature description
   * @param attachments - Optional array of attachment file paths
   */
  async startPlanningForFeature(
    featureId: string,
    featureName: string,
    description?: string,
    attachments?: string[]
  ): Promise<void> {
    console.log(`[PMAgentManager] Starting planning for feature: ${featureName} (${featureId})`)

    try {
      // Step 1: Load feature context
      const context = await this.loadFeatureContext(featureId, featureName, description, attachments)

      // Step 2: Build planning prompt
      const prompt = this.buildPlanningPrompt(featureName, context)

      // Step 3: Start PM agent
      console.log(`[PMAgentManager] Starting PM agent for ${featureId}`)
      const featureWorktreePath = path.join(this.projectRoot, '.dagent-worktrees', featureId)

      let hasError = false
      let retryCount = 0
      const maxRetries = 1

      while (retryCount <= maxRetries && !hasError) {
        try {
          // Stream PM agent execution
          for await (const event of this.agentService.streamQuery({
            prompt,
            agentType: 'pm',
            featureId,
            cwd: featureWorktreePath,
            toolPreset: 'pmAgent',
            autoContext: false, // We're providing explicit context
            permissionMode: 'acceptEdits'
          })) {
            // Log progress
            if (event.type === 'message' && event.message) {
              console.log(`[PMAgentManager] PM: ${event.message.content.slice(0, 100)}...`)
            } else if (event.type === 'error') {
              console.error(`[PMAgentManager] PM error: ${event.error}`)
              hasError = true
            } else if (event.type === 'tool_use' && event.message && event.message.toolName) {
              console.log(`[PMAgentManager] PM using tool: ${event.message.toolName}`)
            }
          }

          // If we got here without error, break the retry loop
          if (!hasError) {
            break
          }
        } catch (error) {
          console.error(`[PMAgentManager] PM agent execution error:`, error)
          hasError = true
          retryCount++

          if (retryCount <= maxRetries) {
            console.log(`[PMAgentManager] Retrying... (${retryCount}/${maxRetries})`)
            hasError = false // Reset for retry
          }
        }
      }

      // Step 4: Verify completion
      if (!hasError) {
        const verified = await this.verifyPlanningComplete(featureId)

        if (verified) {
          // Step 5: Move feature to backlog
          console.log(`[PMAgentManager] Planning complete for ${featureId}, moving to backlog`)
          await this.statusManager.updateFeatureStatus(featureId, 'backlog')

          // Emit completion event
          this.eventEmitter.emit('planning-complete', {
            featureId,
            success: true,
            timestamp: new Date().toISOString()
          })
        } else {
          throw new Error('Planning verification failed: spec.md or DAG tasks not created')
        }
      } else {
        throw new Error('PM agent execution failed after retries')
      }
    } catch (error) {
      // Step 6: Handle failure
      console.error(`[PMAgentManager] Planning failed for ${featureId}:`, error)

      try {
        await this.statusManager.updateFeatureStatus(featureId, 'needs_attention')
      } catch (statusError) {
        console.error(`[PMAgentManager] Failed to update status to needs_attention:`, statusError)
      }

      // Emit failure event
      this.eventEmitter.emit('planning-failed', {
        featureId,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Load feature context from description and attachments.
   * Reads attachment files and assembles context string.
   */
  private async loadFeatureContext(
    featureId: string,
    _featureName: string,
    description?: string,
    attachmentPaths?: string[]
  ): Promise<string> {
    const contextParts: string[] = []

    // Add description if provided
    if (description) {
      contextParts.push(`## Feature Description\n\n${description}`)
    }

    // Add attachment contents if provided
    if (attachmentPaths?.length) {
      contextParts.push('\n## Attached Files\n')

      const featureDir = getFeatureDir(this.projectRoot, featureId)

      for (const relPath of attachmentPaths) {
        try {
          const fullPath = path.join(featureDir, '..', relPath) // relPath is relative to feature worktree root
          const fileName = path.basename(fullPath)
          const ext = path.extname(fileName).toLowerCase()

          // Read file based on type
          if (['.md', '.txt', '.csv', '.json'].includes(ext)) {
            // Text files - read content
            const content = await fs.readFile(fullPath, 'utf-8')
            contextParts.push(`\n### ${fileName}\n\n\`\`\`\n${content}\n\`\`\`\n`)
          } else if (['.png', '.jpg', '.jpeg', '.gif', '.pdf'].includes(ext)) {
            // Binary files - just mention them
            contextParts.push(`\n### ${fileName}\n\n[Attached file: ${fileName}]\n`)
          } else {
            // Unknown type - try to read as text
            try {
              const content = await fs.readFile(fullPath, 'utf-8')
              contextParts.push(`\n### ${fileName}\n\n\`\`\`\n${content}\n\`\`\`\n`)
            } catch {
              contextParts.push(`\n### ${fileName}\n\n[Attached file: ${fileName}]\n`)
            }
          }
        } catch (error) {
          console.error(`[PMAgentManager] Failed to read attachment ${relPath}:`, error)
          contextParts.push(`\n### ${path.basename(relPath)}\n\n[Failed to read file]\n`)
        }
      }
    }

    return contextParts.join('\n')
  }

  /**
   * Build planning prompt for PM agent.
   * Instructs PM to create spec.md and initial DAG tasks.
   */
  private buildPlanningPrompt(featureName: string, context: string): string {
    return `You are the PM Agent for a new feature: "${featureName}".

Your task is to create a comprehensive feature specification and initial task breakdown.

${context ? `\n${context}\n` : ''}

**Your workflow:**

1. **Create Feature Specification**:
   - Use the CreateSpec tool to create a feature-spec.md file
   - Include:
     - Feature goals and objectives
     - Requirements and acceptance criteria
     - Constraints and considerations
     - Technical approach (if applicable)
   - Base the spec on the feature name${context ? ', description, and attached files' : ' (no additional context provided)'}

2. **Design Initial Task Breakdown**:
   - Use your PM tools (CreateTask, AddDependency) to create an initial DAG of tasks
   - Break the feature into logical, manageable tasks
   - Create at least 2-3 initial tasks
   - Set up dependencies between tasks as needed
   - Each task should have:
     - Clear, descriptive name
     - Detailed description of what needs to be done
     - Proper dependencies (tasks that must complete first)

3. **Verification**:
   - Ensure spec.md is created with comprehensive content
   - Ensure DAG has at least one task created
   - Your work is complete when both spec and tasks are saved

**Important:**
- This is a fully autonomous planning phase
- Do not wait for user input or approval
- Create the spec and tasks, then finish
- The system will automatically move the feature to the Backlog once you're done

Begin planning for "${featureName}".`
  }

  /**
   * Verify that planning completed successfully.
   * Checks for spec.md and at least one DAG task.
   */
  private async verifyPlanningComplete(featureId: string): Promise<boolean> {
    try {
      // Check 1: Verify spec.md exists
      const featureDir = getFeatureDir(this.projectRoot, featureId)
      const specPath = path.join(featureDir, 'feature-spec.md')

      try {
        await fs.access(specPath)
      } catch {
        console.error(`[PMAgentManager] Verification failed: spec.md not found at ${specPath}`)
        return false
      }

      // Check 2: Verify DAG has at least one task
      const dag = await this.featureStore.loadDag(featureId)
      if (!dag || !dag.nodes || dag.nodes.length === 0) {
        console.error(`[PMAgentManager] Verification failed: DAG has no tasks`)
        return false
      }

      console.log(`[PMAgentManager] Verification passed: spec.md exists, ${dag.nodes.length} task(s) created`)
      return true
    } catch (error) {
      console.error(`[PMAgentManager] Verification error:`, error)
      return false
    }
  }
}

/**
 * Export factory function for creating PMAgentManager instance.
 * Used by IPC handlers to get a configured manager.
 */
export function createPMAgentManager(
  agentService: AgentService,
  featureStore: FeatureStore,
  statusManager: FeatureStatusManager,
  eventEmitter: EventEmitter,
  projectRoot: string
): PMAgentManager {
  return new PMAgentManager(agentService, featureStore, statusManager, eventEmitter, projectRoot)
}
