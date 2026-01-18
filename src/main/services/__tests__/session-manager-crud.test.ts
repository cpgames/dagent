/**
 * SessionManager CRUD Operation Tests
 *
 * Tests for message and checkpoint CRUD operations, context,
 * agent description, and file persistence.
 */

import * as fs from 'fs/promises'
import { SessionManager, getSessionManager, resetSessionManager } from '../session-manager'
import type {
  Session,
  CreateSessionOptions,
  ChatMessage,
  Checkpoint,
  SessionContext,
  AgentDescription
} from '../../../../shared/types/session'

// Mock fs/promises
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockImplementation(async () => {
    const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException
    error.code = 'ENOENT'
    throw error
  })
}))

// Mock BrowserWindow for event broadcasting
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn().mockReturnValue([])
  }
}))

// Mock uuid for predictable IDs in tests
let uuidCounter = 0
jest.mock('uuid', () => ({
  v4: jest.fn().mockImplementation(() => `test-uuid-${++uuidCounter}`)
}))

// Mock agent service for compaction
jest.mock('../../agent/agent-service', () => ({
  getAgentService: jest.fn().mockReturnValue({
    streamQuery: jest.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true, value: undefined })
      })
    })
  })
}))

// Mock compaction prompts
jest.mock('../compaction-prompts', () => ({
  buildCompactionPrompt: jest.fn().mockReturnValue('mock compaction prompt'),
  parseCompactionResult: jest.fn().mockReturnValue({
    completed: [],
    inProgress: [],
    pending: [],
    blockers: [],
    decisions: []
  })
}))

