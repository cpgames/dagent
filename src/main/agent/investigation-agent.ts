import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import type { FeatureStore } from '../storage/feature-store'
import { getFeatureDirInWorktree } from '../storage/paths'
import { AgentService } from './agent-service'
import { FeatureStatusManager } from '../services/feature-status-manager'
import { setPMToolsFeatureContext } from '../ipc/pm-tools-handlers'
import { getSessionManager } from '../services/session-manager'
import { getFeatureSpecStore } from '../agents/feature-spec-store'
import type { CreateSessionOptions } from '../../shared/types/session'
import * as path from 'path'
import * as fs from 'fs/promises'

/**
 * Investigation metadata tracked in session.
 * Uses the same structure as Session.pmMetadata for compatibility.
 */
interface InvestigationMetadata {
  complexity?: 'low' | 'medium' | 'high'
  questionsAsked?: number
  questionsRequired?: number
  assessedAt?: string
}

/**
 * Result of investigation analysis.
 */
export interface InvestigationResult {
  isReady: boolean
  sessionId: string
  uncertainties?: string[]
}

/**
 * InvestigationAgent - Handles codebase exploration and spec writing.
 *
 * Responsibilities:
 * - Explore codebase using Read, Glob, Grep
 * - Ask clarifying questions to user
 * - Write and update feature spec
 * - Manage complexity assessment
 *
 * Session: investigation-feature-{featureId}
 * Phases: investigating -> ready_for_planning (questions handled internally)
 */
export class InvestigationAgent {
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
   * Build the session ID for investigation.
   */
  private buildSessionId(featureId: string): string {
    return `investigation-feature-${featureId}`
  }

  /**
   * Get the session ID for this feature's investigation.
   */
  getSessionId(featureId: string): string {
    return this.buildSessionId(featureId)
  }

  /**
   * Start investigation for a new feature.
   * Creates session, runs initial analysis, potentially asks questions.
   *
   * @param featureId - Feature ID
   * @param featureName - Feature name
   * @param description - Optional feature description
   * @param attachments - Optional array of attachment file paths
   */
  async startInvestigation(
    featureId: string,
    featureName: string,
    description?: string,
    attachments?: string[]
  ): Promise<InvestigationResult> {
    console.log(`[InvestigationAgent] Starting investigation for feature: ${featureName} (${featureId})`)

    try {
      // Set PM tools feature context (needed for spec tools)
      setPMToolsFeatureContext(featureId)
      console.log(`[InvestigationAgent] Set PM tools feature context to: ${featureId}`)

      // Load feature context
      const context = await this.loadFeatureContext(featureId, featureName, description, attachments)

      // Run initial analysis
      const result = await this.runAnalysis(featureId, featureName, context)

      if (!result.isReady) {
        console.log(`[InvestigationAgent] Analysis indicates uncertainty for ${featureId}, staying in investigating`)
        // Stay in investigating status - questions are handled internally by the manager

        // Broadcast analysis result to UI (status stays as investigating)
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('feature:analysis-result', {
              featureId,
              uncertainties: result.uncertainties
            })
          }
        })

