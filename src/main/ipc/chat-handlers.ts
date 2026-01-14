import { ipcMain } from 'electron'
import {
  getChatService,
  buildFeatureContext,
  buildSystemPrompt,
  type ChatRequest,
  type ChatResponse,
  type FeatureContext
} from '../chat'
import { getFeatureStore } from './storage-handlers'
import { setPMToolsFeatureContext } from './pm-tools-handlers'
import { getContextService } from './context-handlers'

export interface ContextResult {
  context: FeatureContext
  systemPrompt: string
}

export function registerChatHandlers(): void {
  ipcMain.handle('chat:send', async (_event, request: ChatRequest): Promise<ChatResponse> => {
    const service = getChatService()
    return service.sendMessage(request)
  })

  ipcMain.handle(
    'chat:getContext',
    async (_event, featureId: string): Promise<ContextResult | null> => {
      const featureStore = getFeatureStore()
      if (!featureStore) return null

      const feature = await featureStore.loadFeature(featureId)
      if (!feature) return null

      const dag = await featureStore.loadDag(featureId)
      const context = buildFeatureContext(feature, dag)

      // Set PM tools feature context for task management operations
      setPMToolsFeatureContext(featureId)

      // Try to use ContextService for enhanced context with project info
      const contextService = getContextService()
      if (contextService) {
        try {
          const fullContext = await contextService.buildFullContext({
            featureId,
            includeGitHistory: true,
            includeClaudeMd: true
          })
          const enhancedPrompt = contextService.formatContextAsPrompt(fullContext)
          return { context, systemPrompt: enhancedPrompt }
        } catch (error) {
          console.error('[DAGent] Failed to build enhanced context, using basic:', error)
        }
      }

      // Fall back to existing buildSystemPrompt if ContextService not available
      const systemPrompt = buildSystemPrompt(context)
      return { context, systemPrompt }
    }
  )
}