describe('SessionManager CRUD Operations', () => {
  const testProjectRoot = 'C:\\test\\project'
  let manager: SessionManager
  let session: Session

  // Store for mocked file data
  const fileStore: Record<string, string> = {}

  beforeEach(async () => {
    // Reset all mocks and state
    jest.clearAllMocks()
    resetSessionManager()
    uuidCounter = 0

    // Reset file store
    Object.keys(fileStore).forEach(key => delete fileStore[key])

    // Configure fs mocks to use file store
    jest.mocked(fs.writeFile).mockImplementation(async (filePath, data) => {
      fileStore[filePath as string] = data as string
    })

    jest.mocked(fs.readFile).mockImplementation(async (filePath) => {
      const data = fileStore[filePath as string]
      if (data) {
        return data
      }
      const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    })

    // Create a fresh manager and session for each test
    manager = new SessionManager(testProjectRoot)
    session = await manager.getOrCreateSession({
      type: 'feature',
      agentType: 'pm',
      featureId: 'test-feature'
    })
  })

  afterEach(() => {
    resetSessionManager()
  })

  describe('Message Operations', () => {
    it('addMessage appends to session messages', async () => {
      const message = await manager.addMessage(session.id, 'test-feature', {
        role: 'user',
        content: 'Hello, world!'
      })

      expect(message).toMatchObject({
        role: 'user',
        content: 'Hello, world!'
      })
      expect(message.id).toBeDefined()
      expect(message.timestamp).toBeDefined()

      const messages = await manager.getAllMessages(session.id, 'test-feature')
      expect(messages.length).toBe(1)
      expect(messages[0].content).toBe('Hello, world!')
    })

    it('addMessage triggers save', async () => {
      jest.mocked(fs.writeFile).mockClear()

      await manager.addMessage(session.id, 'test-feature', {
        role: 'user',
        content: 'Test message'
      })

      // Should have saved chat session and session metadata
      expect(fs.writeFile).toHaveBeenCalled()
    })

    it('getRecentMessages returns last N messages (default 10)', async () => {
      // Add 15 messages
      for (let i = 0; i < 15; i++) {
        await manager.addMessage(session.id, 'test-feature', {
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i + 1}`
        })
      }

      const recent = await manager.getRecentMessages(session.id, 'test-feature')
      expect(recent.length).toBe(10) // Default limit
      expect(recent[0].content).toBe('Message 6') // First of last 10
      expect(recent[9].content).toBe('Message 15') // Last message
    })

    it('getRecentMessages respects custom limit', async () => {
      // Add 10 messages
      for (let i = 0; i < 10; i++) {
        await manager.addMessage(session.id, 'test-feature', {
          role: 'user',
          content: `Message ${i + 1}`
        })
      }

      const recent = await manager.getRecentMessages(session.id, 'test-feature', 3)
      expect(recent.length).toBe(3)
      expect(recent[0].content).toBe('Message 8')
      expect(recent[2].content).toBe('Message 10')
    })

    it('getAllMessages returns complete history', async () => {
      // Add 5 messages
      for (let i = 0; i < 5; i++) {
        await manager.addMessage(session.id, 'test-feature', {
          role: 'user',
          content: `Message ${i + 1}`
        })
      }

      const all = await manager.getAllMessages(session.id, 'test-feature')
      expect(all.length).toBe(5)
    })

    it('clearMessages empties message array', async () => {
      // Add some messages
      for (let i = 0; i < 3; i++) {
        await manager.addMessage(session.id, 'test-feature', {
          role: 'user',
          content: `Message ${i + 1}`
        })
      }

      // Verify messages exist
      let messages = await manager.getAllMessages(session.id, 'test-feature')
      expect(messages.length).toBe(3)

      // Clear messages
      await manager.clearMessages(session.id, 'test-feature')

      // Verify messages are cleared
      messages = await manager.getAllMessages(session.id, 'test-feature')
      expect(messages.length).toBe(0)
    })

    it('handles empty session correctly', async () => {
      const messages = await manager.getAllMessages(session.id, 'test-feature')
      expect(messages.length).toBe(0)
    })

    it('handles single message correctly', async () => {
      await manager.addMessage(session.id, 'test-feature', {
        role: 'user',
        content: 'Only message'
      })

      const recent = await manager.getRecentMessages(session.id, 'test-feature', 10)
      expect(recent.length).toBe(1)
      expect(recent[0].content).toBe('Only message')
    })

    it('filters out internal messages in getRecentMessages', async () => {
      // Add regular message
      await manager.addMessage(session.id, 'test-feature', {
        role: 'user',
        content: 'Visible message'
      })

      // Add internal message
      await manager.addMessage(session.id, 'test-feature', {
        role: 'assistant',
        content: 'Internal message',
        metadata: { internal: true }
      })

      // Add another regular message
      await manager.addMessage(session.id, 'test-feature', {
        role: 'user',
        content: 'Another visible message'
      })

      const recent = await manager.getRecentMessages(session.id, 'test-feature')
      expect(recent.length).toBe(2)
      expect(recent.every(m => m.content !== 'Internal message')).toBe(true)
    })

    it('getAllMessages includes internal messages', async () => {
      await manager.addMessage(session.id, 'test-feature', {
        role: 'user',
        content: 'Visible message'
      })

      await manager.addMessage(session.id, 'test-feature', {
        role: 'assistant',
        content: 'Internal message',
        metadata: { internal: true }
      })

      const all = await manager.getAllMessages(session.id, 'test-feature')
      expect(all.length).toBe(2)
      expect(all.some(m => m.content === 'Internal message')).toBe(true)
    })

    it('throws error when adding message to non-existent session', async () => {
      await expect(
        manager.addMessage('non-existent-session', 'test-feature', {
          role: 'user',
          content: 'Test'
        })
      ).rejects.toThrow('Session not found')
    })

    it('returns empty array for non-existent session in getRecentMessages', async () => {
      const messages = await manager.getRecentMessages('non-existent', 'test-feature')
      expect(messages).toEqual([])
    })

    it('returns empty array for non-existent session in getAllMessages', async () => {
      const messages = await manager.getAllMessages('non-existent', 'test-feature')
      expect(messages).toEqual([])
    })
  })

  describe('Checkpoint Operations', () => {
    it('getCheckpoint returns checkpoint after session creation', async () => {
      const checkpoint = await manager.getCheckpoint(session.id, 'test-feature')
      expect(checkpoint).toBeDefined()
      expect(checkpoint?.version).toBe(1)
      expect(checkpoint?.summary).toMatchObject({
        completed: [],
        inProgress: [],
        pending: [],
        blockers: [],
        decisions: []
      })
    })

    it('updateCheckpoint stores checkpoint data', async () => {
      const newCheckpoint: Checkpoint = {
        version: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: {
          completed: ['Task A', 'Task B'],
          inProgress: ['Task C'],
          pending: ['Task D'],
          blockers: [],
          decisions: ['Decision 1']
        },
        compactionInfo: {
          messagesCompacted: 10,
          oldestMessageTimestamp: new Date().toISOString(),
          newestMessageTimestamp: new Date().toISOString(),
          compactedAt: new Date().toISOString()
        },
        stats: {
          totalCompactions: 1,
          totalMessages: 10,
          totalTokens: 500
        }
      }

      await manager.updateCheckpoint(session.id, 'test-feature', newCheckpoint)

      const retrieved = await manager.getCheckpoint(session.id, 'test-feature')
      expect(retrieved).toMatchObject({
        version: 2,
        summary: {
          completed: ['Task A', 'Task B'],
          inProgress: ['Task C'],
          pending: ['Task D'],
          decisions: ['Decision 1']
        }
      })
    })

    it('getCompactionMetrics returns correct token counts', async () => {
      // Update checkpoint with known stats
      const checkpoint: Checkpoint = {
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: {
          completed: [],
          inProgress: [],
          pending: [],
          blockers: [],
          decisions: []
        },
        compactionInfo: {
          messagesCompacted: 50,
          oldestMessageTimestamp: new Date().toISOString(),
          newestMessageTimestamp: new Date().toISOString(),
          compactedAt: '2026-01-01T12:00:00.000Z'
        },
        stats: {
          totalCompactions: 3,
          totalMessages: 150,
          totalTokens: 75000
        }
      }

      await manager.updateCheckpoint(session.id, 'test-feature', checkpoint)

      const metrics = await manager.getCompactionMetrics(session.id, 'test-feature')
      expect(metrics).toMatchObject({
        totalCompactions: 3,
        totalMessagesCompacted: 150,
        totalTokens: 75000,
        lastCompactionAt: '2026-01-01T12:00:00.000Z'
      })
    })

    it('getCheckpoint returns null for non-existent session', async () => {
      const checkpoint = await manager.getCheckpoint('non-existent', 'test-feature')
      expect(checkpoint).toBeNull()
    })

    it('getCompactionMetrics returns null for non-existent session', async () => {
      const metrics = await manager.getCompactionMetrics('non-existent', 'test-feature')
      expect(metrics).toBeNull()
    })

    it('updateCheckpoint throws for non-existent session', async () => {
      const checkpoint: Checkpoint = {
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: {
          completed: [],
          inProgress: [],
          pending: [],
          blockers: [],
          decisions: []
        },
        compactionInfo: {
          messagesCompacted: 0,
          oldestMessageTimestamp: new Date().toISOString(),
          newestMessageTimestamp: new Date().toISOString(),
          compactedAt: new Date().toISOString()
        },
        stats: {
          totalCompactions: 0,
          totalMessages: 0,
          totalTokens: 0
        }
      }

      await expect(
        manager.updateCheckpoint('non-existent', 'test-feature', checkpoint)
      ).rejects.toThrow('Session not found')
    })
  })

  describe('Context Operations', () => {
    it('getContext returns null for newly created session', async () => {
      // Context is not created automatically, only on explicit set
      const context = await manager.getContext(session.id, 'test-feature')
      expect(context).toBeNull()
    })

    it('updateContext stores context correctly', async () => {
      const context: SessionContext = {
        projectRoot: testProjectRoot,
        featureId: 'test-feature',
        featureName: 'Test Feature',
        featureGoal: 'Implement testing',
        taskId: 'task-1',
        taskTitle: 'Write tests',
        taskState: 'in_dev',
        dagSummary: 'Task graph summary',
        dependencies: ['task-0'],
        dependents: ['task-2'],
        projectStructure: 'src/main/...',
        claudeMd: 'CLAUDE.md content',
        projectMd: 'PROJECT.md content',
        recentCommits: ['abc123 - Initial commit'],
        attachments: ['file1.txt', 'file2.pdf']
      }

      await manager.updateContext(session.id, 'test-feature', context)

      const retrieved = await manager.getContext(session.id, 'test-feature')
      expect(retrieved).toMatchObject({
        projectRoot: testProjectRoot,
        featureId: 'test-feature',
        featureName: 'Test Feature',
        featureGoal: 'Implement testing',
        taskId: 'task-1'
      })
    })

    it('updateContext throws for non-existent session', async () => {
      const context: SessionContext = {
        projectRoot: testProjectRoot,
        featureId: 'test-feature',
        featureName: 'Test Feature'
      }

      await expect(
        manager.updateContext('non-existent', 'test-feature', context)
      ).rejects.toThrow('Session not found')
    })
  })

  describe('AgentDescription Operations', () => {
    it('getAgentDescription returns null for newly created session', async () => {
      const description = await manager.getAgentDescription(session.id, 'test-feature')
      expect(description).toBeNull()
    })

    it('setAgentDescription stores description correctly', async () => {
      const description: AgentDescription = {
        agentType: 'pm',
        roleInstructions: 'You are a project manager agent...',
        toolInstructions: 'Use CreateTask, UpdateTask, DeleteTask...',
        createdAt: new Date().toISOString()
      }

      await manager.setAgentDescription(session.id, 'test-feature', description)

      const retrieved = await manager.getAgentDescription(session.id, 'test-feature')
      expect(retrieved).toMatchObject({
        agentType: 'pm',
        roleInstructions: 'You are a project manager agent...',
        toolInstructions: 'Use CreateTask, UpdateTask, DeleteTask...'
      })
    })

    it('setAgentDescription throws for non-existent session', async () => {
      const description: AgentDescription = {
        agentType: 'pm',
        roleInstructions: 'You are a project manager agent...',
        createdAt: new Date().toISOString()
      }

      await expect(
        manager.setAgentDescription('non-existent', 'test-feature', description)
      ).rejects.toThrow('Session not found')
    })
  })

  describe('File Persistence', () => {
    it('saveSession writes to correct path', async () => {
      // Session was created in beforeEach, check write calls
      const writeCalls = jest.mocked(fs.writeFile).mock.calls
      const sessionWrite = writeCalls.find(call =>
        (call[0] as string).includes('session_pm-feature-test-feature.json')
      )

      expect(sessionWrite).toBeDefined()
    })

    it('loadSession reads from correct path', async () => {
      jest.mocked(fs.readFile).mockClear()

      // Try to load a non-cached session
      await manager.getSessionById('pm-feature-other-feature', 'other-feature')

      // Should have tried to read from disk
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('session_pm-feature-other-feature.json'),
        'utf-8'
      )
    })

    it('handles missing files gracefully', async () => {
      // getSessionById returns null for missing session file
      const session = await manager.getSessionById('non-existent', 'test-feature')
      expect(session).toBeNull()

      // getContext returns null for missing context file
      const context = await manager.getContext(session?.id || 'non-existent', 'test-feature')
      expect(context).toBeNull()

      // getAgentDescription returns null for missing description file
      const description = await manager.getAgentDescription('non-existent', 'test-feature')
      expect(description).toBeNull()
    })

    it('creates directory before writing files', async () => {
      jest.mocked(fs.mkdir).mockClear()

      // Create a new session (should create directory)
      await manager.getOrCreateSession({
        type: 'feature',
        agentType: 'dev',
        featureId: 'new-feature'
      })

      // mkdir should have been called with recursive: true
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      )
    })
  })

  describe('Session Stats Updates', () => {
    it('updates totalMessages when adding messages', async () => {
      expect(session.stats.totalMessages).toBe(0)

      await manager.addMessage(session.id, 'test-feature', {
        role: 'user',
        content: 'Message 1'
      })

      // Retrieve fresh session
      const updatedSession = await manager.getSessionById(session.id, 'test-feature')
      expect(updatedSession?.stats.totalMessages).toBe(1)
    })

    it('resets stats when clearing messages', async () => {
      // Add some messages
      await manager.addMessage(session.id, 'test-feature', {
        role: 'user',
        content: 'Message 1'
      })

      await manager.addMessage(session.id, 'test-feature', {
        role: 'assistant',
        content: 'Response 1',
        metadata: { tokens: { input: 100, output: 200 } }
      })

      // Clear messages
      await manager.clearMessages(session.id, 'test-feature')

      // Retrieve fresh session and verify stats reset
      const updatedSession = await manager.getSessionById(session.id, 'test-feature')
      expect(updatedSession?.stats.totalMessages).toBe(0)
      expect(updatedSession?.stats.totalTokens).toBe(0)
    })

    it('updates totalTokens when message has token metadata', async () => {
      await manager.addMessage(session.id, 'test-feature', {
        role: 'assistant',
        content: 'Response with tokens',
        metadata: { tokens: { input: 150, output: 250 } }
      })

      const updatedSession = await manager.getSessionById(session.id, 'test-feature')
      expect(updatedSession?.stats.totalTokens).toBe(400) // 150 + 250
    })
  })
})