        console.log(`[InvestigationAgent] Feature ${featureId} awaiting input, uncertainties:`, result.uncertainties)
        return result
      }

      // Analysis passed - move to ready_for_planning
      console.log(`[InvestigationAgent] Investigation complete for ${featureId}, moving to ready_for_planning`)
      await this.statusManager.updateFeatureStatus(featureId, 'ready_for_planning')

      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('feature:status-changed', { featureId, status: 'ready_for_planning' })
        }
      })

      return result
    } catch (error) {
      console.error(`[InvestigationAgent] Investigation failed for ${featureId}:`, error)

      // Stay in investigating status on error - user can retry or send a message
      this.eventEmitter.emit('investigation-failed', {
        featureId,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      })

      throw error
    }
  }

  /**
   * Continue investigation with user's response.
   * Called when user answers a question in chat.
   *
   * @param featureId - Feature ID
   * @param _userResponse - User's response (already in chat history)
   */
  async continueInvestigation(
    featureId: string,
    _userResponse: string
  ): Promise<InvestigationResult> {
    console.log(`[InvestigationAgent] Continuing investigation for ${featureId} with user response`)

    // Get feature for context
    const feature = await this.featureStore.loadFeature(featureId)
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`)
    }

    const featureName = feature.name
    const featureWorktreePath = feature.managerWorktreePath || this.projectRoot

    // Get existing session
    const sessionManager = getSessionManager(this.projectRoot)
    const sessionOptions: CreateSessionOptions = {
      type: 'feature',
      agentType: 'investigation',
      featureId
    }
    const session = await sessionManager.getOrCreateSession(sessionOptions)
    const sessionId = session.id

    // Load chat history for context
    let chatHistoryContext = ''
    try {
      const messages = await sessionManager.getAllMessages(sessionId, featureId)
      if (messages.length > 0) {
        const chatLines = messages.map((msg) => {
          const role = msg.role === 'user' ? 'User' : 'Investigation Agent'
          return `${role}: ${msg.content}`
        })
        chatHistoryContext = `\n## Conversation History\n\n${chatLines.join('\n\n')}\n`
      }
    } catch (chatError) {
      console.error(`[InvestigationAgent] Failed to load chat history:`, chatError)
    }

    // Load current spec state for context
    let specContext = ''
    try {
      const specStore = getFeatureSpecStore(this.projectRoot)
      const spec = await specStore.loadSpec(featureId)
      if (spec) {
        if (spec.goals.length > 0) {
          specContext += `\n## Current Spec - Goals\n${spec.goals.map((g) => `- ${g}`).join('\n')}\n`
        }
        if (spec.requirements.length > 0) {
          specContext += `\n## Current Spec - Requirements\n${spec.requirements.map((r) => `- ${r.description}`).join('\n')}\n`
        }
        if (spec.constraints.length > 0) {
          specContext += `\n## Current Spec - Constraints\n${spec.constraints.map((c) => `- ${c}`).join('\n')}\n`
        }
      }
    } catch (specError) {
      console.error(`[InvestigationAgent] Failed to load spec:`, specError)
    }

    const combinedContext = chatHistoryContext + specContext
    const metadata = session.pmMetadata as InvestigationMetadata | undefined
    const analysisPrompt = this.buildContinuationPrompt(featureName, combinedContext, metadata?.complexity || 'medium', metadata?.questionsAsked || 0)

    try {
      let responseText = ''

      // Stream analysis with autoContext to load session history
      for await (const event of this.agentService.streamQuery({
        prompt: analysisPrompt,
        agentType: 'investigation',
        featureId,
        cwd: featureWorktreePath,
        toolPreset: 'investigationAgent',
        autoContext: true,
        permissionMode: 'acceptEdits'
      })) {
        if (event.type === 'message' && event.message) {
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

      // Save assistant message
      if (responseText.trim()) {
        await sessionManager.addMessage(sessionId, featureId, {
          role: 'assistant',
          content: responseText
        })
      }

      // Broadcast chat update
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('chat:updated', { featureId })
        }
      })

      console.log(`[InvestigationAgent] Continued analysis response: ${responseText.slice(0, 200)}...`)

      // Parse response
      const result = this.parseResponse(responseText, session, sessionManager, sessionId, featureId)

      if (result.isReady) {
        // Move to ready_for_planning
        await this.statusManager.updateFeatureStatus(featureId, 'ready_for_planning')

        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('feature:status-changed', { featureId, status: 'ready_for_planning' })
          }
        })
      }

      return { ...result, sessionId }
    } catch (error) {
      console.error(`[InvestigationAgent] Continued analysis failed:`, error)
      return { isReady: false, uncertainties: ['Analysis failed. Please try again.'], sessionId }
    }
  }

  /**
   * Run initial analysis for a feature.
   */
  private async runAnalysis(
    featureId: string,
    featureName: string,
    context: string
  ): Promise<InvestigationResult> {
    console.log(`[InvestigationAgent] Running analysis for ${featureId}`)

    const feature = await this.featureStore.loadFeature(featureId)
    const featureWorktreePath = feature?.managerWorktreePath || this.projectRoot

    // Get or create session
    const sessionManager = getSessionManager(this.projectRoot)
    const sessionOptions: CreateSessionOptions = {
      type: 'feature',
      agentType: 'investigation',
      featureId
    }
    const session = await sessionManager.getOrCreateSession(sessionOptions)
    const sessionId = session.id

    // Initialize metadata if not present
    if (!session.pmMetadata) {
      session.pmMetadata = {
        questionsAsked: 0
      }

      // Create initial empty spec
      const specStore = getFeatureSpecStore(this.projectRoot)
      const existingSpec = await specStore.loadSpec(featureId)
      if (!existingSpec) {
        console.log(`[InvestigationAgent] Creating empty spec for ${featureId}`)
        await specStore.createSpec(featureId, featureName)

        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('spec:updated', { featureId })
          }
        })
      }
    }

    const analysisPrompt = this.buildAnalysisPrompt(featureName, context, session.pmMetadata as InvestigationMetadata)

    // Add user message about analysis
    await sessionManager.addMessage(sessionId, featureId, {
      role: 'user',
      content: `Analyze feature requirements: ${featureName}${context ? '\n\n' + context : ''}`
    })

    try {
      let responseText = ''

      // Stream analysis
      for await (const event of this.agentService.streamQuery({
        prompt: analysisPrompt,
        agentType: 'investigation',
        featureId,
        cwd: featureWorktreePath,
        toolPreset: 'investigationAgent',
        autoContext: false,
        permissionMode: 'acceptEdits'
      })) {
        if (event.type === 'message' && event.message) {
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

      // Save assistant message
      if (responseText.trim()) {
        await sessionManager.addMessage(sessionId, featureId, {
          role: 'assistant',
          content: responseText
        })
      }

      // Broadcast chat update
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('chat:updated', { featureId })
        }
      })

      console.log(`[InvestigationAgent] Analysis response: ${responseText.slice(0, 200)}...`)

      // Extract complexity on first analysis
      const metadata = session.pmMetadata as InvestigationMetadata
      if (!metadata?.complexity) {
        const lowerResponse = responseText.toLowerCase()
        let complexity: 'low' | 'medium' | 'high' = 'medium'

        if (lowerResponse.includes('complexity: low') || lowerResponse.includes('complexity:low')) {
          complexity = 'low'
        } else if (lowerResponse.includes('complexity: high') || lowerResponse.includes('complexity:high')) {
          complexity = 'high'
        } else if (lowerResponse.includes('complexity: medium') || lowerResponse.includes('complexity:medium')) {
          complexity = 'medium'
        }

        const updatedMetadata: InvestigationMetadata = {
          ...metadata,
          complexity,
          questionsAsked: metadata?.questionsAsked || 0,
          assessedAt: new Date().toISOString()
        }

        session.pmMetadata = updatedMetadata
        await sessionManager.updatePMMetadata(sessionId, featureId, updatedMetadata)

        console.log(`[InvestigationAgent] Complexity assessed: ${complexity}`)
      }

      // Parse response
      const result = this.parseResponse(responseText, session, sessionManager, sessionId, featureId)
      return { ...result, sessionId }
    } catch (error) {
      console.error(`[InvestigationAgent] Analysis failed:`, error)
      return { isReady: true, sessionId } // Fail open
    }
  }

  /**
   * Parse agent response to determine if ready or has questions.
   */
  private parseResponse(
    responseText: string,
    session: { pmMetadata?: InvestigationMetadata },
    sessionManager: ReturnType<typeof getSessionManager>,
    sessionId: string,
    featureId: string
  ): { isReady: boolean; uncertainties?: string[] } {
    const uncertainties: string[] = []
    const lowerResponse = responseText.toLowerCase()
    let questionsAsked = session.pmMetadata?.questionsAsked || 0

    // Check for CONFIDENT marker
    if (lowerResponse.includes('confident:') && lowerResponse.includes('ready to proceed')) {
      console.log(`[InvestigationAgent] Agent is confident, ready to proceed`)
      return { isReady: true }
    }

    // Check for UNCERTAIN question
    if (lowerResponse.includes('uncertain:')) {
      console.log(`[InvestigationAgent] Agent asking question`)

      const uncertainStartIndex = responseText.toLowerCase().indexOf('uncertain:')

      if (uncertainStartIndex !== -1) {
        const afterMarker = responseText.slice(uncertainStartIndex + 'uncertain:'.length).trim()

        // Extract question text
        let questionText = afterMarker
        const endMarkers = ['confident:', 'complexity:', 'uncertain:', '**options', 'answer_recorded:', 'clarifying:', 'partial_answer:']
        for (const marker of endMarkers) {
          const markerIndex = questionText.toLowerCase().indexOf(marker)
          if (markerIndex > 0) {
            questionText = questionText.slice(0, markerIndex)
          }
        }
        questionText = questionText.trim()

        // Extract options if present
        let optionsText = ''
        const optionsIndex = responseText.toLowerCase().indexOf('**options')
        if (optionsIndex !== -1) {
          optionsText = responseText.slice(optionsIndex)
          const optionEndMarkers = ['**when ready', '**example', '**important', 'uncertain:', 'confident:', '**judging']
          for (const marker of optionEndMarkers) {
            const markerIndex = optionsText.toLowerCase().indexOf(marker)
            if (markerIndex > 0) {
              optionsText = optionsText.slice(0, markerIndex)
            }
          }
        }

        const fullQuestionWithOptions = optionsText ? `${questionText}\n\n${optionsText}` : questionText

        if (questionText.length > 0) {
          uncertainties.push(fullQuestionWithOptions)

          // Update questions asked counter
          questionsAsked += 1
          const updatedMetadata: InvestigationMetadata = {
            ...session.pmMetadata!,
            questionsAsked
          }

          session.pmMetadata = updatedMetadata
          sessionManager.updatePMMetadata(sessionId, featureId, updatedMetadata)

          console.log(`[InvestigationAgent] Question ${questionsAsked} asked`)
        }
      }
    }

    const isReady = uncertainties.length === 0 && lowerResponse.includes('confident:')
    return { isReady, uncertainties: uncertainties.length > 0 ? uncertainties : undefined }
  }

  /**
   * Build initial analysis prompt.
   */
  private buildAnalysisPrompt(featureName: string, context: string, metadata?: InvestigationMetadata): string {
    // If we have complexity already, use continuation prompt
    if (metadata?.complexity) {
      return this.buildContinuationPrompt(featureName, context, metadata.complexity, metadata.questionsAsked || 0)
    }

    return `You are the Investigation Agent. YOUR JOB: Gather requirements and CREATE A SPEC.

Feature: "${featureName}"
${context ? `${context}\n` : ''}

## CRITICAL: YOU MUST CREATE THE SPEC

Your primary output is a SPEC created via the **CreateSpec** tool. If you finish without calling CreateSpec, YOU HAVE FAILED.
The spec is required for the planning phase. No spec = blocked workflow.

## Step 1: Quick Complexity Assessment

- **Low**: Simple task, obvious what to do (e.g., "delete file", "add button")
- **Medium**: Needs some research (e.g., "add dark mode", "refactor auth")
- **High**: Unclear scope, needs user input (e.g., "improve performance")

## Step 2: Create Spec (MANDATORY)

**LOW complexity:**
1. CALL **CreateSpec** with requirements (e.g., requirements: ["Delete file helloworld.txt"])
2. Say "CONFIDENT: Ready to proceed with planning."

**MEDIUM complexity:**
1. Quick research (read 1-2 files if needed)
2. CALL **CreateSpec** with requirements
3. Say CONFIDENT or ask ONE clarifying question

**HIGH complexity:**
1. Research codebase
2. CALL **CreateSpec** with what you know
3. Ask clarifying questions, then CALL **UpdateSpec** with answers

## Tools Available
- **CreateSpec**: CREATE the spec (YOU MUST CALL THIS)
- **UpdateSpec**: Add/update requirements in the spec
- **GetSpec**: Check current spec
- **Glob/Grep/Read**: Research codebase

## Response Format

1. Start with: "COMPLEXITY: [low|medium|high]"
2. CALL **CreateSpec** (REQUIRED)
3. End with either:
   - "CONFIDENT: Ready to proceed with planning."
   - "UNCERTAIN: [question]" with options

DO NOT say CONFIDENT without first calling CreateSpec.`
  }

  /**
   * Build continuation prompt for follow-up analysis.
   */
  private buildContinuationPrompt(featureName: string, context: string, complexity: string, questionsAsked: number): string {
    return `You are continuing investigation for feature: "${featureName}" (${complexity} complexity).

${context}

## MANDATORY: Update Spec First

You MUST call **UpdateSpec** before saying anything else. The user just answered your question - record their answer in the spec.

**Required sequence:**
1. Call **UpdateSpec** to add the user's answer as a requirement or update existing requirements
2. THEN respond with one of the markers below

**Tools (use UpdateSpec NOW):**
- **UpdateSpec**: Call this FIRST to record the user's answer
- **GetSpec**: Check current spec if needed
- **Glob/Grep/Read**: Research codebase if needed

## After Updating Spec

Use exactly one response marker:

- **CONFIDENT: Ready to proceed with planning.** - Spec has enough detail, no more questions needed
- **UNCERTAIN: [question]** - Need more information (provide options as before)

**If asking another question:**
UNCERTAIN: [Your question]

**Options:**
1. [Option A] - [Brief explanation]
2. [Option B] - [Brief explanation]

**Remember:**
- Questions asked so far: ${questionsAsked}
- Don't repeat questions already asked
- Call UpdateSpec BEFORE responding

Call UpdateSpec now with what you learned from the user's answer.`
  }

  /**
   * Load feature context from description and attachments.
   */
  private async loadFeatureContext(
    featureId: string,
    _featureName: string,
    description?: string,
    attachmentPaths?: string[]
  ): Promise<string> {
    const contextParts: string[] = []

    if (description) {
      contextParts.push(`## Feature Description\n\n${description}`)
    }

    if (attachmentPaths?.length) {
      contextParts.push('\n## Attached Files\n')

      const feature = await this.featureStore.loadFeature(featureId)
      if (feature?.managerWorktreePath) {
        const featureDir = getFeatureDirInWorktree(feature.managerWorktreePath, featureId)

        for (const relPath of attachmentPaths) {
          try {
            const fullPath = path.join(featureDir, relPath)
            const fileName = path.basename(fullPath)
            const ext = path.extname(fileName).toLowerCase()

            if (['.md', '.txt', '.csv', '.json'].includes(ext)) {
              const content = await fs.readFile(fullPath, 'utf-8')
              contextParts.push(`\n### ${fileName}\n\n\`\`\`\n${content}\n\`\`\`\n`)
            } else if (['.png', '.jpg', '.jpeg', '.gif', '.pdf'].includes(ext)) {
              contextParts.push(`\n### ${fileName}\n\n[Attached file: ${fileName}]\n`)
            } else {
              try {
                const content = await fs.readFile(fullPath, 'utf-8')
                contextParts.push(`\n### ${fileName}\n\n\`\`\`\n${content}\n\`\`\`\n`)
              } catch {
                contextParts.push(`\n### ${fileName}\n\n[Attached file: ${fileName}]\n`)
              }
            }
          } catch (error) {
            console.error(`[InvestigationAgent] Failed to read attachment ${relPath}:`, error)
            contextParts.push(`\n### ${path.basename(relPath)}\n\n[Failed to read file]\n`)
          }
        }
      }
    }

    return contextParts.join('\n')
  }
}

/**
 * Factory function for creating InvestigationAgent instance.
 */
export function createInvestigationAgent(
  agentService: AgentService,
  featureStore: FeatureStore,
  statusManager: FeatureStatusManager,
  eventEmitter: EventEmitter,
  projectRoot: string
): InvestigationAgent {
  return new InvestigationAgent(agentService, featureStore, statusManager, eventEmitter, projectRoot)
}
