import Anthropic from '@anthropic-ai/sdk'
import { getAuthManager } from '../auth'
import type { ChatEntry } from '@shared/types'

export interface ChatRequest {
  messages: ChatEntry[]
  systemPrompt?: string
}

export interface ChatResponse {
  content: string
  error?: string
}

export class ChatService {
  private client: Anthropic | null = null

  private getClient(): Anthropic {
    if (!this.client) {
      const authManager = getAuthManager()
      const apiKey = authManager.getApiKey()
      if (!apiKey) {
        throw new Error('Not authenticated. Please configure API credentials.')
      }
      this.client = new Anthropic({ apiKey })
    }
    return this.client
  }

  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    try {
      const client = this.getClient()

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: request.systemPrompt || 'You are a helpful AI assistant.',
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content
        }))
      })

      const textContent = response.content.find((c) => c.type === 'text')
      return {
        content: textContent?.text || ''
      }
    } catch (error) {
      return {
        content: '',
        error: error instanceof Error ? error.message : 'Failed to get AI response'
      }
    }
  }

  // Reset client when credentials change
  resetClient(): void {
    this.client = null
  }
}

let chatService: ChatService | null = null

export function getChatService(): ChatService {
  if (!chatService) {
    chatService = new ChatService()
  }
  return chatService
}
