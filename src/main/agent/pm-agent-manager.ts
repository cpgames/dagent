import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import type { FeatureStore } from '../storage/feature-store'
import { getFeatureDir } from '../storage/paths'
import { AgentService } from './agent-service'
import { FeatureStatusManager } from '../services/feature-status-manager'
import { setPMToolsFeatureContext } from '../ipc/pm-tools-handlers'
import { getSessionManager } from '../services/session-manager'
import { getSettingsStore } from '../storage/settings-store'
import { getTaskAnalysisOrchestrator } from '../services/task-analysis-orchestrator'
import { getOrchestrator } from '../dag-engine/orchestrator'
import type { CreateSessionOptions } from '../../shared/types/session'
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
      // Step 0: Set PM tools feature context (CRITICAL - tools won't work without this!)
      setPMToolsFeatureContext(featureId)
      console.log(`[PMAgentManager] Set PM tools feature context to: ${featureId}`)

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

      // Get session manager and create/get PM session for this feature
      const sessionManager = getSessionManager(this.projectRoot)
      const sessionOptions: CreateSessionOptions = {
        type: 'feature',
        agentType: 'pm',
        featureId
      }
      const session = await sessionManager.getOrCreateSession(sessionOptions)
      const sessionId = session.id
      console.log(`[PMAgentManager] Created/loaded PM session: ${sessionId}`)

      // Add user-friendly initial message to session (not the full system prompt)
      const userMessage = description
        ? `Plan feature: ${featureName}\n\n${description}`
        : `Plan feature: ${featureName}`
      await sessionManager.addMessage(sessionId, featureId, {
        role: 'user',
        content: userMessage
      })

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
            // Log progress and save messages to session
            if (event.type === 'message' && event.message) {
              console.log(`[PMAgentManager] PM: ${event.message.content.slice(0, 100)}...`)

              // Save assistant message to session
              // Note: event.message.type (not role) is 'assistant' for assistant messages
              // Filter out system initialization messages and other internal messages
              if (event.message.type === 'assistant' && event.message.content) {
                const content = event.message.content.trim()
                // Skip system messages like "System: init", empty messages, and thinking messages
                const isSystemMessage = content.startsWith('System:') ||
                                       content.startsWith('Thinking:') ||
                                       content.length === 0

                if (!isSystemMessage) {
                  await sessionManager.addMessage(sessionId, featureId, {
                    role: 'assistant',
                    content: event.message.content
                  })
                }
              }
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

      // Session messages are saved automatically via SessionManager.addMessage()
      // Broadcast chat update to UI so it reloads the messages
      try {
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('chat:updated', { featureId })
          }
        }
        console.log(`[PMAgentManager] Broadcast chat update for ${featureId}`)
      } catch (error) {
        console.error(`[PMAgentManager] Failed to broadcast chat update:`, error)
      }

      // Step 4: Verify completion
      console.log(`[PMAgentManager] PM agent stream finished for ${featureId}, hasError=${hasError}`)
      if (!hasError) {
        console.log(`[PMAgentManager] Verifying planning completion for ${featureId}...`)
        const verified = await this.verifyPlanningComplete(featureId)
        console.log(`[PMAgentManager] Verification result for ${featureId}: ${verified}`)

        if (verified) {
          console.log(`[PMAgentManager] Planning complete for ${featureId}`)

          // Step 5: Check if auto-analysis is enabled and run analysis
          const settingsStore = getSettingsStore()
          const autoAnalyze = settingsStore
            ? await settingsStore.get('autoAnalyzeNewFeatures')
            : true // Default to true if store not available

          if (autoAnalyze) {
            console.log(`[PMAgentManager] Auto-analysis enabled, starting analysis for ${featureId}`)

            // Run analysis - iterate through all needs_analysis tasks
            const orchestrator = getTaskAnalysisOrchestrator(this.featureStore)
            try {
              for await (const event of orchestrator.analyzeFeatureTasks(featureId)) {
                console.log(`[PMAgentManager] Analysis event: ${event.type}`)

                // Broadcast analysis events to renderer for UI updates
                const windows = BrowserWindow.getAllWindows()
                for (const win of windows) {
                  if (!win.isDestroyed()) {
                    win.webContents.send('analysis:event', { featureId, event })
                  }
                }

                if (event.type === 'complete') {
                  console.log(`[PMAgentManager] Analysis complete for ${featureId}`)
                  break
                }
                if (event.type === 'error') {
                  console.error(`[PMAgentManager] Analysis error: ${event.error}`)
                  // Continue - individual task errors shouldn't stop the process
                }
              }
            } catch (error) {
              console.error(`[PMAgentManager] Analysis failed:`, error)
              // Analysis failure shouldn't prevent feature from going to backlog
            }
          } else {
            console.log(`[PMAgentManager] Auto-analysis disabled, skipping analysis for ${featureId}`)
          }

          // Step 6: Move feature to backlog (after analysis if enabled)
          console.log(`[PMAgentManager] Moving ${featureId} to backlog`)
          await this.statusManager.updateFeatureStatus(featureId, 'backlog')

          // Broadcast feature status change to UI
          const statusWindows = BrowserWindow.getAllWindows()
          for (const win of statusWindows) {
            if (!win.isDestroyed()) {
              win.webContents.send('feature:status-changed', { featureId, status: 'backlog' })
            }
          }
          console.log(`[PMAgentManager] Broadcast status change for ${featureId}: backlog`)

          // Broadcast DAG update to UI so it shows the new tasks
          const dag = await this.featureStore.loadDag(featureId)
          if (dag) {
            const windows = BrowserWindow.getAllWindows()
            for (const win of windows) {
              if (!win.isDestroyed()) {
                win.webContents.send('dag:updated', { featureId, graph: dag })
              }
            }
            console.log(`[PMAgentManager] Broadcast DAG update for ${featureId}`)
          }

          // Check for auto-start and trigger execution if enabled
          const feature = await this.featureStore.loadFeature(featureId)
          if (feature?.autoStart && dag) {
            console.log(`[PMAgentManager] Auto-start enabled for ${featureId}, starting execution`)
            try {
              const orchestrator = getOrchestrator()
              await orchestrator.initialize(featureId, dag)
              const startResult = await orchestrator.start()
              if (startResult.success) {
                console.log(`[PMAgentManager] Auto-start execution started for ${featureId}`)
                // Broadcast execution started to UI
                const execWindows = BrowserWindow.getAllWindows()
                for (const win of execWindows) {
                  if (!win.isDestroyed()) {
                    win.webContents.send('execution:auto-started', { featureId })
                  }
                }
              } else {
                console.error(`[PMAgentManager] Auto-start execution failed for ${featureId}: ${startResult.error}`)
              }
            } catch (autoStartError) {
              console.error(`[PMAgentManager] Auto-start error for ${featureId}:`, autoStartError)
            }
          }

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

        // Broadcast feature status change to UI
        const failWindows = BrowserWindow.getAllWindows()
        for (const win of failWindows) {
          if (!win.isDestroyed()) {
            win.webContents.send('feature:status-changed', { featureId, status: 'needs_attention' })
          }
        }
        console.log(`[PMAgentManager] Broadcast status change for ${featureId}: needs_attention`)
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
    console.log('[PMAgentManager] loadFeatureContext called with:', { featureId, description, attachmentPaths })
    console.log('[PMAgentManager] attachmentPaths type:', typeof attachmentPaths, 'is array:', Array.isArray(attachmentPaths))

    const contextParts: string[] = []
    console.log('[PMAgentManager] contextParts initialized:', Array.isArray(contextParts))

    // Add description if provided
    if (description) {
      console.log('[PMAgentManager] Adding description to context')
      contextParts.push(`## Feature Description\n\n${description}`)
    }

    // Add attachment contents if provided
    console.log('[PMAgentManager] Checking attachmentPaths?.length:', attachmentPaths?.length)
    if (attachmentPaths?.length) {
      console.log('[PMAgentManager] attachmentPaths has length, adding to context')
      contextParts.push('\n## Attached Files\n')

      const featureDir = getFeatureDir(this.projectRoot, featureId)
      console.log('[PMAgentManager] featureDir:', featureDir)

      for (const relPath of attachmentPaths) {
        console.log('[PMAgentManager] Processing attachment:', relPath)
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
   * Instructs PM to create spec.md only (tasks are created via orchestrator analysis).
   */
  private buildPlanningPrompt(featureName: string, context: string): string {
    return `You are the PM Agent for a new feature: "${featureName}".

Your task is to create a feature specification.

${context ? `\n${context}\n` : ''}

**Your workflow:**

1. **Create Feature Specification**:
   - Use the CreateSpec tool to create a feature-spec.md file
   - Include goals, requirements, and acceptance criteria
   - Base the spec on the feature name${context ? ', description, and attached files' : ''}

2. **Verification**:
   - Ensure spec is created with meaningful content
   - Your work is complete when the spec is saved

**Important:**
- This is autonomous - do not wait for user input
- Create the spec, then finish
- Do NOT create tasks - task creation happens in the analysis phase
- The system will analyze and create tasks after planning completes

Begin planning for "${featureName}".`
  }

  /**
   * Verify that planning completed successfully.
   * Checks for spec.md existence only (tasks are created by analysis orchestrator).
   */
  private async verifyPlanningComplete(featureId: string): Promise<boolean> {
    try {
      // Check: Verify spec.md exists
      const featureDir = getFeatureDir(this.projectRoot, featureId)
      const specPath = path.join(featureDir, 'feature-spec.md')

      try {
        await fs.access(specPath)
      } catch {
        console.error(`[PMAgentManager] Verification failed: spec.md not found at ${specPath}`)
        return false
      }

      // Spec exists - planning complete
      // Note: Tasks are created by the analysis orchestrator, not during planning
      console.log(`[PMAgentManager] Verification passed: spec.md exists`)
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
