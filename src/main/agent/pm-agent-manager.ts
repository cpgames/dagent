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
import { getFeatureSpecStore } from '../agents/feature-spec-store'
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

      // Step 1.5: Run pre-planning analysis to check understanding
      // This also creates/gets the PM session and adds messages
      const { canProceed, uncertainties, sessionId } = await this.runPrePlanningAnalysis(featureId, featureName, context)
      if (!canProceed) {
        console.log(`[PMAgentManager] Pre-planning analysis indicates uncertainty for ${featureId}`)
        await this.statusManager.updateFeatureStatus(featureId, 'questioning')

        // Broadcast status change to UI
        const analysisWindows = BrowserWindow.getAllWindows()
        for (const win of analysisWindows) {
          if (!win.isDestroyed()) {
            win.webContents.send('feature:status-changed', { featureId, status: 'questioning' })
            win.webContents.send('feature:analysis-result', {
              featureId,
              uncertainties: uncertainties
            })
          }
        }

        console.log(`[PMAgentManager] Moved ${featureId} to questioning, uncertainties:`, uncertainties)
        return // Exit early, don't proceed to planning
      }

      // Analysis passed - update status to planning and add confirmation message
      console.log(`[PMAgentManager] Pre-planning analysis passed for ${featureId}, moving to planning state`)

      // Update feature status to planning (in case it was needs_attention before)
      const feature = await this.featureStore.loadFeature(featureId)
      if (feature) {
        const statusChanged = feature.status !== 'planning'
        if (statusChanged) {
          feature.status = 'planning'
          feature.updatedAt = new Date().toISOString()
          await this.featureStore.saveFeature(feature)
        }

        // Always broadcast status change to ensure UI is in sync
        // (even if feature was already in planning status, UI needs to know analysis passed)
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('feature:status-changed', { featureId, status: 'planning' })
          }
        })
      }

      // Add confirmation message to chat
      const sessionManager = getSessionManager(this.projectRoot)
      await sessionManager.addMessage(sessionId, featureId, {
        role: 'assistant',
        content: 'Analysis complete. I have enough context to proceed with planning. Beginning feature specification...'
      })

      // Broadcast chat update
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('chat:updated', { featureId })
        }
      })

      // Step 2: Build planning prompt
      const prompt = this.buildPlanningPrompt(featureName, context)

      // Step 3: Start PM agent
      console.log(`[PMAgentManager] Starting PM agent for ${featureId}`)
      const featureWorktreePath = path.join(this.projectRoot, '.dagent-worktrees', featureId)

      let hasError = false
      let retryCount = 0
      const maxRetries = 1

      // Reuse the session created during analysis
      console.log(`[PMAgentManager] Using existing PM session: ${sessionId}`)

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
            // Add overall timeout to prevent analysis from blocking forever
            const orchestrator = getTaskAnalysisOrchestrator(this.featureStore)
            const ANALYSIS_OVERALL_TIMEOUT_MS = 600000 // 10 minutes max for all tasks

            try {
              const analysisPromise = (async () => {
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
              })()

              const timeoutPromise = new Promise<void>((resolve) => {
                setTimeout(() => {
                  console.warn(`[PMAgentManager] Analysis timeout for ${featureId} - proceeding to backlog`)
                  resolve()
                }, ANALYSIS_OVERALL_TIMEOUT_MS)
              })

              await Promise.race([analysisPromise, timeoutPromise])
            } catch (error) {
              console.error(`[PMAgentManager] Analysis failed:`, error)
              // Analysis failure shouldn't prevent feature from going to backlog
            }
          } else {
            console.log(`[PMAgentManager] Auto-analysis disabled, skipping analysis for ${featureId}`)
          }

          // Step 6: Move feature to ready (after analysis if enabled)
          console.log(`[PMAgentManager] Moving ${featureId} to ready`)
          await this.statusManager.updateFeatureStatus(featureId, 'ready')

          // Broadcast feature status change to UI
          const statusWindows = BrowserWindow.getAllWindows()
          for (const win of statusWindows) {
            if (!win.isDestroyed()) {
              win.webContents.send('feature:status-changed', { featureId, status: 'ready' })
            }
          }
          console.log(`[PMAgentManager] Broadcast status change for ${featureId}: ready`)

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
        await this.statusManager.updateFeatureStatus(featureId, 'questioning')

        // Broadcast feature status change to UI
        const failWindows = BrowserWindow.getAllWindows()
        for (const win of failWindows) {
          if (!win.isDestroyed()) {
            win.webContents.send('feature:status-changed', { featureId, status: 'questioning' })
          }
        }
        console.log(`[PMAgentManager] Broadcast status change for ${featureId}: questioning`)
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
   * Continue pre-planning analysis with user's response to PM's question.
   * This is called when user responds to PM questions in chat.
   *
   * @param featureId - Feature ID
   * @param userResponse - User's response to PM's question
   * @returns Analysis result with canProceed flag and any new questions
   */
  async continuePrePlanningAnalysis(
    featureId: string,
    userResponse: string
  ): Promise<{ canProceed: boolean; uncertainties?: string[]; sessionId: string }> {
    console.log(`[PMAgentManager] Continuing pre-planning analysis for ${featureId} with user response`)

    // Get feature for context
    const feature = await this.featureStore.loadFeature(featureId)
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`)
    }

    const featureName = feature.name
    const featureWorktreePath = path.join(this.projectRoot, '.dagent-worktrees', featureId)

    // Get existing PM session
    const sessionManager = getSessionManager(this.projectRoot)
    const sessionOptions: CreateSessionOptions = {
      type: 'feature',
      agentType: 'pm',
      featureId
    }
    const session = await sessionManager.getOrCreateSession(sessionOptions)
    const sessionId = session.id

    // Add user's response to session
    await sessionManager.addMessage(sessionId, featureId, {
      role: 'user',
      content: userResponse
    })

    // Update spec with user's answer (add as a goal to capture findings)
    const questionsAsked = session.pmMetadata?.questionsAsked || 0
    try {
      const specStore = getFeatureSpecStore(this.projectRoot)
      const spec = await specStore.loadSpec(featureId)
      if (spec && questionsAsked > 0) {
        // Add user's answer as a finding/goal
        const truncatedAnswer = userResponse.length > 200 ? userResponse.slice(0, 200) + '...' : userResponse
        spec.goals.push(`A${questionsAsked}: ${truncatedAnswer}`)
        await specStore.saveSpec(featureId, spec)

        // Broadcast spec update to UI
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('spec:updated', { featureId })
          }
        })
        console.log(`[PMAgentManager] Updated spec with user answer for ${featureId}`)
      }
    } catch (specError) {
      console.error(`[PMAgentManager] Failed to update spec with user answer:`, specError)
    }

    // Broadcast chat update
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('chat:updated', { featureId })
      }
    })

    // Build analysis prompt with current PM metadata context
    // For continuation, we don't pass full context - the session history has it
    const analysisPrompt = this.buildAnalysisPrompt(featureName, '', session.pmMetadata)

    try {
      let responseText = ''

      // Stream analysis query with autoContext to load session history
      for await (const event of this.agentService.streamQuery({
        prompt: analysisPrompt,
        agentType: 'pm',
        featureId,
        cwd: featureWorktreePath,
        toolPreset: 'pmAgent',
        autoContext: true, // Load session history for conversational context
        permissionMode: 'acceptEdits'
      })) {
        if (event.type === 'message' && event.message) {
          // Collect response text for parsing
          if (event.message.type === 'assistant') {
            responseText += event.message.content

            // Save assistant message to session
            const content = event.message.content.trim()
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
        }
      }

      // Broadcast chat update to UI
      try {
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('chat:updated', { featureId })
          }
        }
        console.log(`[PMAgentManager] Broadcast chat update for continued analysis of ${featureId}`)
      } catch (error) {
        console.error(`[PMAgentManager] Failed to broadcast chat update:`, error)
      }

      console.log(`[PMAgentManager] Continued analysis response: ${responseText.slice(0, 200)}...`)

      // Parse response (same logic as runPrePlanningAnalysis)
      const uncertainties: string[] = []
      const lowerResponse = responseText.toLowerCase()

      const questionsAsked = session.pmMetadata?.questionsAsked || 0
      const questionsRequired = session.pmMetadata?.questionsRequired || 0

      // Check for explicit confidence marker
      if (lowerResponse.includes('confident:') && lowerResponse.includes('ready to proceed')) {
        // Check if minimum questions have been asked
        if (questionsAsked < questionsRequired) {
          console.log(`[PMAgentManager] PM is confident but only ${questionsAsked}/${questionsRequired} questions asked - rejecting and requesting more questions`)

          // Reject early confidence
          const feedbackMessage = `You need to ask at least ${questionsRequired} clarifying questions for this ${session.pmMetadata?.complexity}-complexity feature. You've only asked ${questionsAsked} so far.

Please continue the conversation by asking ONE more critical implementation question about:
${questionsAsked < 1 ? '- Which specific files or components need to be modified?' : ''}
${questionsAsked < 2 ? '- What are the expected behaviors and edge cases to handle?' : ''}
${questionsAsked < 3 ? '- What technical approach or architecture patterns should be followed?' : ''}
${questionsAsked < 4 ? '- What data structures, interfaces, or API contracts are involved?' : ''}
${questionsAsked < 5 ? '- What error handling, validation, or security requirements exist?' : ''}

Remember: Ask ONE question at a time in a conversational manner.`

          uncertainties.push(feedbackMessage)
          return { canProceed: false, uncertainties, sessionId }
        } else {
          console.log(`[PMAgentManager] PM is confident and ${questionsAsked}/${questionsRequired} questions met, proceeding with planning`)

          // Update feature status to planning and trigger spec creation
          if (feature.status !== 'planning') {
            feature.status = 'planning'
            feature.updatedAt = new Date().toISOString()
            await this.featureStore.saveFeature(feature)

            BrowserWindow.getAllWindows().forEach((win) => {
              if (!win.isDestroyed()) {
                win.webContents.send('feature:status-changed', { featureId, status: 'planning' })
              }
            })
          }

          return { canProceed: true, sessionId }
        }
      }

      // Check for explicit uncertainty marker
      if (lowerResponse.includes('uncertain:') || lowerResponse.includes('need clarification')) {
        console.log(`[PMAgentManager] PM indicated uncertainty, extracting question`)

        const uncertainStartIndex = Math.max(
          responseText.toLowerCase().indexOf('uncertain:'),
          responseText.toLowerCase().indexOf('need clarification')
        )

        if (uncertainStartIndex !== -1) {
          const afterMarker = responseText.slice(uncertainStartIndex).replace(/^uncertain:\s*/i, '').trim()
          const questionText = afterMarker.split('\n\n')[0].trim()

          if (questionText.length > 0) {
            uncertainties.push(questionText)

            // Increment questions asked counter
            const updatedMetadata = {
              ...session.pmMetadata!,
              questionsAsked: questionsAsked + 1
            }

            session.pmMetadata = updatedMetadata
            await sessionManager.updatePMMetadata(sessionId, featureId, updatedMetadata)

            console.log(`[PMAgentManager] Question ${updatedMetadata.questionsAsked}/${questionsRequired} asked`)

            // Update spec with the question as a constraint (tracks investigation progress)
            try {
              const specStore = getFeatureSpecStore(this.projectRoot)
              const spec = await specStore.loadSpec(featureId)
              if (spec) {
                // Add question as a constraint to track what's being clarified
                spec.constraints.push(`Q${updatedMetadata.questionsAsked}: ${questionText}`)
                await specStore.saveSpec(featureId, spec)

                // Broadcast spec update to UI
                BrowserWindow.getAllWindows().forEach((win) => {
                  if (!win.isDestroyed()) {
                    win.webContents.send('spec:updated', { featureId })
                  }
                })
                console.log(`[PMAgentManager] Updated spec with question for ${featureId}`)
              }
            } catch (specError) {
              console.error(`[PMAgentManager] Failed to update spec with question:`, specError)
            }
          }
        }
      }

      const canProceed = uncertainties.length === 0 && questionsAsked >= questionsRequired
      console.log(`[PMAgentManager] Continued analysis result: canProceed=${canProceed}, uncertainties=${uncertainties.length}, questions=${questionsAsked}/${questionsRequired}`)

      return { canProceed, uncertainties: uncertainties.length > 0 ? uncertainties : undefined, sessionId }
    } catch (error) {
      console.error(`[PMAgentManager] Continued pre-planning analysis failed:`, error)
      return { canProceed: false, uncertainties: ['Analysis failed. Please try again.'], sessionId }
    }
  }

  /**
   * Run pre-planning analysis to check if PM understands the feature context.
   * Returns whether planning can proceed or if clarification is needed.
   */
  private async runPrePlanningAnalysis(
    featureId: string,
    featureName: string,
    context: string
  ): Promise<{ canProceed: boolean; uncertainties?: string[]; sessionId: string }> {
    console.log(`[PMAgentManager] Running pre-planning analysis for ${featureId}`)

    // Check current feature status and move to planning if in questioning state
    const feature = await this.featureStore.loadFeature(featureId)
    if (feature && feature.status === 'questioning') {
      console.log(`[PMAgentManager] Feature ${featureId} is in questioning, moving to planning before analysis`)
      feature.status = 'planning'
      feature.updatedAt = new Date().toISOString()
      await this.featureStore.saveFeature(feature)

      // Broadcast status change to UI
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('feature:status-changed', { featureId, status: 'planning' })
        }
      })
    }

    const featureWorktreePath = path.join(this.projectRoot, '.dagent-worktrees', featureId)

    // Get or create PM session for this feature
    const sessionManager = getSessionManager(this.projectRoot)
    const sessionOptions: CreateSessionOptions = {
      type: 'feature',
      agentType: 'pm',
      featureId
    }
    const session = await sessionManager.getOrCreateSession(sessionOptions)
    const sessionId = session.id

    // Initialize PM metadata if not present (first time)
    if (!session.pmMetadata) {
      session.pmMetadata = {
        questionsAsked: 0
      }

      // Create initial spec for the feature (so FeatureSpecViewer shows something)
      const specStore = getFeatureSpecStore(this.projectRoot)
      const existingSpec = await specStore.loadSpec(featureId)
      if (!existingSpec) {
        console.log(`[PMAgentManager] Creating initial spec for ${featureId}`)
        const spec = await specStore.createSpec(featureId, featureName)

        // Add initial goal from feature description if available
        if (context && context.includes('## Feature Description')) {
          const descMatch = context.match(/## Feature Description\n\n([^\n#]+)/)
          if (descMatch) {
            spec.goals.push(descMatch[1].trim())
            await specStore.saveSpec(featureId, spec)
          }
        }

        // Broadcast spec update to UI
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('spec:updated', { featureId })
          }
        })
      }
    }

    // Build analysis prompt with current PM metadata context
    const analysisPrompt = this.buildAnalysisPrompt(featureName, context, session.pmMetadata)

    // Add user message about analysis to session
    await sessionManager.addMessage(sessionId, featureId, {
      role: 'user',
      content: `Analyze feature requirements: ${featureName}${context ? '\n\n' + context : ''}`
    })

    try {
      let responseText = ''

      // Stream analysis query
      for await (const event of this.agentService.streamQuery({
        prompt: analysisPrompt,
        agentType: 'pm',
        featureId,
        cwd: featureWorktreePath,
        toolPreset: 'pmAgent',
        autoContext: false,
        permissionMode: 'acceptEdits'
      })) {
        if (event.type === 'message' && event.message) {
          // Collect response text for parsing
          if (event.message.type === 'assistant') {
            responseText += event.message.content

            // Save assistant message to session
            const content = event.message.content.trim()
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
        }
      }

      // Broadcast chat update to UI
      try {
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('chat:updated', { featureId })
          }
        }
        console.log(`[PMAgentManager] Broadcast chat update for analysis of ${featureId}`)
      } catch (error) {
        console.error(`[PMAgentManager] Failed to broadcast chat update:`, error)
      }

      console.log(`[PMAgentManager] Analysis response: ${responseText.slice(0, 200)}...`)

      // Parse response to detect uncertainties and complexity
      const uncertainties: string[] = []
      const lowerResponse = responseText.toLowerCase()

      // Extract complexity assessment if present (first analysis only)
      if (!session.pmMetadata?.complexity) {
        let complexity: 'low' | 'medium' | 'high' = 'medium' // default

        if (lowerResponse.includes('complexity: low') || lowerResponse.includes('complexity:low')) {
          complexity = 'low'
        } else if (lowerResponse.includes('complexity: high') || lowerResponse.includes('complexity:high')) {
          complexity = 'high'
        } else if (lowerResponse.includes('complexity: medium') || lowerResponse.includes('complexity:medium')) {
          complexity = 'medium'
        }

        // Determine required questions based on complexity
        const questionsRequired = complexity === 'high' ? 5 : complexity === 'medium' ? 3 : 0

        const updatedMetadata = {
          ...session.pmMetadata,
          complexity,
          questionsRequired,
          questionsAsked: session.pmMetadata?.questionsAsked || 0,
          assessedAt: new Date().toISOString()
        }

        session.pmMetadata = updatedMetadata
        await sessionManager.updatePMMetadata(sessionId, featureId, updatedMetadata)

        console.log(`[PMAgentManager] Complexity assessed: ${complexity}, questions required: ${questionsRequired}`)
      }

      const questionsAsked = session.pmMetadata?.questionsAsked || 0
      const questionsRequired = session.pmMetadata?.questionsRequired || 0

      // Check for explicit confidence marker
      if (lowerResponse.includes('confident:') && lowerResponse.includes('ready to proceed')) {
        // Check if minimum questions have been asked
        if (questionsAsked < questionsRequired) {
          console.log(`[PMAgentManager] PM is confident but only ${questionsAsked}/${questionsRequired} questions asked - rejecting and requesting more questions`)

          // Reject early confidence - add feedback message and return with canProceed=false
          const feedbackMessage = `You need to ask at least ${questionsRequired} clarifying questions for this ${session.pmMetadata?.complexity}-complexity feature. You've only asked ${questionsAsked} so far.

Please continue the conversation by asking ONE more critical implementation question about:
${questionsAsked < 1 ? '- Which specific files or components need to be modified?' : ''}
${questionsAsked < 2 ? '- What are the expected behaviors and edge cases to handle?' : ''}
${questionsAsked < 3 ? '- What technical approach or architecture patterns should be followed?' : ''}
${questionsAsked < 4 ? '- What data structures, interfaces, or API contracts are involved?' : ''}
${questionsAsked < 5 ? '- What error handling, validation, or security requirements exist?' : ''}

Remember: Ask ONE question at a time in a conversational manner.`

          uncertainties.push(feedbackMessage)

          // Immediately return - don't proceed with planning
          console.log(`[PMAgentManager] Returning canProceed=false to continue questioning`)
          return { canProceed: false, uncertainties, sessionId }
        } else {
          console.log(`[PMAgentManager] PM is confident and ${questionsAsked}/${questionsRequired} questions met, proceeding with planning`)
          return { canProceed: true, sessionId }
        }
      }

      // Check for explicit uncertainty marker
      if (lowerResponse.includes('uncertain:') || lowerResponse.includes('need clarification')) {
        console.log(`[PMAgentManager] PM indicated uncertainty, extracting question`)

        // Extract the question after "UNCERTAIN:"
        const uncertainStartIndex = Math.max(
          responseText.toLowerCase().indexOf('uncertain:'),
          responseText.toLowerCase().indexOf('need clarification')
        )

        if (uncertainStartIndex !== -1) {
          // Get everything after "UNCERTAIN:" marker
          const afterMarker = responseText.slice(uncertainStartIndex).replace(/^uncertain:\s*/i, '').trim()

          // Extract the actual question text (stop at double newline if present)
          const questionText = afterMarker.split('\n\n')[0].trim()

          if (questionText.length > 0) {
            uncertainties.push(questionText)

            // Increment questions asked counter
            const updatedMetadata = {
              ...session.pmMetadata!,
              questionsAsked: questionsAsked + 1
            }

            session.pmMetadata = updatedMetadata
            await sessionManager.updatePMMetadata(sessionId, featureId, updatedMetadata)

            console.log(`[PMAgentManager] Question ${updatedMetadata.questionsAsked}/${questionsRequired} asked`)

            // Update spec with the question as a constraint (tracks investigation progress)
            try {
              const specStore = getFeatureSpecStore(this.projectRoot)
              const spec = await specStore.loadSpec(featureId)
              if (spec) {
                // Add question as a constraint to track what's being clarified
                spec.constraints.push(`Q${updatedMetadata.questionsAsked}: ${questionText}`)
                await specStore.saveSpec(featureId, spec)

                // Broadcast spec update to UI
                BrowserWindow.getAllWindows().forEach((win) => {
                  if (!win.isDestroyed()) {
                    win.webContents.send('spec:updated', { featureId })
                  }
                })
                console.log(`[PMAgentManager] Updated spec with question for ${featureId}`)
              }
            } catch (specError) {
              console.error(`[PMAgentManager] Failed to update spec with question:`, specError)
            }
          }
        }
      }

      const canProceed = uncertainties.length === 0 && questionsAsked >= questionsRequired
      console.log(`[PMAgentManager] Analysis result: canProceed=${canProceed}, uncertainties=${uncertainties.length}, questions=${questionsAsked}/${questionsRequired}`)

      return { canProceed, uncertainties: uncertainties.length > 0 ? uncertainties : undefined, sessionId }
    } catch (error) {
      console.error(`[PMAgentManager] Pre-planning analysis failed:`, error)
      // On error, default to proceeding (fail open to avoid blocking valid features)
      return { canProceed: true, sessionId }
    }
  }

  /**
   * Build analysis prompt for pre-planning uncertainty detection.
   */
  private buildAnalysisPrompt(featureName: string, context: string, pmMetadata?: { complexity?: 'low' | 'medium' | 'high'; questionsRequired?: number; questionsAsked?: number }): string {
    const isFirstAnalysis = !pmMetadata?.complexity
    const questionsAsked = pmMetadata?.questionsAsked || 0
    const questionsRequired = pmMetadata?.questionsRequired || 0
    const complexity = pmMetadata?.complexity

    return `You are the PM Agent analyzing ${isFirstAnalysis ? 'a new' : 'an existing'} feature request: "${featureName}".

Your task is to:
1. ${isFirstAnalysis ? 'Assess the complexity of this feature' : `Continue gathering information (${questionsAsked}/${questionsRequired} questions asked so far)`}
2. Ask clarifying questions to gather implementation details
3. Only proceed when you have enough information

${context ? `\n${context}\n` : ''}

${isFirstAnalysis ? `**Step 1: Assess Complexity**

First, evaluate the feature complexity based on:
- **Low Complexity**: Simple, isolated change (add button, fix typo, update text, single file change)
- **Medium Complexity**: Moderate change affecting 2-5 files, some integration work, standard patterns
- **High Complexity**: Large change affecting 6+ files, architectural decisions, new systems/patterns, significant integration

Your first response MUST include: "COMPLEXITY: [low|medium|high]"` : `**Current Progress:**
- Complexity: ${complexity?.toUpperCase()}
- Questions asked: ${questionsAsked}/${questionsRequired}
- Questions remaining: ${questionsRequired - questionsAsked}`}

**Step 2: Gather Information**

${isFirstAnalysis ? `Based on complexity, you MUST ask the minimum number of clarifying questions:
- **Low complexity**: 0-1 questions (only if truly unclear)
- **Medium complexity**: At least 3 questions
- **High complexity**: At least 5 questions` : `You MUST ask ${questionsRequired - questionsAsked} more question${questionsRequired - questionsAsked === 1 ? '' : 's'} before you can proceed to planning.`}

Ask questions ONE AT A TIME in a conversational manner. Focus on implementation details:
- Specific files/components to modify
- Expected behavior and edge cases
- Technical approach or architecture patterns to follow
- Data structures, interfaces, or API contracts
- Error handling, validation, or security requirements
- Integration points with existing systems
- Performance or scalability considerations

**Step 3: Analysis Task**

Review the feature name${context ? ', description, and attached files' : ''} and identify any uncertainties or ambiguities that would prevent you from creating a clear, actionable specification.

**Critical Questions to Consider:**

1. **Scope & Goal:**
   - Is the exact goal and desired outcome clear?
   - Is the scope well-defined (what's included and what's NOT included)?
   - Are there boundary conditions or edge cases mentioned?

2. **Technical Context:**
   - Which specific files, components, or modules need to be modified?
   - What's the existing architecture/pattern we should follow?
   - Are there performance, security, or compatibility requirements?

3. **Requirements Specificity:**
   - Are the requirements concrete and testable?
   - Are there vague terms like "improve", "better", "nice" without quantifiable metrics?
   - Is the user experience flow clearly described?

4. **Implementation Details:**
   - Are there multiple valid approaches without guidance on which to choose?
   - Is there missing information about data structures, APIs, or interfaces?
   - Are dependencies on other systems/features mentioned but unclear?

5. **Size & Complexity:**
   - For LARGE features: Is there enough detail to break down into tasks?
   - For VAGUE features: Are the acceptance criteria clear enough to verify completion?

**Decision Criteria:**

Mark as CONFIDENT only if:
- The feature is small, simple, and self-contained (e.g., "add a delete button to X")
- OR the description provides specific, concrete details that answer all critical questions above

Mark as UNCERTAIN if:
- The feature is large or complex WITHOUT detailed requirements
- There are vague/ambiguous terms without concrete definitions
- You would need to make significant assumptions about scope, approach, or implementation
- Multiple valid interpretations exist and you don't know which one is intended
- Technical details are missing (which files to modify, what pattern to follow)

**Response Format:**

${isFirstAnalysis ? `**On your FIRST response:**
- Start with: "COMPLEXITY: [low|medium|high]"
- Then provide a brief 1-sentence explanation of why
- Then ask your first question (if any) with "UNCERTAIN: [question]"

**On subsequent responses:**` : `**Your response format:**`}
- If you need more information: "UNCERTAIN: [question]"
- If you've asked enough questions (${questionsRequired} total): "CONFIDENT: Ready to proceed with planning."

**Question Guidelines:**
- Ask ONE question at a time - this is a conversation
- Be specific and actionable
- Focus on implementation details, not high-level requirements
- Keep questions conversational (1-3 sentences max)
- ${isFirstAnalysis ? 'Don\'t proceed to CONFIDENT until you\'ve asked the minimum required questions' : `You MUST ask ${questionsRequired - questionsAsked} more question${questionsRequired - questionsAsked === 1 ? '' : 's'} before saying CONFIDENT`}

**Important:**
${isFirstAnalysis ? `- You CANNOT skip questions for medium/high complexity features
- Even if the description seems clear, you must ask implementation questions
- For high complexity: Ask about architecture, data flow, integration points, edge cases, error handling
- For medium complexity: Ask about technical approach, specific files, expected behavior
- Be thorough - it's better to over-clarify than to make wrong assumptions` : `- You have asked ${questionsAsked}/${questionsRequired} questions so far
- DO NOT say CONFIDENT until you've asked all ${questionsRequired} required questions
- The user has provided more information - ask your next clarifying question
- Continue the conversation naturally based on their response`}

Begin your analysis.`
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
   - **CRITICAL**: If the description specifies how tasks should be broken down (e.g., "split into X tasks", "one task per Y", "separate tasks for each Z"), you MUST include these as explicit requirements in the spec. These task breakdown instructions take priority.

2. **Verification**:
   - Ensure spec is created with meaningful content
   - Your work is complete when the spec is saved

**Important:**
- This is autonomous - do not wait for user input
- Create the spec, then finish
- Do NOT create tasks - task creation happens in the analysis phase
- The system will analyze and create tasks after planning completes
- Preserve any user-specified task breakdown structure in the requirements

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
