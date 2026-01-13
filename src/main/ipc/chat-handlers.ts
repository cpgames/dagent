import { ipcMain } from 'electron'
import { getChatService, type ChatRequest, type ChatResponse } from '../chat'

export function registerChatHandlers(): void {
  ipcMain.handle('chat:send', async (_event, request: ChatRequest): Promise<ChatResponse> => {
    const service = getChatService()
    return service.sendMessage(request)
  })
}
