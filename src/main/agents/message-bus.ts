/**
 * MessageBus - Publish/Subscribe Communication for Inter-Agent Messages
 *
 * Provides a singleton message bus for decoupled communication between
 * DevAgent and HarnessAgent using EventEmitter patterns.
 */

import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type { InterAgentMessage, InterAgentMessageType } from '@shared/types'

class MessageBus extends EventEmitter {
  private static instance: MessageBus | null = null

  private constructor() {
    super()
    // Allow many listeners for multi-task scenarios
    this.setMaxListeners(100)
  }

  /**
   * Get the singleton MessageBus instance.
   */
  static getInstance(): MessageBus {
    if (!MessageBus.instance) {
      MessageBus.instance = new MessageBus()
    }
    return MessageBus.instance
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance(): void {
    if (MessageBus.instance) {
      MessageBus.instance.removeAllListeners()
      MessageBus.instance = null
    }
  }

  /**
   * Publish a message to all subscribers.
   * Emits on multiple channels for flexible subscription patterns.
   */
  publish(message: InterAgentMessage): void {
    // Emit on general 'message' channel
    this.emit('message', message)

    // Emit on task-specific channel for task-scoped subscriptions
    this.emit(`message:${message.taskId}`, message)

    // Emit on type-specific channel for type-based filtering
    this.emit(`message:type:${message.type}`, message)
  }

  /**
   * Subscribe to all messages.
   * @returns Unsubscribe function
   */
  subscribe(handler: (message: InterAgentMessage) => void): () => void {
    this.on('message', handler)
    return () => this.off('message', handler)
  }

  /**
   * Subscribe to messages for a specific task.
   * @returns Unsubscribe function
   */
  subscribeToTask(taskId: string, handler: (message: InterAgentMessage) => void): () => void {
    const channel = `message:${taskId}`
    this.on(channel, handler)
    return () => this.off(channel, handler)
  }

  /**
   * Subscribe to messages of a specific type.
   * @returns Unsubscribe function
   */
  subscribeToType(
    type: InterAgentMessageType,
    handler: (message: InterAgentMessage) => void
  ): () => void {
    const channel = `message:type:${type}`
    this.on(channel, handler)
    return () => this.off(channel, handler)
  }
}

// Export singleton accessor functions
export function getMessageBus(): MessageBus {
  return MessageBus.getInstance()
}

export function resetMessageBus(): void {
  MessageBus.resetInstance()
}

/**
 * Generate a unique message ID.
 */
export function generateMessageId(): string {
  return randomUUID()
}

/**
 * Create a message with auto-generated id and timestamp.
 */
export function createMessage(
  params: Omit<InterAgentMessage, 'id' | 'timestamp'>
): InterAgentMessage {
  return {
    ...params,
    id: generateMessageId(),
    timestamp: new Date().toISOString()
  }
}

/**
 * Create a message from DevAgent to HarnessAgent.
 */
export function createDevToHarnessMessage(
  taskId: string,
  agentId: string,
  type: InterAgentMessageType,
  payload: unknown
): InterAgentMessage {
  return createMessage({
    type,
    from: { type: 'task', id: agentId },
    to: { type: 'harness', id: 'harness' },
    taskId,
    payload
  })
}

/**
 * Create a message from HarnessAgent to DevAgent.
 */
export function createHarnessToDevMessage(
  taskId: string,
  agentId: string,
  type: InterAgentMessageType,
  payload: unknown
): InterAgentMessage {
  return createMessage({
    type,
    from: { type: 'harness', id: 'harness' },
    to: { type: 'task', id: agentId },
    taskId,
    payload
  })
}
