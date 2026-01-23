import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import type { FeatureStore } from '../storage/feature-store'
import { getFeatureDirInWorktree } from '../storage/paths'
import { AgentService } from './agent-service'
import { FeatureStatusManager } from '../services/feature-status-manager'
import { setPMToolsFeatureContext } from '../ipc/pm-tools-handlers'
import { getSessionManager } from '../services/session-manager'
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
   * Start investigation workflow for a feature.
   * Called when a feature first starts - runs pre-planning analysis,
   * asks questions, and gathers requirements.
   *
   * @param featureId - Feature ID
   * @param featureName - Feature name
   * @param description - Optional feature description
   * @param attachments - Optional array of attachment file paths
   */
  async startInvestigationForFeature(
    featureId: string,
    featureName: string,
    description?: string,
    attachments?: string[]
  ): Promise<void> {
    console.log(`[PMAgentManager] Starting investigation for feature: ${featureName} (${featureId})`)

    try {
      // Set PM tools feature context
      setPMToolsFeatureContext(featureId)
      console.log(`[PMAgentManager] Set PM tools feature context to: ${featureId}`)

      // Load feature context
      const context = await this.loadFeatureContext(featureId, featureName, description, attachments)

      // Run pre-planning analysis to start investigation
      const { canProceed, uncertainties, sessionId } = await this.runPrePlanningAnalysis(featureId, featureName, context)
      if (!canProceed) {
        console.log(`[PMAgentManager] Pre-planning analysis indicates uncertainty for ${featureId}, staying in investigating`)
        // Stay in investigating status - questions are handled internally by the manager

        // Broadcast analysis result to UI (status stays as investigating)
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('feature:analysis-result', {
              featureId,
              uncertainties: uncertainties
            })
          }
        })

        console.log(`[PMAgentManager] Feature ${featureId} awaiting input, uncertainties:`, uncertainties)
        return // Exit - user needs to answer questions
      }

      // Analysis passed - auto-proceed to planning
      console.log(`[PMAgentManager] Investigation complete for ${featureId}, auto-proceeding to planning`)

      // Add confirmation message to chat
      const sessionManager = getSessionManager(this.projectRoot)
      await sessionManager.addMessage(sessionId, featureId, {
        role: 'assistant',
        content: 'Investigation complete. Proceeding to create tasks...'
      })

      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('chat:updated', { featureId })
        }
      })

      // Auto-proceed to task creation
      await this.createTasksForFeature(featureId, featureName, description)
    } catch (error) {
      console.error(`[PMAgentManager] Investigation failed for ${featureId}:`, error)

      // Stay in investigating status on error - user can retry or send a message
      this.eventEmitter.emit('investigation-failed', {
        featureId,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Create tasks for a feature from existing spec.
   * Called when user clicks "Plan" from the ready_for_planning state.
   * At this point, the spec already exists from the investigation phase.
   *
   * @param featureId - Feature ID
   * @param featureName - Feature name
   * @param description - Optional feature description
   */
  async createTasksForFeature(
    featureId: string,
    featureName: string,
    description?: string
  ): Promise<void> {
    console.log(`[PMAgentManager] Starting task creation for feature: ${featureName} (${featureId})`)

    try {
      // Step 0: Set PM tools feature context (CRITICAL - tools won't work without this!)
      setPMToolsFeatureContext(featureId)
      console.log(`[PMAgentManager] Set PM tools feature context to: ${featureId}`)

      // Step 1: Load feature and update status to planning
      const feature = await this.featureStore.loadFeature(featureId)
      if (!feature) {
        throw new Error(`Feature not found: ${featureId}`)
      }

      // Update feature status to planning
      feature.status = 'planning'
      feature.updatedAt = new Date().toISOString()
      await this.featureStore.saveFeature(feature)

      // Broadcast status change to UI
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('feature:status-changed', { featureId, status: 'planning' })
        }
      })

      // Step 2: Load spec and Q&A context (created during investigation)
      const specStore = getFeatureSpecStore(this.projectRoot)
      const spec = await specStore.loadSpec(featureId)
      if (!spec) {
        throw new Error('No spec found - investigation phase may not have completed')
      }

      // Build spec context for task creation
      let specContext = `## Feature Specification\n\n`
      specContext += `**Name:** ${spec.featureName}\n\n`

      if (spec.goals.length > 0) {
        specContext += `**Goals:**\n${spec.goals.map((g) => `- ${g}`).join('\n')}\n\n`
      }

      if (spec.requirements.length > 0) {
        specContext += `**Requirements:**\n${spec.requirements.map((r) => `- ${r.description}`).join('\n')}\n\n`
      }

      if (spec.constraints.length > 0) {
        specContext += `**Constraints:**\n${spec.constraints.map((c) => `- ${c}`).join('\n')}\n\n`
      }

      if (spec.acceptanceCriteria.length > 0) {
        specContext += `**Acceptance Criteria:**\n${spec.acceptanceCriteria.map((ac) => `- ${ac.description}`).join('\n')}\n\n`
      }

      // Add description if provided
      if (description) {
        specContext += `\n## Original Description\n\n${description}\n`
      }

      // Step 3: Build task creation prompt
      const prompt = this.buildTaskCreationPrompt(featureName, specContext)

      // Step 4: Get or create PM session and add planning message
      const sessionManager = getSessionManager(this.projectRoot)
      const sessionOptions: CreateSessionOptions = {
        type: 'feature',
        agentType: 'pm',
        featureId
      }
      const session = await sessionManager.getOrCreateSession(sessionOptions)
      const sessionId = session.id

      // Add message indicating task creation is starting
      await sessionManager.addMessage(sessionId, featureId, {
        role: 'assistant',
        content: 'Beginning task creation based on the feature specification...'
      })

      // Broadcast chat update
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('chat:updated', { featureId })
        }
      })

      // Step 5: Run PM agent to create tasks
      console.log(`[PMAgentManager] Starting PM agent for task creation: ${featureId}`)
      const featureWorktreePath = feature.managerWorktreePath || this.projectRoot

      let hasError = false
      let planningResponseText = ''

      try {
        // Stream PM agent execution
        for await (const event of this.agentService.streamQuery({
          prompt,
          agentType: 'pm',
          featureId,
          cwd: featureWorktreePath,
          toolPreset: 'pmAgent',
          autoContext: false,
          permissionMode: 'acceptEdits'
        })) {
          if (event.type === 'message' && event.message) {
            console.log(`[PMAgentManager] PM: ${event.message.content.slice(0, 100)}...`)

            if (event.message.type === 'assistant' && event.message.content) {
              const content = event.message.content.trim()
              const isSystemMessage = content.startsWith('System:') ||
                                     content.startsWith('Thinking:') ||
                                     content.length === 0

              if (!isSystemMessage) {
                planningResponseText += event.message.content
              }
            }
          } else if (event.type === 'error') {
            console.error(`[PMAgentManager] PM error: ${event.error}`)
            hasError = true
          } else if (event.type === 'tool_use' && event.message && event.message.toolName) {
            console.log(`[PMAgentManager] PM using tool: ${event.message.toolName}`)
          }
        }

        // Save the complete assistant message after streaming ends
        if (planningResponseText.trim()) {
          await sessionManager.addMessage(sessionId, featureId, {
            role: 'assistant',
            content: planningResponseText
          })
        }
      } catch (error) {
        console.error(`[PMAgentManager] PM agent execution error:`, error)
        hasError = true
      }

      // Broadcast chat update
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('chat:updated', { featureId })
        }
      })

      // Step 6: Verify tasks were created
      console.log(`[PMAgentManager] PM agent stream finished for ${featureId}, hasError=${hasError}`)
      if (!hasError) {
        const dag = await this.featureStore.loadDag(featureId)
        const hasTasks = dag && dag.nodes.length > 0

        if (hasTasks) {
          console.log(`[PMAgentManager] Task creation complete for ${featureId}, ${dag.nodes.length} tasks created`)

          // Step 7: Run task analysis
          console.log(`[PMAgentManager] Starting task analysis for ${featureId}`)
          const analysisOrchestrator = getTaskAnalysisOrchestrator(this.featureStore)
          const ANALYSIS_OVERALL_TIMEOUT_MS = 600000 // 10 minutes max

          try {
            const analysisPromise = (async () => {
              for await (const event of analysisOrchestrator.analyzeFeatureTasks(featureId)) {
                console.log(`[PMAgentManager] Analysis event: ${event.type}`)

                // Broadcast analysis events to renderer for UI updates
                BrowserWindow.getAllWindows().forEach((win) => {
                  if (!win.isDestroyed()) {
                    win.webContents.send('analysis:event', { featureId, event })
                  }
                })

                if (event.type === 'complete') {
                  console.log(`[PMAgentManager] Analysis complete for ${featureId}`)
                  break
                }
                if (event.type === 'error') {
                  console.error(`[PMAgentManager] Analysis error: ${event.error}`)
                }
              }
            })()

            const timeoutPromise = new Promise<void>((resolve) => {
              setTimeout(() => {
                console.warn(`[PMAgentManager] Analysis timeout for ${featureId} - proceeding to ready`)
                resolve()
              }, ANALYSIS_OVERALL_TIMEOUT_MS)
            })

            await Promise.race([analysisPromise, timeoutPromise])
          } catch (error) {
            console.error(`[PMAgentManager] Analysis failed:`, error)
          }

          // Step 8: Move feature to ready
          console.log(`[PMAgentManager] Moving ${featureId} to ready`)
          await this.statusManager.updateFeatureStatus(featureId, 'ready')

          // Broadcast status change
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('feature:status-changed', { featureId, status: 'ready' })
            }
          })

          // Broadcast DAG update
          const finalDag = await this.featureStore.loadDag(featureId)
          if (finalDag) {
            BrowserWindow.getAllWindows().forEach((win) => {
              if (!win.isDestroyed()) {
                win.webContents.send('dag:updated', { featureId, graph: finalDag })
              }
            })
            console.log(`[PMAgentManager] Broadcast DAG update for ${featureId}`)
          }

          // Check for auto-start
          const updatedFeature = await this.featureStore.loadFeature(featureId)
          if (updatedFeature?.autoStart && finalDag) {
            console.log(`[PMAgentManager] Auto-start enabled for ${featureId}, starting execution`)
            try {
              const executionOrchestrator = getOrchestrator()
              await executionOrchestrator.initialize(featureId, finalDag)
              const startResult = await executionOrchestrator.start()
              if (startResult.success) {
                console.log(`[PMAgentManager] Auto-start execution started for ${featureId}`)
                BrowserWindow.getAllWindows().forEach((win) => {
                  if (!win.isDestroyed()) {
                    win.webContents.send('execution:auto-started', { featureId })
                  }
                })
              } else {
                console.error(`[PMAgentManager] Auto-start execution failed: ${startResult.error}`)
              }
            } catch (autoStartError) {
              console.error(`[PMAgentManager] Auto-start error:`, autoStartError)
            }
          }

          // Emit completion event
          this.eventEmitter.emit('planning-complete', {
            featureId,
            success: true,
            timestamp: new Date().toISOString()
          })
        } else {
          throw new Error('No tasks were created')
        }
      } else {
        throw new Error('PM agent execution failed')
      }
    } catch (error) {
      console.error(`[PMAgentManager] Planning failed for ${featureId}:`, error)

      try {
        // Move back to ready_for_planning so user can try again
        await this.statusManager.updateFeatureStatus(featureId, 'ready_for_planning')

        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('feature:status-changed', { featureId, status: 'ready_for_planning' })
          }
        })
      } catch (statusError) {
        console.error(`[PMAgentManager] Failed to update status:`, statusError)
      }

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
    _userResponse: string  // User response is in chat history, not needed here directly
  ): Promise<{ canProceed: boolean; uncertainties?: string[]; sessionId: string }> {
    console.log(`[PMAgentManager] Continuing pre-planning analysis for ${featureId} with user response`)

    // Get feature for context
    const feature = await this.featureStore.loadFeature(featureId)
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`)
    }

    const featureName = feature.name
    // Use manager worktree path (where actual code lives), not per-feature path
    const featureWorktreePath = feature.managerWorktreePath || this.projectRoot

    // Get existing PM session
    const sessionManager = getSessionManager(this.projectRoot)
    const sessionOptions: CreateSessionOptions = {
      type: 'feature',
      agentType: 'pm',
      featureId
    }
    const session = await sessionManager.getOrCreateSession(sessionOptions)
    const sessionId = session.id

    // NOTE: User message is already saved by the frontend via session.addUserMessage()
    // Do NOT save it again here to avoid duplicate messages

    // NOTE: We don't immediately update the spec with user's answer here.
    // The PM agent will analyze the response and determine if it's an answer or clarification.
    // If PM identifies it as an answer (via ANSWER_RECORDED marker), we update the spec then.

    // Load session chat history to include in prompt
    // This is CRITICAL - PM needs to see the conversation so far including user's responses
    let chatHistoryContext = ''
    try {
      const messages = await sessionManager.getAllMessages(sessionId, featureId)
      if (messages.length > 0) {
        const chatLines = messages.map((msg) => {
          const role = msg.role === 'user' ? 'User' : 'PM'
          return `${role}: ${msg.content}`
        })
        chatHistoryContext = `\n## Conversation History\n\n${chatLines.join('\n\n')}\n`
      }
    } catch (chatError) {
      console.error(`[PMAgentManager] Failed to load chat history:`, chatError)
    }

    // Load current spec Q&A state to include in prompt context
    // This ensures PM knows which questions were already asked and answered
    let specQAContext = ''
    try {
      // Spec no longer stores questions - Q&A is tracked in chat history only
      const specStore = getFeatureSpecStore(this.projectRoot)
      const spec = await specStore.loadSpec(featureId)
      if (spec) {
        // Add current spec state as context
        if (spec.goals.length > 0) {
          specQAContext += `\n## Current Spec - Goals\n${spec.goals.map((g) => `- ${g}`).join('\n')}\n`
        }
        if (spec.requirements.length > 0) {
          specQAContext += `\n## Current Spec - Requirements\n${spec.requirements.map((r) => `- ${r.description}`).join('\n')}\n`
        }
        if (spec.constraints.length > 0) {
          specQAContext += `\n## Current Spec - Constraints\n${spec.constraints.map((c) => `- ${c}`).join('\n')}\n`
        }
      }
    } catch (specError) {
      console.error(`[PMAgentManager] Failed to load spec:`, specError)
    }

    // Combine chat history and spec context
    const combinedContext = chatHistoryContext + specQAContext

    // Build analysis prompt with current PM metadata context and conversation history
    const analysisPrompt = this.buildAnalysisPrompt(featureName, combinedContext, session.pmMetadata)

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
          // Collect response text for parsing (accumulate, don't save yet)
          if (event.message.type === 'assistant') {
            const content = event.message.content.trim()
            const isSystemMessage = content.startsWith('System:') ||
                                   content.startsWith('Thinking:') ||
                                   content.length === 0

            if (!isSystemMessage) {
              responseText += event.message.content
            }
          }
        }
      }

      // Save the complete assistant message after streaming ends
      if (responseText.trim()) {
        await sessionManager.addMessage(sessionId, featureId, {
          role: 'assistant',
          content: responseText
        })
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

      // Parse response - detect answer recording, clarification, or new questions
      const uncertainties: string[] = []
      const lowerResponse = responseText.toLowerCase()

      let questionsAsked = session.pmMetadata?.questionsAsked || 0

      // Check for ANSWER_RECORDED marker - PM identified user's response as an answer
      if (lowerResponse.includes('answer_recorded:')) {
        console.log(`[PMAgentManager] PM recorded an answer from user`)

        // Extract the answer summary
        const answerIndex = responseText.toLowerCase().indexOf('answer_recorded:')
        let answerSummary = responseText.slice(answerIndex + 'answer_recorded:'.length).trim()

        // Truncate at next marker
        const endMarkers = ['uncertain:', 'confident:', 'clarifying:', 'partial_answer:', '**options']
        for (const marker of endMarkers) {
          const markerIndex = answerSummary.toLowerCase().indexOf(marker)
          if (markerIndex > 0) {
            answerSummary = answerSummary.slice(0, markerIndex).trim()
          }
        }

        // Note: Q&A is tracked in chat history, not in spec
        // PM agent should use tools to update the spec directly when it learns something concrete
        console.log(`[PMAgentManager] Answer recorded in chat history`)
      }

      // Check for CLARIFYING marker - PM is clarifying, not counting as progress
      if (lowerResponse.includes('clarifying:')) {
        console.log(`[PMAgentManager] PM is clarifying question (not counting as answer)`)
        return { canProceed: false, uncertainties: ['Clarification provided - awaiting answer'], sessionId }
      }

      // Check for PARTIAL_ANSWER marker - PM got some info but needs more
      if (lowerResponse.includes('partial_answer:')) {
        console.log(`[PMAgentManager] PM received partial answer`)
        // Note: Q&A tracked in chat history, PM should update spec via tools
      }

      // Check for explicit confidence marker - PM is ready to proceed
      if (lowerResponse.includes('confident:') && lowerResponse.includes('ready to proceed')) {
        console.log(`[PMAgentManager] PM is confident, auto-proceeding to planning`)

        // canProceed: true means auto-proceed to task creation
        return { canProceed: true, uncertainties: undefined, sessionId }
      }

      // Check for new UNCERTAIN question
      if (lowerResponse.includes('uncertain:')) {
        console.log(`[PMAgentManager] PM asking new question`)

        const uncertainStartIndex = responseText.toLowerCase().indexOf('uncertain:')

        if (uncertainStartIndex !== -1) {
          const afterMarker = responseText.slice(uncertainStartIndex + 'uncertain:'.length).trim()

          // Extract the question text until **Options or next marker
          let questionText = afterMarker
          const endMarkers = ['confident:', 'complexity:', 'uncertain:', '**options', 'answer_recorded:', 'clarifying:', 'partial_answer:']
          for (const marker of endMarkers) {
            const markerIndex = questionText.toLowerCase().indexOf(marker)
            if (markerIndex > 0) {
              questionText = questionText.slice(0, markerIndex)
            }
          }
          questionText = questionText.trim()

          // Also extract the options if present
          let optionsText = ''
          const optionsIndex = responseText.toLowerCase().indexOf('**options')
          if (optionsIndex !== -1) {
            optionsText = responseText.slice(optionsIndex)
            // Truncate at next major section
            const optionEndMarkers = ['**when ready', '**example', '**important', 'uncertain:', 'confident:']
            for (const marker of optionEndMarkers) {
              const markerIndex = optionsText.toLowerCase().indexOf(marker)
              if (markerIndex > 0) {
                optionsText = optionsText.slice(0, markerIndex)
              }
            }
          }

          // Combine question with options for display
          const fullQuestionWithOptions = optionsText ? `${questionText}\n\n${optionsText}` : questionText

          if (questionText.length > 0) {
            uncertainties.push(fullQuestionWithOptions)

            // Increment questions asked counter
            questionsAsked += 1
            const updatedMetadata = {
              ...session.pmMetadata!,
              questionsAsked
            }

            session.pmMetadata = updatedMetadata
            await sessionManager.updatePMMetadata(sessionId, featureId, updatedMetadata)

            console.log(`[PMAgentManager] Question ${questionsAsked} asked`)

            // Note: Questions are tracked in chat history, not in spec
            // PM agent should use tools to update spec when it learns concrete requirements
            console.log(`[PMAgentManager] Question asked (tracked in chat history)`)
          }
        }
      }

      // PM decides when ready - no fixed question requirement
      const canProceed = uncertainties.length === 0 && lowerResponse.includes('confident:')
      console.log(`[PMAgentManager] Continued analysis result: canProceed=${canProceed}, uncertainties=${uncertainties.length}, questionsAsked=${questionsAsked}`)

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

    // Check current feature status and move to planning if in investigating state
    const feature = await this.featureStore.loadFeature(featureId)
    if (feature && feature.status === 'investigating') {
      console.log(`[PMAgentManager] Feature ${featureId} is in investigating, moving to planning before analysis`)
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

    // Use manager worktree path (where actual code lives), not per-feature path
    const featureWorktreePath = feature?.managerWorktreePath || this.projectRoot

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

      // Create initial empty spec for the feature (PM agent will populate via tools)
      const specStore = getFeatureSpecStore(this.projectRoot)
      const existingSpec = await specStore.loadSpec(featureId)
      if (!existingSpec) {
        console.log(`[PMAgentManager] Creating empty spec for ${featureId}`)
        await specStore.createSpec(featureId, featureName)

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
          // Collect response text for parsing (accumulate, don't save yet)
          if (event.message.type === 'assistant') {
            const content = event.message.content.trim()
            const isSystemMessage = content.startsWith('System:') ||
                                   content.startsWith('Thinking:') ||
                                   content.length === 0

            if (!isSystemMessage) {
              responseText += event.message.content
            }
          }
        }
      }

      // Save the complete assistant message after streaming ends
      if (responseText.trim()) {
        await sessionManager.addMessage(sessionId, featureId, {
          role: 'assistant',
          content: responseText
        })
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

      let questionsAsked = session.pmMetadata?.questionsAsked || 0

      // Check for explicit confidence marker - PM decides when ready
      if (lowerResponse.includes('confident:') && lowerResponse.includes('ready to proceed')) {
        console.log(`[PMAgentManager] PM is confident after ${questionsAsked} questions, moving to ready_for_planning`)

        // Update feature status to ready_for_planning - user must click Plan to proceed
        if (feature && feature.status !== 'ready_for_planning' && feature.status !== 'planning') {
          feature.status = 'ready_for_planning'
          feature.updatedAt = new Date().toISOString()
          await this.featureStore.saveFeature(feature)

          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('feature:status-changed', { featureId, status: 'ready_for_planning' })
            }
          })
        }

        // canProceed: false means we stop automatic flow - user must manually click Plan
        return { canProceed: false, uncertainties: undefined, sessionId }
      }

      // Check for explicit uncertainty marker
      if (lowerResponse.includes('uncertain:')) {
        console.log(`[PMAgentManager] PM indicated uncertainty, extracting question`)

        // Extract the question after "UNCERTAIN:"
        const uncertainStartIndex = responseText.toLowerCase().indexOf('uncertain:')

        if (uncertainStartIndex !== -1) {
          // Get everything after "UNCERTAIN:" marker
          const afterMarker = responseText.slice(uncertainStartIndex + 'uncertain:'.length).trim()

          // Extract the question text until **Options or next marker
          let questionText = afterMarker
          const endMarkers = ['confident:', 'complexity:', 'uncertain:', '**options', 'answer_recorded:', 'clarifying:', 'partial_answer:']
          for (const marker of endMarkers) {
            const markerIndex = questionText.toLowerCase().indexOf(marker)
            if (markerIndex > 0) {
              questionText = questionText.slice(0, markerIndex)
            }
          }
          questionText = questionText.trim()

          // Also extract the options if present
          let optionsText = ''
          const optionsIndex = responseText.toLowerCase().indexOf('**options')
          if (optionsIndex !== -1) {
            optionsText = responseText.slice(optionsIndex)
            // Truncate at next major section
            const optionEndMarkers = ['**when ready', '**example', '**important', 'uncertain:', 'confident:', '**judging']
            for (const marker of optionEndMarkers) {
              const markerIndex = optionsText.toLowerCase().indexOf(marker)
              if (markerIndex > 0) {
                optionsText = optionsText.slice(0, markerIndex)
              }
            }
          }

          // Combine question with options for display
          const fullQuestionWithOptions = optionsText ? `${questionText}\n\n${optionsText}` : questionText

          if (questionText.length > 0) {
            uncertainties.push(fullQuestionWithOptions)

            // Increment questions asked counter
            questionsAsked += 1
            const updatedMetadata = {
              ...session.pmMetadata!,
              questionsAsked
            }

            session.pmMetadata = updatedMetadata
            await sessionManager.updatePMMetadata(sessionId, featureId, updatedMetadata)

            console.log(`[PMAgentManager] Question ${questionsAsked} asked (tracked in chat history)`)
            // Note: Questions are tracked in chat history, not in spec
            // PM agent should use tools to update spec when it learns concrete requirements
          }
        }
      }

      // PM decides when ready - no fixed question requirement
      const canProceed = uncertainties.length === 0 && lowerResponse.includes('confident:')
      console.log(`[PMAgentManager] Analysis result: canProceed=${canProceed}, uncertainties=${uncertainties.length}, questionsAsked=${questionsAsked}`)

      return { canProceed, uncertainties: uncertainties.length > 0 ? uncertainties : undefined, sessionId }
    } catch (error) {
      console.error(`[PMAgentManager] Pre-planning analysis failed:`, error)
      // On error, default to proceeding (fail open to avoid blocking valid features)
      return { canProceed: true, sessionId }
    }
  }

  /**
   * Build analysis prompt for pre-planning uncertainty detection.
   * First analysis is detailed; continuation is streamlined.
   */
  private buildAnalysisPrompt(featureName: string, context: string, pmMetadata?: { complexity?: 'low' | 'medium' | 'high'; questionsRequired?: number; questionsAsked?: number }): string {
    const isFirstAnalysis = !pmMetadata?.complexity
    const questionsAsked = pmMetadata?.questionsAsked || 0
    const complexity = pmMetadata?.complexity

    // Continuation prompt is much shorter - just process the answer and respond
    if (!isFirstAnalysis) {
      return this.buildContinuationPrompt(featureName, context, complexity!, questionsAsked)
    }

    // First analysis prompt - detailed investigation
    return `You are the PM Agent analyzing a new feature request: "${featureName}".

Your task is to:
1. Assess the complexity of this feature
2. **RESEARCH the codebase** using your tools (Glob, Grep, Read) to understand the current implementation
3. Ask clarifying questions based on what you learned from the codebase
4. Only proceed when you have enough information

${context ? `\n${context}\n` : ''}

**CRITICAL: Research Before Asking**

You have access to codebase exploration tools:
- **Glob**: Find files by pattern (e.g., \`**/*.tsx\` for React components)
- **Grep**: Search for code patterns (e.g., function names, class names)
- **Read**: Read file contents to understand implementation

**MANDATORY RESEARCH STEPS** (do these BEFORE asking ANY question):

1. **Extract keywords from the feature name**: Parse "${featureName}" for file names, class names, component names
2. **Search for each keyword**: Use Glob to find files like \`**/*keyword*\`
3. **Read the relevant files**: Once found, READ the files to understand what they do
4. **NEVER ask "what is X?" if X could be found in the codebase** - search first!

**Step 1: Assess Complexity**

First, evaluate the feature complexity:
- **Low Complexity**: Simple, isolated change (add button, fix typo, single file change)
- **Medium Complexity**: Moderate change affecting 2-5 files, some integration work
- **High Complexity**: Large change affecting 6+ files, architectural decisions, new systems

Your first response MUST include: "COMPLEXITY: [low|medium|high]"

**Step 2: Gather Information**

Based on complexity, ask clarifying questions:
- **Low complexity**: May need 0-1 questions if truly simple
- **Medium complexity**: Typically 2-4 questions about approach
- **High complexity**: More questions about architecture, edge cases, integration

**You decide when you have enough information** - stop asking when you can write a detailed, actionable spec.

**Response Format:**

1. First, USE TOOLS to search the codebase
2. After researching, respond with: "COMPLEXITY: [low|medium|high]"
3. Briefly explain what you found in the codebase (1-2 sentences)
4. Then ask your first question

**Question Format:**
UNCERTAIN: [Your question here - specific and concise]

**Options:**
1. [Option A] - [Brief explanation]
2. [Option B] - [Brief explanation]
3. [Option C] - [Optional third option]

**When ready to proceed:**
Say "CONFIDENT: Ready to proceed with planning." when you have enough information.

Begin your analysis.`
  }

  /**
   * Build a streamlined prompt for continuation (after user responds).
   * Much shorter than initial prompt - just process answer and respond quickly.
   */
  private buildContinuationPrompt(featureName: string, context: string, complexity: string, questionsAsked: number): string {
    return `You are continuing analysis for feature: "${featureName}" (${complexity} complexity).

${context}

**Your task is simple:**
1. Read the user's answer in the conversation history above
2. Acknowledge what you learned from their answer
3. Either ask your next question OR say you're ready to proceed

**Response markers (use exactly one):**

- **ANSWER_RECORDED: [brief summary]** - Then ask next question or proceed
- **CLARIFYING:** - If user asked for clarification, re-explain your question
- **PARTIAL_ANSWER: [what you learned]** - Then ask follow-up
- **CONFIDENT: Ready to proceed with planning.** - When you have enough info

**If asking another question, use this format:**
UNCERTAIN: [Your question]

**Options:**
1. [Option A] - [Brief explanation]
2. [Option B] - [Brief explanation]

**Guidelines:**
- Be brief - don't re-analyze the whole feature
- Don't repeat questions already asked
- Build on the user's answer
- If the spec is already updated with their answer, you can proceed
- Questions asked so far: ${questionsAsked}

Respond now.`
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

      // Load feature to get the worktree path
      const feature = await this.featureStore.loadFeature(featureId)
      if (!feature?.managerWorktreePath) {
        console.error('[PMAgentManager] Feature does not have a worktree path, cannot read attachments')
      } else {
        const featureDir = getFeatureDirInWorktree(feature.managerWorktreePath, featureId)
        console.log('[PMAgentManager] featureDir:', featureDir)

        for (const relPath of attachmentPaths) {
          console.log('[PMAgentManager] Processing attachment:', relPath)
          try {
            // relPath is like "attachments/filename.png"
            const fullPath = path.join(featureDir, relPath)
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
    }

    return contextParts.join('\n')
  }

  /**
   * Build task creation prompt for PM agent.
   * Called during the "planning" phase when user clicks Plan button.
   * At this point, the spec already exists - we just need to create tasks.
   */
  private buildTaskCreationPrompt(featureName: string, specContext: string): string {
    return `You are the PM Agent creating tasks for feature: "${featureName}".

The feature specification has already been created during the investigation phase. Your task is to create executable tasks based on this specification.

${specContext}

**Your workflow:**

1. **Review the Specification**:
   - Read the spec carefully, including goals, requirements, and Q&A decisions
   - Understand what needs to be implemented

2. **Create Tasks**:
   - Use the CreateTask tool to create tasks for implementing the feature
   - Each task should be atomic and implementable by a single dev agent session
   - Tasks should be small enough to complete in one focused session (ideally 1-3 files changed)
   - Include clear descriptions with implementation details
   - Set up dependencies between tasks using the dependsOn parameter

3. **Task Guidelines**:
   - **Atomic**: Each task does ONE thing well
   - **Clear**: Description includes what files to change, what to implement
   - **Ordered**: Use dependencies to enforce execution order where needed
   - **Complete**: Cover all requirements from the spec

**Task Creation Pattern:**
- First, call ListTasks to see if any tasks already exist
- Create tasks with descriptive titles like "Add X component to Y"
- Include specific file paths and implementation details in descriptions
- Link dependent tasks using the dependsOn parameter with task IDs

**Important:**
- This is autonomous - do not wait for user input
- Do NOT recreate or modify the spec - it already exists
- Focus ONLY on creating tasks from the existing spec
- Create ALL tasks needed to implement the feature

Begin creating tasks for "${featureName}".`
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
