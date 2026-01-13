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
      const systemPrompt = buildSystemPrompt(context)

      return { context, systemPrompt }
    }
  )
}
